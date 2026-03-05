"""Interactive layered editing API.

Endpoints:
- POST /interactive/upload: Upload image, auto-segment, create session
- POST /interactive/pick: Click to select layer, return mask
- POST /interactive/edit: Apply edit to selected layer, return result
- POST /interactive/proxy-image: Proxy download external image (for CORS bypass)
"""

from __future__ import annotations

import base64
import logging
from io import BytesIO

import httpx
import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from PIL import Image
from pydantic import BaseModel

from app.service.composition.compositor import composite
from app.service.editing.layer_editor import edit_layer
from app.service.editing.prompt_translator import translate_prompt_to_params
from app.service.segmentation.flat_segmenter import segment_from_pil
from app.service.segmentation.grabcut_segmenter import segment_with_grabcut
from app.service.segmentation.rule_segmenter import segment_rug_layers
from app.service.segmentation.sam_segmenter import get_sam_segmenter, sam_is_available
from app.service.selection.layer_picker import pick_layer
from app.service.session.session_store import (
    EditSession,
    bgr_to_png_base64,
    mask_to_png_base64,
    session_store,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class UploadResponse(BaseModel):
    session_id: str
    meta: dict


class PickRequest(BaseModel):
    session_id: str
    x: int
    y: int


class PickResponse(BaseModel):
    layer: str
    mask_png_base64: str


class EditRequest(BaseModel):
    session_id: str
    layer: str
    prompt: str


class EditResponse(BaseModel):
    result_png_base64: str
    layer_mask_png_base64: str
    applied_params: dict


@router.get("/interactive/ping")
async def interactive_ping() -> dict:
    return {"ok": True}


@router.post("/interactive/upload", response_model=UploadResponse)
async def interactive_upload(
    file: UploadFile = File(..., description="Image file (PNG/JPEG)"),
    alpha_val: float = Query(0.22, ge=0.05, le=0.5, description="边框/内芯分割阈值，值越大边框越宽"),
    white_threshold: int = Query(245, ge=200, le=255, description="白底检测阈值，值越低越激进"),
    layer_count: int = Query(2, ge=1, le=6, description="分层数量，2=边框+内芯，N=多层"),
) -> UploadResponse:
    """Upload image, auto-segment into layers, create editing session.
    
    Segmentation strategy:
    1. SAM (首选): 预计算 image embedding，pick 时实时分割
    2. flat_segmenter (fallback): 距离变换分层
    3. rule_segmenter (fallback): 角落颜色+形态学
    4. grabcut (fallback): OpenCV GrabCut
    
    Args:
        file: 图片文件 (PNG/JPEG)
        alpha_val: 边框厚度控制，0.05-0.5，默认 0.22
        white_threshold: 背景检测敏感度，200-255，默认 245
    
    Returns session_id and metadata.
    """
    logger.info("【interactive/upload】filename=%s, alpha_val=%.2f, white_threshold=%d", file.filename, alpha_val, white_threshold)
    
    # Read and decode image
    try:
        content = await file.read()
        pil_img = Image.open(BytesIO(content))
    except Exception as e:
        logger.warning("Image decode failed: %s", e)
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e
    
    w, h = pil_img.size
    logger.info("【interactive/upload】image size: %dx%d, mode=%s", w, h, pil_img.mode)
    
    # Convert to RGB/BGR arrays
    rgb = np.asarray(pil_img.convert("RGB"), dtype=np.uint8)
    bgr = rgb[:, :, ::-1].copy()

    # ── SAM embedding 预计算 ──
    sam_embedding = None
    seg_mode = "legacy"

    if sam_is_available():
        try:
            sam = get_sam_segmenter()
            sam_embedding = sam.compute_embedding(rgb.copy())
            seg_mode = "sam"
            logger.info("【interactive/upload】SAM embedding 计算成功")
        except Exception as e:
            logger.warning("【interactive/upload】SAM embedding 失败，降级到规则分割: %s", e)
            sam_embedding = None

    # ── 背景检测（SAM 模式也需要，用于判断点击是否在背景上）──
    background_mask = np.zeros((h, w), dtype=np.uint8)
    masks: dict[str, np.ndarray] = {}

    if seg_mode == "sam":
        # SAM 模式：只需要简单的背景 mask，不预计算 border/field
        try:
            result = segment_from_pil(pil_img, alpha_val=alpha_val, white_threshold=white_threshold, layer_count=layer_count)
            background_mask = result["background_mask"]
            # 也保留旧 masks 作为 fallback
            masks = {
                "background_mask": background_mask,
                "rug_mask": result.get("rug_mask", np.zeros((h, w), dtype=np.uint8)),
            }
        except Exception:
            # 简单 fallback：假设全部是前景
            background_mask = np.zeros((h, w), dtype=np.uint8)
            masks = {"background_mask": background_mask}
    else:
        # ── Legacy 分割（SAM 不可用时）──
        seg_error: str | None = None
        try:
            result = segment_from_pil(pil_img, alpha_val=alpha_val, white_threshold=white_threshold, layer_count=layer_count)
            masks = {
                "rug_mask": result["rug_mask"],
                "border_mask": result["border_mask"],
                "field_mask": result["field_mask"],
                "background_mask": result["background_mask"],
            }
            seg_mode = result.get("_meta", {}).get("seg_mode", "flat")
            logger.info("【interactive/upload】flat_segmenter success")
        except Exception as e:
            seg_error = str(e)
            logger.warning("flat_segmenter failed: %s, trying rule_segmenter", e)
        
        if not masks:
            try:
                result = segment_rug_layers(bgr, alpha=alpha_val)
                masks = {k: result[k] for k in ("rug_mask", "border_mask", "field_mask", "background_mask")}
                seg_mode = "rule"
            except Exception as e2:
                logger.warning("rule_segmenter failed: %s, trying grabcut", e2)
                try:
                    rect = (int(w*0.1), int(h*0.1), int(w*0.8), int(h*0.8))
                    fg_mask = segment_with_grabcut(bgr, rect=rect, iterations=5)
                    masks = {
                        "rug_mask": fg_mask, "field_mask": fg_mask,
                        "border_mask": np.zeros_like(fg_mask),
                        "background_mask": (fg_mask == 0).astype(np.uint8) * 255,
                    }
                    seg_mode = "grabcut"
                except Exception as e3:
                    logger.error("All segmenters failed: flat=%s, rule=%s, grabcut=%s", seg_error, e2, e3)
                    raise HTTPException(status_code=400, detail=f"分割失败: {seg_error}") from e3
    
    # Create session
    meta = {
        "w": w,
        "h": h,
        "seg_mode": seg_mode,
        "alpha_val": alpha_val,
        "filename": file.filename,
    }
    session = session_store.create_session(
        last_result_bgr=bgr,
        masks=masks,
        meta=meta,
    )
    # 存入 SAM 数据
    session.sam_embedding = sam_embedding
    session.image_rgb = rgb
    
    logger.info("【interactive/upload】session created: %s, mode=%s", session.session_id, seg_mode)
    
    return UploadResponse(
        session_id=session.session_id,
        meta=meta,
    )


@router.post("/interactive/pick", response_model=PickResponse)
async def interactive_pick(req: PickRequest) -> PickResponse:
    """Pick layer by clicking point (x, y).
    
    SAM 模式: 实时调用 SAM predict 生成精准 mask
    Legacy 模式: 查找预计算 mask (field > border > rug > background)
    """
    logger.info("【interactive/pick】session=%s, x=%d, y=%d", req.session_id, req.x, req.y)
    
    # Get session
    session = session_store.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Validate coordinates
    h, w = session.last_result_bgr.shape[:2]
    if req.x < 0 or req.x >= w or req.y < 0 or req.y >= h:
        raise HTTPException(
            status_code=422,
            detail=f"坐标越界: x={req.x}, y={req.y}, image={w}x{h}",
        )
    
    empty_mask = np.zeros((h, w), dtype=np.uint8)

    # ── SAM 模式：实时分割 ──
    if session.sam_embedding is not None:
        # 先检查是否点击在背景上
        bg = session.masks.get("background_mask")
        if bg is not None and int(bg[req.y, req.x]) > 0:
            logger.info("【interactive/pick】SAM: clicked background, returning none")
            session.all_sam_masks = None
            return PickResponse(layer="none", mask_png_base64=mask_to_png_base64(empty_mask))

        try:
            sam = get_sam_segmenter()
            results = sam.predict_at_point(req.x, req.y, session.sam_embedding)

            if not results:
                return PickResponse(layer="none", mask_png_base64=mask_to_png_base64(empty_mask))

            # 面积过小视为无效点击
            min_area = h * w * 0.003
            best = results[0]
            if best.area < min_area:
                logger.info("【interactive/pick】SAM: mask area too small (%d < %d)", best.area, int(min_area))
                return PickResponse(layer="none", mask_png_base64=mask_to_png_base64(empty_mask))

            # 存入 session 供 edit 和 switch-mask 使用
            session.masks["active_mask"] = best.mask
            session.all_sam_masks = [
                {"mask": r.mask, "score": r.score, "area": r.area} for r in results
            ]

            logger.info("【interactive/pick】SAM: selected_region, score=%.3f, area=%d", best.score, best.area)
            return PickResponse(
                layer="selected_region",
                mask_png_base64=mask_to_png_base64(best.mask),
            )
        except Exception as e:
            logger.warning("【interactive/pick】SAM predict 失败，降级到 legacy: %s", e)
            # fall through to legacy

    # ── Legacy 模式 ──
    try:
        layer, mask = pick_layer(session.masks, req.x, req.y)
    except Exception as e:
        logger.warning("pick_layer failed: %s", e)
        raise HTTPException(status_code=400, detail=f"拾取失败: {e}") from e
    
    if layer == "background" or (mask is not None and int(mask[req.y, req.x]) == 0):
        logger.info("【interactive/pick】clicked background, returning none")
        return PickResponse(layer="none", mask_png_base64=mask_to_png_base64(empty_mask))
    
    logger.info("【interactive/pick】layer=%s", layer)
    return PickResponse(layer=layer, mask_png_base64=mask_to_png_base64(mask))


# ── SAM mask 候选切换 ──

class SwitchMaskRequest(BaseModel):
    session_id: str
    mask_index: int  # 0/1/2


@router.post("/interactive/switch-mask", response_model=PickResponse)
async def switch_mask(req: SwitchMaskRequest) -> PickResponse:
    """切换 SAM 候选 mask（精细/中等/粗略）"""
    session = session_store.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if not session.all_sam_masks or req.mask_index >= len(session.all_sam_masks):
        raise HTTPException(status_code=400, detail="无可用候选 mask")
    
    chosen = session.all_sam_masks[req.mask_index]
    session.masks["active_mask"] = chosen["mask"]
    
    logger.info("【interactive/switch-mask】切换到 mask #%d, score=%.3f, area=%d",
                req.mask_index, chosen["score"], chosen["area"])
    
    return PickResponse(
        layer="selected_region",
        mask_png_base64=mask_to_png_base64(chosen["mask"]),
    )


@router.post("/interactive/edit", response_model=EditResponse)
async def interactive_edit(req: EditRequest) -> EditResponse:
    """Apply edit to selected layer.
    
    Workflow:
    1. Parse prompt to edit params
    2. Edit layer pixels (only within mask)
    3. Composite with hard edge (no feather by default)
    4. Update session with new image
    5. Return result
    """
    logger.info(
        "【interactive/edit】session=%s, layer=%s, prompt=%s",
        req.session_id, req.layer, req.prompt,
    )
    
    # Get session
    session = session_store.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Validate layer
    valid_layers = ("field", "border", "rug", "selected_region")
    if req.layer not in valid_layers:
        raise HTTPException(
            status_code=422,
            detail=f"无效的层: {req.layer}, 支持: {valid_layers}",
        )
    
    # Validate prompt
    if not (req.prompt or "").strip():
        raise HTTPException(status_code=422, detail="prompt 不能为空")
    
    # Get mask for layer
    if req.layer == "selected_region":
        mask = session.masks.get("active_mask")
    else:
        mask = session.masks.get(f"{req.layer}_mask")
    if mask is None:
        raise HTTPException(status_code=400, detail=f"找不到对应 mask，请先点击选择区域")
    
    # Parse prompt to edit params
    try:
        edit_params = translate_prompt_to_params(req.prompt, req.layer)
    except Exception as e:
        logger.warning("prompt parse failed: %s", e)
        raise HTTPException(status_code=400, detail=f"指令解析失败: {e}") from e
    
    logger.info("【interactive/edit】parsed params: %s", edit_params)
    
    # Apply edit to layer
    try:
        edited_bgr = edit_layer(session.last_result_bgr, mask, edit_params)
    except Exception as e:
        logger.warning("edit_layer failed: %s", e)
        raise HTTPException(status_code=500, detail=f"编辑失败: {e}") from e
    
    # Composite with hard edge (feather_radius=0 for flat designs)
    try:
        result_bgr = composite(
            session.last_result_bgr,
            edited_bgr,
            mask,
            feather_radius=0,  # Hard edge for flat designs
        )
    except Exception as e:
        logger.warning("composite failed: %s", e)
        raise HTTPException(status_code=500, detail=f"合成失败: {e}") from e
    
    # Update session with new image
    session_store.update_session(req.session_id, last_result_bgr=result_bgr)
    
    logger.info("【interactive/edit】edit applied successfully")
    
    return EditResponse(
        result_png_base64=bgr_to_png_base64(result_bgr),
        layer_mask_png_base64=mask_to_png_base64(mask),
        applied_params=edit_params,
    )


class ProxyImageRequest(BaseModel):
    url: str


class ProxyImageResponse(BaseModel):
    image_base64: str
    content_type: str


@router.post("/interactive/proxy-image", response_model=ProxyImageResponse)
async def proxy_image(req: ProxyImageRequest) -> ProxyImageResponse:
    """Proxy download external image to bypass CORS restrictions.
    
    Used for loading images from external CDNs (e.g., Volcengine) that don't allow
    cross-origin requests from browsers.
    """
    logger.info("【interactive/proxy-image】url=%s", req.url[:100] + "..." if len(req.url) > 100 else req.url)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(req.url)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="下载图片超时")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"下载图片失败: {e.response.status_code}")
    except Exception as e:
        logger.warning("proxy-image failed: %s", e)
        raise HTTPException(status_code=500, detail=f"下载图片失败: {e}")
    
    content_type = response.headers.get("content-type", "image/png")
    image_base64 = base64.b64encode(response.content).decode("utf-8")
    
    logger.info("【interactive/proxy-image】downloaded %d bytes, type=%s", len(response.content), content_type)
    
    return ProxyImageResponse(
        image_base64=image_base64,
        content_type=content_type,
    )
