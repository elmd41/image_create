"""生产稿裁切 API

提供智能裁切功能，支持：
- 满铺裁切（中心对齐）
- 等比缩放（可能留白）
- 锁定边框（保护边框完整性）
"""

from __future__ import annotations

import base64
import logging
from io import BytesIO

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class CropRequest(BaseModel):
    """裁切请求参数"""
    image_base64: str = Field(..., description="原图 Base64 编码")
    target_width_cm: float = Field(..., gt=0, description="目标宽度 (cm)")
    target_height_cm: float = Field(..., gt=0, description="目标高度 (cm)")
    dpi: int = Field(150, ge=72, le=600, description="输出 DPI")
    mode: str = Field("fill", description="裁切模式: fill=满铺, fit=等比, preserve_border=保护边框")
    border_mask_base64: str | None = Field(None, description="边框 mask Base64（锁定边框时需要）")


class CropResponse(BaseModel):
    """裁切响应"""
    result_base64: str
    actual_width_px: int
    actual_height_px: int
    scale_ratio: float
    mode_used: str


def _decode_base64_image(b64: str) -> Image.Image:
    """解码 Base64 图像"""
    # 移除可能的 data URL 前缀
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    data = base64.b64decode(b64)
    return Image.open(BytesIO(data)).convert("RGBA")


def _encode_image_base64(img: Image.Image) -> str:
    """编码图像为 Base64"""
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _crop_fill(img: Image.Image, target_w: int, target_h: int) -> tuple[Image.Image, float]:
    """满铺裁切：放大到覆盖目标尺寸，再中心裁切"""
    src_w, src_h = img.size
    target_ratio = target_w / target_h
    src_ratio = src_w / src_h
    
    if src_ratio > target_ratio:
        # 源图更宽，按高度缩放
        scale = target_h / src_h
    else:
        # 源图更高，按宽度缩放
        scale = target_w / src_w
    
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    
    # 中心裁切
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    cropped = resized.crop((left, top, left + target_w, top + target_h))
    
    return cropped, scale


def _crop_fit(img: Image.Image, target_w: int, target_h: int) -> tuple[Image.Image, float]:
    """等比缩放：保持完整内容，可能留白"""
    src_w, src_h = img.size
    scale = min(target_w / src_w, target_h / src_h)
    
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    
    # 创建白底画布
    canvas = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 255))
    paste_x = (target_w - new_w) // 2
    paste_y = (target_h - new_h) // 2
    canvas.paste(resized, (paste_x, paste_y), resized if resized.mode == "RGBA" else None)
    
    return canvas, scale


def _crop_preserve_border(
    img: Image.Image,
    border_mask: Image.Image,
    target_w: int,
    target_h: int
) -> tuple[Image.Image, float]:
    """
    边框保护裁切：
    1. 检测边框宽度
    2. 内芯区域进行拉伸/裁切
    3. 边框保持原始尺寸比例
    """
    src_w, src_h = img.size
    mask_arr = np.array(border_mask.convert("L"))
    
    # 检测边框宽度（从四边向内扫描）
    def find_border_width(arr: np.ndarray, axis: int, reverse: bool = False) -> int:
        """沿指定轴查找边框宽度"""
        if axis == 0:  # 水平方向（左右）
            profile = arr.max(axis=0)
        else:  # 垂直方向（上下）
            profile = arr.max(axis=1)
        
        if reverse:
            profile = profile[::-1]
        
        # 找到第一个非边框像素
        for i, val in enumerate(profile):
            if val < 128:  # 非边框区域
                return i
        return len(profile) // 4  # 默认取 1/4
    
    border_left = find_border_width(mask_arr, 0, False)
    border_right = find_border_width(mask_arr, 0, True)
    border_top = find_border_width(mask_arr, 1, False)
    border_bottom = find_border_width(mask_arr, 1, True)
    
    # 计算缩放比例（基于内芯区域）
    field_w = src_w - border_left - border_right
    field_h = src_h - border_top - border_bottom
    
    new_field_w = target_w - border_left - border_right
    new_field_h = target_h - border_top - border_bottom
    
    if new_field_w <= 0 or new_field_h <= 0:
        # 目标尺寸太小，退化为普通裁切
        logger.warning("目标尺寸太小，无法保护边框，退化为满铺裁切")
        return _crop_fill(img, target_w, target_h)
    
    # 计算内芯缩放比例
    scale = min(new_field_w / field_w, new_field_h / field_h)
    
    # 创建输出画布
    canvas = Image.new("RGBA", (target_w, target_h), (255, 255, 255, 0))
    
    # 1. 提取并缩放内芯
    field_box = (border_left, border_top, src_w - border_right, src_h - border_bottom)
    field = img.crop(field_box)
    field_resized = field.resize((new_field_w, new_field_h), Image.LANCZOS)
    
    # 粘贴内芯到中心
    canvas.paste(field_resized, (border_left, border_top))
    
    # 2. 提取并粘贴边框（四条边）
    # 上边框
    top_border = img.crop((0, 0, src_w, border_top))
    top_border_resized = top_border.resize((target_w, border_top), Image.LANCZOS)
    canvas.paste(top_border_resized, (0, 0))
    
    # 下边框
    bottom_border = img.crop((0, src_h - border_bottom, src_w, src_h))
    bottom_border_resized = bottom_border.resize((target_w, border_bottom), Image.LANCZOS)
    canvas.paste(bottom_border_resized, (0, target_h - border_bottom))
    
    # 左边框
    left_border = img.crop((0, border_top, border_left, src_h - border_bottom))
    left_border_resized = left_border.resize((border_left, new_field_h), Image.LANCZOS)
    canvas.paste(left_border_resized, (0, border_top))
    
    # 右边框
    right_border = img.crop((src_w - border_right, border_top, src_w, src_h - border_bottom))
    right_border_resized = right_border.resize((border_right, new_field_h), Image.LANCZOS)
    canvas.paste(right_border_resized, (target_w - border_right, border_top))
    
    return canvas, scale


@router.post("/crop/to-size", response_model=CropResponse)
async def crop_to_production_size(req: CropRequest) -> CropResponse:
    """
    生产稿智能裁切
    
    根据目标尺寸（cm）和 DPI 计算像素尺寸，支持三种裁切模式：
    - fill: 满铺裁切，中心对齐（可能裁掉边缘）
    - fit: 等比缩放，保持完整（可能留白边）
    - preserve_border: 锁定边框，内芯拉伸（需要提供边框 mask）
    """
    logger.info(
        "【crop/to-size】target=%.1f×%.1fcm, dpi=%d, mode=%s",
        req.target_width_cm, req.target_height_cm, req.dpi, req.mode
    )
    
    # 解码图像
    try:
        img = _decode_base64_image(req.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e
    
    # 计算目标像素尺寸
    target_w_px = int(req.target_width_cm * req.dpi / 2.54)
    target_h_px = int(req.target_height_cm * req.dpi / 2.54)
    
    logger.info("【crop/to-size】src=%dx%d, target=%dx%d px", img.size[0], img.size[1], target_w_px, target_h_px)
    
    # 根据模式执行裁切
    mode_used = req.mode
    if req.mode == "preserve_border":
        if not req.border_mask_base64:
            raise HTTPException(status_code=422, detail="锁定边框模式需要提供 border_mask_base64")
        try:
            border_mask = _decode_base64_image(req.border_mask_base64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"边框 mask 解析失败: {e}") from e
        result, scale = _crop_preserve_border(img, border_mask, target_w_px, target_h_px)
    elif req.mode == "fit":
        result, scale = _crop_fit(img, target_w_px, target_h_px)
    else:
        result, scale = _crop_fill(img, target_w_px, target_h_px)
        mode_used = "fill"
    
    logger.info("【crop/to-size】完成，scale=%.2f", scale)
    
    return CropResponse(
        result_base64=_encode_image_base64(result),
        actual_width_px=result.size[0],
        actual_height_px=result.size[1],
        scale_ratio=round(scale, 4),
        mode_used=mode_used,
    )
