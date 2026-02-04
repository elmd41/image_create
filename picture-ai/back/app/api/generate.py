"""
图像生成 API 模块
=================

提供图像生成功能:
- 文生图 (Text-to-Image): 根据文字描述生成图片
- 图生图 (Image-to-Image): 基于参考图片进行风格重绘

架构说明:
- DashScope (qwen-plus, qwen-vl-max): 用于提示词优化
- 火山引擎 (doubao-seedream): 用于实际图像生成
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
import time
import uuid

import numpy as np
import requests
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel

from app.config.settings import settings
from app.service.segmentation.rule_segmenter import segment_rug_layers
from app.service.volcengine_service import volcengine_service
from app.service.vision_service import VisionService, vision_service


logger = logging.getLogger(__name__)
router = APIRouter()


DEFAULT_SCENE_VALUE = "平面设计图"


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    t = (text or "").lower()
    return any(k.lower() in t for k in keywords)


def _strip_carpet_prefix(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("地毯图，"):
        return t[len("地毯图，") :].strip()
    if t.startswith("地毯，"):
        return t[len("地毯，") :].strip()
    if t.startswith("地毯图"):
        return t[len("地毯图") :].strip("， ")
    if t.startswith("地毯"):
        return t[len("地毯") :].strip("， ")
    return t


def _wrap_flat_design_production_prompt(pattern_desc: str) -> str:
    desc = (pattern_desc or "").strip()
    if not desc:
        desc = "地毯印花图案"
    return (
        f"一张绝对平面的工业级地毯印花生产稿，{desc}。"
        "正交投影视图，无透视，无立体感。完整地毯全貌。"
        "二维矢量图风格，色彩平涂，无材质纹理，无光影效果。"
        "没有任何其他元素，不是实物照片。"
    )


def _expand_simple_prompt(user_prompt: str | None) -> str:
    """对简单的用户输入进行扩写，使其更自然流畅。
    
    在参数拼接前调用，确保扩写基于用户原始输入。
    """
    p = (user_prompt or "").strip()
    if not p:
        return p
    
    # 只有简短输入才扩写（≤12字符）
    if len(p) > 12:
        return p
    
    # 调用 VisionService 进行扩写
    result = vision_service.optimize_text_prompt_with_confirm(p, None)
    expanded = result.get("optimized_prompt", p)
    return expanded if expanded else p


def _ensure_carpet_subject(user_prompt: str | None) -> str:
    p = (user_prompt or "").strip()
    if not p:
        return "地毯"

    keywords = ("地毯", "地垫", "rug", "carpet")
    if _contains_any(p, keywords):
        return p

    return f"地毯，{p}"


def _wants_perspective_or_scene(user_prompt: str) -> bool:
    """检测用户输入是否包含场景/图结构相关词汇。
    
    如果包含这些词汇，则不添加默认场景"平面设计图"。
    """
    t = (user_prompt or "").strip().lower()
    if re.search(r"(无|没有|不要|去掉|去除|移除)\s*背景", t):
        t = re.sub(r"背景", "", t)

    keywords = (
        # 透视/角度
        "透视", "斜", "侧面", "侧视", "角度", "俯视", "仰视",
        # 场景类
        "场景", "室内", "房间", "客厅", "卧室", "地板", "空间",
        "摆拍", "摆放", "铺设", "铺在",
        # 光影效果
        "阳光", "光照", "投影", "窗光", "光影", "阴影",
        # 背景/空间感
        "家具", "虚化", "背景", "景深", "空间感", "环境",
        # 纹理/特写
        "纹理", "细节", "特写", "局部", "放大", "微距",
        # 3D/效果图
        "3d", "渲染", "效果图", "建模", "三维",
        # 英文关键词
        "render", "perspective", "angled", "interior", "room",
        "scene", "floor", "lifestyle", "texture", "closeup",
    )
    return _contains_any(t, keywords)


def _is_default_scene(scene: str | None) -> bool:
    return (scene or "").strip() in ("", DEFAULT_SCENE_VALUE)


def _scene_to_prompt(scene: str | None) -> str | None:
    if _is_default_scene(scene):
        return DEFAULT_SCENE_VALUE

    return (scene or "").strip() or None


def _is_flat_mode(user_prompt: str, scene: str | None) -> bool:
    return _is_default_scene(scene)


def _flat_negative_prompt(level: int = 0) -> str:
    base = (
        "perspective, angled view, 3d, render, mockup, product photo, photo, photography, "
        "shadow, shading, lighting, highlight, reflection, vignette, "
        "room, interior, floor, wall, furniture, scene, background, "
        "rug edge, border, frame, stitching, seam, fringe, fold, curled corner, "
        "fabric texture, fiber, threads, wrinkles"
    )
    if level <= 0:
        return base
    return base + ", depth of field, bokeh, realistic, material, thickness"


def _flat_retry_prompt(prompt: str) -> str:
    p = (prompt or "").strip()
    extra = (
        " 必须正交俯视，无透视。必须满铺全画幅(full-bleed)，不要边缘，不要留白，不要背景。"
        " 必须二维平面，无阴影无高光无材质纹理，不要摄影/摆拍/渲染。"
    )
    return (p + extra).strip()


def _download_image_to_temp(url: str) -> str:
    resp = requests.get(url, timeout=45)
    resp.raise_for_status()
    suffix = ".png"
    ct = (resp.headers.get("content-type") or "").lower()
    if "jpeg" in ct or "jpg" in ct:
        suffix = ".jpg"
    elif "webp" in ct:
        suffix = ".webp"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(resp.content)
        return tmp.name


def _full_bleed_crop_fallback(image_path: str) -> Image.Image | None:
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return None

    rgb = np.asarray(img, dtype=np.uint8)
    bgr = rgb[:, :, ::-1].copy()
    try:
        masks = segment_rug_layers(bgr, alpha=0.22)
        rug = masks.get("rug_mask")
    except Exception:
        rug = None
    if rug is None or not isinstance(rug, np.ndarray) or rug.ndim != 2:
        return img

    m = rug.astype(np.uint8) > 0
    ys, xs = np.where(m)
    if ys.size == 0 or xs.size == 0:
        return img

    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0 = max(0, y0)
    x0 = max(0, x0)
    y1 = min(rgb.shape[0], y1)
    x1 = min(rgb.shape[1], x1)
    cropped = rgb[y0:y1, x0:x1, :]
    out = Image.fromarray(cropped.astype(np.uint8), mode="RGB")
    resample = getattr(Image, "Resampling", Image).LANCZOS
    out = out.resize(img.size, resample=resample)
    return out


def _save_generated_image(img: Image.Image, request: Request, prefix: str = "flat") -> str:
    filename = f"{prefix}_{uuid.uuid4().hex}.png"
    out_path = settings.GENERATED_PATH / filename
    img.save(out_path, format="PNG")
    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/generated/{filename}"


# ==================== 响应模型 ====================

class GenerateResponse(BaseModel):
    """生成响应"""
    results: list[str]  # 图片 URL 列表
    assistant_confirm: str | None = None  # 一句话复述/确认


@router.get("/proxy-image")
def proxy_image(url: str) -> Response:
    """代理拉取图片字节，用于前端下载/格式转换，避免浏览器 CORS 限制。"""
    if not url or not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="url 参数必须是 http(s) 链接")

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"图片代理失败: {e}") from e

    content_type = resp.headers.get("content-type") or "application/octet-stream"
    return Response(content=resp.content, media_type=content_type)


# ==================== API 端点 ====================

@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: Request,
    prompt: str = Form("", description="生成提示词"),
    file: UploadFile | None = File(None, description="参考图片"),
    reference_url: str | None = Form(None, description="参考图 URL"),
    context: str | None = Form(None, description="对话上下文"),
    n: int = Form(1, description="生成数量"),
    size: str = Form("1024*1024", description="图片尺寸"),
    style: str | None = Form(None, description="风格流派"),
    ratio: str | None = Form(None, description="图片比例"),
    color: str | None = Form(None, description="主体颜色"),
    scene: str | None = Form(None, description="图结构"),
) -> GenerateResponse:
    """
    图像生成接口
    
    支持三种模式:
    1. 文生图: 仅提供 prompt
    2. 图生图: 提供 prompt + file (上传图片)
    3. 多轮图生图: 提供 prompt + reference_url (基于上次生成结果)
    
    工作流程:
    1. DashScope (qwen-plus/qwen-vl-max) 优化提示词
    2. 火山引擎 (doubao-seedream) 生成图片
    """
    ratio_clean = (ratio or "").replace(" ", "")
    if ratio_clean and size == "1024*1024":
        mapped = RATIO_SIZE_MAP.get(ratio_clean)
        if mapped:
            size = mapped

    logger.info("=" * 70)
    logger.info("【收到图像生成请求】")
    logger.info("【用户输入】: %s", prompt)
    logger.info("【上传文件】: %s", file.filename if file else "无")
    logger.info("【参考URL】: %s", reference_url if reference_url else "无")
    logger.info("【图片尺寸】: %s", size)
    logger.info("【风格流派】: %s", style if style else "未指定")
    logger.info("【图片比例】: %s", ratio if ratio else "未指定")
    logger.info("【主体颜色】: %s", color if color else "未指定")
    logger.info("【图结构】: %s", scene if scene else "默认(平面设计图)")

    # 图生图与文生图业务分离：
    # - 图生图：不扩写、不注入默认场景/工业模板，仅使用用户指令 + 参数
    # - 文生图：可对短输入受限扩写，并在默认场景下套工业模板
    raw_prompt_with_subject = _ensure_carpet_subject(prompt)
    edit_prompt = _build_enhanced_prompt(
        raw_prompt_with_subject,
        style,
        ratio,
        color,
        None,
        apply_flat_template=False,
    )

    try:
        prompt_attempt = ""

        ratio_in_prompt = re.search(r"\d+\s*:\s*\d+", (prompt or "")) is not None
        preserve_reference_ratio = (not ratio) and (not ratio_in_prompt) and (size == "1024*1024")

        if file:
            prompt_attempt = edit_prompt
            logger.info("【增强提示词】: %s", prompt_attempt)
            logger.info("【模式】: 图生图 (上传图片)")
            results, assistant_confirm = _image_to_image_from_upload(
                file,
                edit_prompt,
                None,
                size,
                preserve_reference_ratio=preserve_reference_ratio,
            )
        elif reference_url:
            prompt_attempt = edit_prompt
            logger.info("【增强提示词】: %s", prompt_attempt)
            logger.info("【模式】: 图生图 (URL引用)")
            results, assistant_confirm = _image_to_image_from_url(
                reference_url,
                edit_prompt,
                None,
                size,
                preserve_reference_ratio=preserve_reference_ratio,
            )
        else:
            inferred = _infer_generate_action(edit_prompt, context)
            if inferred["action"] == "image_to_image" and inferred.get("reference_url"):
                ratio_only_from_text, ratio_val = _is_ratio_only_prompt(edit_prompt)
                if ratio_only_from_text and ratio_val:
                    prompt_attempt = _apply_ratio_fill_instruction(ratio_val, edit_prompt)
                else:
                    prompt_attempt = edit_prompt
                logger.info("【增强提示词】: %s", prompt_attempt)
                logger.info("【模式】: 图生图 (上下文推断) | reference_url=%s", inferred.get("reference_url"))
                results, assistant_confirm = _image_to_image_from_url(
                    inferred["reference_url"],
                    prompt_attempt,
                    None,
                    size,
                    preserve_reference_ratio=preserve_reference_ratio,
                )
            else:
                # 文生图：先对用户原始输入进行扩写（在参数拼接前）
                expanded_prompt = _expand_simple_prompt(prompt)
                if expanded_prompt != prompt:
                    logger.info("【扩写后】: %s", expanded_prompt)
                prompt_with_subject = _ensure_carpet_subject(expanded_prompt)
                prompt_attempt = _build_enhanced_prompt(
                    prompt_with_subject,
                    style,
                    ratio,
                    color,
                    scene,
                    apply_flat_template=True,
                )
                logger.info("【增强提示词】: %s", prompt_attempt)
                logger.info("【模式】: 文生图 (上下文推断)")
                flat_mode = _is_default_scene(scene) and (not _wants_perspective_or_scene(prompt_with_subject or ""))
                if flat_mode and bool(getattr(settings, "GENERATE_FLAT_QC_ENABLED", True)):
                    results, assistant_confirm = _text_to_image_flat_stable(request, prompt_attempt, size)
                else:
                    results, assistant_confirm = _text_to_image(
                        prompt_attempt,
                        None,
                        size,
                    )

        logger.info("【生成成功】: %s", results)
        logger.info("=" * 70)
        return GenerateResponse(results=results, assistant_confirm=assistant_confirm)

    except Exception as e:
        logger.exception("【图像生成失败】")
        logger.info("=" * 70)
        error_message = str(e)
        status_code = _get_error_status_code(error_message)
        detail = _get_error_detail(error_message)
        raise HTTPException(status_code=status_code, detail=detail) from e


# ==================== 内部函数 ====================

# 比例映射到实际尺寸
RATIO_SIZE_MAP = {
    "1:1": "1024*1024",
    "2:3": "768*1024",
    "3:4": "768*1024",
    "4:3": "1024*768",
    "9:16": "576*1024",
    "16:9": "1024*576",
    "满铺": "1024*1024",  # 默认正方形满铺
}


_SUPPORTED_BASE_SIZES: list[str] = [
    "1024*1024",
    "768*1024",
    "1024*768",
    "576*1024",
    "1024*576",
]


def _parse_size_to_wh(size: str) -> tuple[int, int] | None:
    raw = (size or "").strip().lower().replace("x", "*")
    if "*" not in raw:
        return None
    parts = raw.split("*")
    if len(parts) != 2:
        return None
    if not parts[0].strip().isdigit() or not parts[1].strip().isdigit():
        return None
    w = int(parts[0].strip())
    h = int(parts[1].strip())
    if w <= 0 or h <= 0:
        return None
    return w, h


def _pick_closest_supported_size_for_aspect(aspect: float) -> str:
    # aspect = w/h
    if aspect <= 0:
        return "1024*1024"

    best = "1024*1024"
    best_delta = float("inf")
    for s in _SUPPORTED_BASE_SIZES:
        wh = _parse_size_to_wh(s)
        if not wh:
            continue
        w, h = wh
        cand = w / float(h)
        delta = abs(cand - aspect)
        if delta < best_delta:
            best_delta = delta
            best = s
    return best


def _infer_supported_size_from_image(path: str) -> str | None:
    try:
        with Image.open(path) as img:
            w, h = img.size
    except Exception:
        return None

    if not w or not h:
        return None
    return _pick_closest_supported_size_for_aspect(w / float(h))


def _ratio_orientation_hint(ratio: str) -> str:
    return ""


def _build_enhanced_prompt(
    prompt: str,
    style: str | None,
    ratio: str | None,
    color: str | None,
    scene: str | None,
    apply_flat_template: bool = True,
) -> str:
    """
    将用户选择的参数融入到原始提示词中
    
    Args:
        prompt: 原始提示词
        style: 风格流派
        ratio: 图片比例
        color: 主体颜色
        
    Returns:
        增强后的提示词
    """
    parts = []

    def _prompt_has_explicit_ratio(text: str) -> bool:
        t = (text or "").strip()
        if not t:
            return False
        # 只把明确的比例值当作“已经写过比例”，避免“图案比例不变”这种描述吞掉参数
        return re.search(r"\d+\s*:\s*\d+", t) is not None

    def _format_color_for_prompt(raw: str) -> str:
        """将颜色值转换为自然语言描述，避免十六进制代码被打印到图片上。"""
        c = (raw or "").strip()
        if not c:
            return ""
        
        # 如果是十六进制颜色，转换为近似的颜色名称
        if c.startswith("#"):
            c_hex = c[1:]
        else:
            c_hex = c
        
        if re.fullmatch(r"[0-9a-fA-F]{6}", c_hex):
            r = int(c_hex[0:2], 16)
            g = int(c_hex[2:4], 16)
            b = int(c_hex[4:6], 16)
            # 转换为近似颜色名称
            color_name = _hex_to_color_name(r, g, b)
            return f"主体颜色为{color_name}"
        
        # 如果已经是颜色名称，直接返回
        return f"主体颜色为{c}"

    def _hex_to_color_name(r: int, g: int, b: int) -> str:
        """将 RGB 值转换为更精细的中文颜色名称，尽量接近用户选择的颜色。"""
        # 预定义的颜色表（颜色名, R, G, B）
        color_table = [
            # 红色系
            ("深红色", 139, 0, 0),
            ("酒红色", 128, 0, 32),
            ("正红色", 255, 0, 0),
            ("朱红色", 255, 69, 0),
            ("珊瑚红", 255, 127, 80),
            ("粉红色", 255, 182, 193),
            ("玫瑰红", 255, 0, 127),
            # 橙色系
            ("深橙色", 255, 140, 0),
            ("橙色", 255, 165, 0),
            ("暖橙色", 255, 155, 100),
            ("杏色", 255, 200, 160),
            ("桃色", 255, 218, 185),
            # 黄色系
            ("金黄色", 255, 215, 0),
            ("明黄色", 255, 255, 0),
            ("柠檬黄", 255, 247, 0),
            ("淡黄色", 255, 255, 224),
            ("米黄色", 245, 222, 179),
            ("土黄色", 184, 134, 11),
            # 绿色系
            ("深绿色", 0, 100, 0),
            ("森林绿", 34, 139, 34),
            ("翠绿色", 0, 128, 0),
            ("草绿色", 124, 252, 0),
            ("浅绿色", 144, 238, 144),
            ("薄荷绿", 152, 255, 152),
            ("青绿色", 0, 128, 128),
            ("橄榄绿", 128, 128, 0),
            # 蓝色系
            ("深蓝色", 0, 0, 139),
            ("海军蓝", 0, 0, 128),
            ("宝蓝色", 65, 105, 225),
            ("天蓝色", 135, 206, 235),
            ("湖蓝色", 30, 144, 255),
            ("浅蓝色", 173, 216, 230),
            ("青色", 0, 255, 255),
            # 紫色系
            ("深紫色", 75, 0, 130),
            ("紫色", 128, 0, 128),
            ("紫罗兰", 138, 43, 226),
            ("淡紫色", 216, 191, 216),
            ("薰衣草紫", 230, 230, 250),
            ("品红色", 255, 0, 255),
            # 棕色系
            ("深棕色", 101, 67, 33),
            ("棕色", 139, 69, 19),
            ("咖啡色", 111, 78, 55),
            ("巧克力色", 210, 105, 30),
            ("驼色", 193, 154, 107),
            ("米色", 245, 245, 220),
            # 灰色系
            ("黑色", 0, 0, 0),
            ("深灰色", 64, 64, 64),
            ("灰色", 128, 128, 128),
            ("浅灰色", 192, 192, 192),
            ("银色", 192, 192, 192),
            ("白色", 255, 255, 255),
            ("象牙白", 255, 255, 240),
        ]
        
        # 找到最接近的颜色
        min_dist = float("inf")
        best_name = "彩色"
        for name, cr, cg, cb in color_table:
            dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
            if dist < min_dist:
                min_dist = dist
                best_name = name
        
        return best_name
    
    # 添加风格描述（只使用参数本身，不扩写）
    if style:
        parts.append(str(style).strip())

    # 添加颜色描述（转换为自然语言，避免十六进制被打印到图片上）
    if color:
        color_desc = _format_color_for_prompt(color)
        if color_desc:
            parts.append(color_desc)

    # 添加比例描述（只使用参数本身，不扩写）
    if ratio and ratio != "满铺":
        prompt_text = (prompt or "")
        if (ratio not in prompt_text) and (not _prompt_has_explicit_ratio(prompt_text)):
            parts.append((ratio or "").strip())
    elif ratio == "满铺":
        parts.append("满铺")

    # 场景/图结构处理
    # - 默认场景：仅当 apply_flat_template=True 且用户输入不包含场景词时启用（并套用工业级生产稿模板）
    # - 非默认场景：按用户选择的场景执行
    use_default_scene = False
    scene_desc = _scene_to_prompt(scene)
    if scene_desc == DEFAULT_SCENE_VALUE:
        if apply_flat_template and (not _wants_perspective_or_scene(prompt or "")):
            use_default_scene = True
    elif scene_desc:
        if scene_desc not in (prompt or ""):
            parts.append(scene_desc)
    
    # 组合提示词
    if parts:
        param_desc = "，".join(parts)
        if prompt:
            base_content = f"{prompt}，{param_desc}"
        else:
            base_content = param_desc
    else:
        base_content = prompt or ""
    
    # 默认场景"平面设计图"前置，提高权重
    if use_default_scene:
        # 将"地毯"替换为"地毯图"以增强语义
        if base_content.startswith("地毯，"):
            base_content = "地毯图，" + base_content[3:]
        elif base_content.startswith("地毯"):
            base_content = "地毯图" + base_content[2:]
        enhanced = _wrap_flat_design_production_prompt(_strip_carpet_prefix(base_content))
    else:
        enhanced = base_content
    
    return enhanced


def _is_ratio_only_prompt(prompt: str) -> tuple[bool, str | None]:
    text = (prompt or "").strip()
    if not text:
        return False, None
    match = re.fullmatch(r"(比例[：:]?\s*)?(比例为\s*)?(?P<ratio>\d+\s*:\s*\d+)", text)
    if not match:
        return False, None
    ratio = (match.group("ratio") or "").replace(" ", "")
    return True, ratio


def _apply_ratio_fill_instruction(ratio: str, user_prompt: str | None = None) -> str:
    base = (user_prompt or "").strip()
    prefix = base if base else f"比例为{ratio}"
    return prefix


def _extract_image_urls_from_context(context: str | None) -> list[str]:
    if not context:
        return []

    urls = re.findall(r"https?://[^\s\]\)\"']+", context)
    # 仅保留看起来像图片资源的 URL（包含 /generated 或常见后缀）
    filtered: list[str] = []
    for u in urls:
        ul = u.lower()
        if "/generated" in ul or any(ul.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp")):
            filtered.append(u)
    return filtered


def _infer_generate_action(prompt: str, context: str | None) -> dict[str, str | None]:
    """根据用户语义在文生图/改图之间切换，并从上下文选择目标图片。"""
    text = (prompt or "").strip()
    image_urls = _extract_image_urls_from_context(context)

    # 意图判断：生成 vs 修改
    generate_keywords = ("生成", "画", "来一张", "给我一张", "做一张", "再生成", "重新生成", "新生成")
    edit_keywords = (
        "修改",
        "改成",
        "调整",
        "微调",
        "细调",
        "变成",
        "换成",
        "去掉",
        "增加",
        "减少",
        "优化",
        "更像",
        "保持",
    )

    # 引用上一张/历史图的典型表达
    reference_keywords = (
        "基于",
        "参考",
        "在上一张",
        "用上一张",
        "沿用上一张",
        "上一个",
        "上一张",
        "最后一张",
        "刚刚那张",
        "最新",
        "第一张",
        "最上面",
        "开头那张",
        "第",
    )

    wants_generate = any(k in text for k in generate_keywords)
    wants_edit = any(k in text for k in edit_keywords)
    wants_reference = any(k in text for k in reference_keywords)

    # 生成新图（明确“生成/来一张/给我一张”等）时，避免旧上下文污染
    if wants_generate and not wants_edit:
        return {"action": "text_to_image", "reference_url": None, "use_context": False}

    # 明确修改，且有历史图时才走图生图
    if wants_edit and image_urls:
        return {"action": "image_to_image", "reference_url": image_urls[-1], "use_context": True}

    # 生成语句里明确提到“参考/基于上一张”等，才尝试走图生图
    if wants_generate and wants_reference and image_urls:
        return {"action": "image_to_image", "reference_url": image_urls[-1], "use_context": True}

    # 其他情况（即便有历史图，也不主动过度解读为“修改”）
    return {"action": "text_to_image", "reference_url": None, "use_context": False}

def _image_to_image_from_upload(
    file: UploadFile,
    prompt: str,
    context: str | None,
    size: str,
    preserve_reference_ratio: bool = False,
) -> tuple[list[str], str | None]:
    """基于上传图片进行图生图"""
    logger.info("【处理上传图片】: %s", file.filename)
    
    suffix = _get_file_extension(file.filename)
    tmp_path = None
    
    try:
        # 保存上传文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        chosen_size = size
        if preserve_reference_ratio and (size == "1024*1024"):
            inferred = _infer_supported_size_from_image(tmp_path)
            if inferred:
                chosen_size = inferred

        return _process_image_to_image(
            tmp_path,
            prompt,
            context,
            chosen_size,
        )
        
    finally:
        _cleanup_temp_file(tmp_path)


def _image_to_image_from_url(
    url: str,
    prompt: str,
    context: str | None,
    size: str,
    preserve_reference_ratio: bool = False,
) -> tuple[list[str], str | None]:
    """基于 URL 图片进行图生图"""
    logger.info("【下载参考图片】: %s", url)
    
    tmp_path = None
    
    try:
        last_error: Exception | None = None
        response = None
        for attempt in range(3):
            try:
                response = requests.get(url, timeout=30, stream=True)
                response.raise_for_status()
                last_error = None
                break
            except Exception as e:
                last_error = e
                wait_s = 0.6 * (2**attempt)
                logger.warning("参考图下载失败(第 %d 次)，%.1fs 后重试: %s", attempt + 1, wait_s, e)
                time.sleep(wait_s)

        if response is None or last_error is not None:
            logger.warning("参考图下载最终失败，改为 URL 直传图生图（跳过视觉优化）: %s", last_error)
            return _process_image_to_image_url_direct(
                url,
                prompt,
                size,
            )

        suffix = _infer_extension_from_content_type(response.headers.get("content-type"))

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            for chunk in response.iter_content(chunk_size=256 * 1024):
                if chunk:
                    tmp.write(chunk)

        chosen_size = size
        if preserve_reference_ratio and (size == "1024*1024"):
            inferred = _infer_supported_size_from_image(tmp_path)
            if inferred:
                chosen_size = inferred

        return _process_image_to_image(
            tmp_path,
            prompt,
            context,
            chosen_size,
        )

    finally:
        _cleanup_temp_file(tmp_path)


def _process_image_to_image_url_direct(
    image_url: str,
    prompt: str,
    size: str,
) -> tuple[list[str], str | None]:
    """URL 直传给图生图接口的降级路径（避免因下载 URL 失败导致整次任务失败）。"""
    results = volcengine_service.image_to_image(
        image_url,
        prompt,
        size=size,
    )
    return results, VisionService._fallback_confirm_edit(prompt)


def _process_image_to_image(
    image_path: str,
    prompt: str,
    context: str | None,
    size: str,
) -> tuple[list[str], str | None]:
    """
    处理图生图的核心逻辑

    扩写已在 generate 入口处完成，这里直接使用传入的提示词。
    """
    ratio_only, ratio_val = _is_ratio_only_prompt(prompt)
    if ratio_only and ratio_val:
        optimized_prompt = _apply_ratio_fill_instruction(ratio_val, prompt)
    else:
        optimized_prompt = prompt
    
    assistant_confirm = VisionService._fallback_confirm_edit(prompt)

    logger.info("【图生图最终提示词】: %s", optimized_prompt)

    # 使用火山引擎图生图 API
    results = volcengine_service.image_to_image(
        image_path,
        optimized_prompt,
        size=size,
    )

    return results, assistant_confirm


def _text_to_image(
    prompt: str,
    context: str | None,
    size: str,
) -> tuple[list[str], str | None]:
    """
    处理文生图
    
    扩写已在 generate 入口处完成，这里直接使用传入的提示词。
    """
    assistant_confirm = VisionService._fallback_confirm_text(prompt)
    
    logger.info("【文生图最终提示词】: %s", prompt)
    
    # 使用火山引擎生成图片
    results = volcengine_service.text_to_image(prompt, size=size)
    return results, assistant_confirm


def _text_to_image_flat_stable(
    request: Request,
    prompt: str,
    size: str,
) -> tuple[list[str], str | None]:
    assistant_confirm = VisionService._fallback_confirm_text(prompt)
    max_attempts = int(getattr(settings, "GENERATE_FLAT_QC_MAX_RETRIES", 2))
    max_attempts = max(1, min(3, max_attempts))

    last_url: str | None = None
    last_tmp: str | None = None

    try:
        for attempt in range(max_attempts):
            seed = int.from_bytes(os.urandom(4), "big") & 0x7FFFFFFF
            negative = _flat_negative_prompt(level=1 if attempt > 0 else 0)
            prompt_run = _flat_retry_prompt(prompt) if attempt > 0 else prompt

            logger.info("【flat生成】attempt=%d/%d seed=%s", attempt + 1, max_attempts, seed)
            logger.info("【flat生成】negative: %s", negative)
            urls = volcengine_service.text_to_image(
                prompt_run,
                size=size,
                negative_prompt=negative,
                seed=seed,
            )
            if not urls:
                raise RuntimeError("volc returned empty urls")
            last_url = urls[0]

            if last_tmp:
                _cleanup_temp_file(last_tmp)
                last_tmp = None
            last_tmp = _download_image_to_temp(last_url)

            qc = vision_service.qc_flat_production_with_scores(last_tmp)
            logger.info("【flat QC】%s", qc)

            passed = bool(qc.get("pass")) if isinstance(qc, dict) else True
            if (not passed) and isinstance(qc, dict):
                scores = qc.get("scores") or {}
                if isinstance(scores, dict) and scores:
                    passed = all(float(scores.get(k, 1.0)) >= 0.8 for k in (
                        "full_bleed",
                        "no_border_blank",
                        "no_shadow",
                        "no_perspective",
                        "not_photo_render",
                    ))

            if passed:
                img = Image.open(last_tmp).convert("RGB")
                url = _save_generated_image(img, request, prefix="flat")
                return [url], assistant_confirm

        img = _full_bleed_crop_fallback(last_tmp) if last_tmp else None
        if img is None and last_tmp:
            img = Image.open(last_tmp).convert("RGB")
        if img is None:
            raise RuntimeError("flat fallback failed")

        fail_url = _save_generated_image(img, request, prefix="flat")
        return [fail_url], assistant_confirm
    finally:
        if last_tmp:
            _cleanup_temp_file(last_tmp)


def _get_file_extension(filename: str | None) -> str:
    """获取文件扩展名"""
    if filename:
        _, ext = os.path.splitext(filename)
        return ext or ".tmp"
    return ".tmp"


def _infer_extension_from_content_type(content_type: str | None) -> str:
    """根据 Content-Type 推断文件扩展名"""
    if not content_type:
        return ".png"
    
    content_type = content_type.lower()
    if "jpeg" in content_type or "jpg" in content_type:
        return ".jpg"
    if "webp" in content_type:
        return ".webp"
    return ".png"


def _cleanup_temp_file(path: str | None) -> None:
    """清理临时文件"""
    if path and os.path.exists(path):
        try:
            os.remove(path)
            logger.debug("临时文件已清理: %s", path)
        except OSError:
            logger.warning("清理临时文件失败: %s", path)


def _get_error_status_code(error_message: str) -> int:
    """根据错误信息确定 HTTP 状态码"""
    model_not_open_keywords = [
        "ModelNotOpen",
        "has not activated the model",
        "Please activate the model service",
        "Not Found",
    ]
    if any(keyword in error_message for keyword in model_not_open_keywords):
        return 404
    limit_keywords = ["SetLimitExceeded", "inference limit", "model service has been paused", "HTTP 429", " 429"]
    if any(keyword in error_message for keyword in limit_keywords):
        return 429
    quota_keywords = ["免费额度已耗尽", "AllocationQuota", "quota"]
    if any(keyword in error_message for keyword in quota_keywords):
        return 403
    return 500


def _get_error_detail(error_message: str) -> str:
    status_code = _get_error_status_code(error_message)
    if status_code == 404:
        return (
            "图像生成失败：当前 VOLC_API_KEY 所属账号未开通/未激活当前模型（404 ModelNotOpen）。"
            "请前往火山方舟控制台 Ark Console -> Model Activation 激活模型，"
            "或将后端配置中的 VOLC_IMAGE_MODEL 改为该账号已开通的模型后再试。"
        )
    if status_code == 429:
        return (
            "图像生成失败：当前账号已触发 doubao-seedream 模型推理限制（429 SetLimitExceeded）。"
            "请前往火山方舟控制台的 Model Activation 页面检查/开通对应模型权限，"
            "或调整/关闭 Safe Experience Mode 后再试。"
        )
    if status_code == 403:
        return "图像生成失败：当前账号额度/配额不足，请检查控制台配额后再试。"
    return f"图像生成失败: {error_message}"
