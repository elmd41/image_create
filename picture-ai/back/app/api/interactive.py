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
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

from app.service.composition.compositor import composite
from app.service.editing.layer_editor import edit_layer
from app.service.editing.prompt_translator import translate_prompt_to_params
from app.service.segmentation.flat_segmenter import segment_from_pil
from app.service.segmentation.rule_segmenter import segment_rug_layers
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
) -> UploadResponse:
    """Upload image, auto-segment into layers, create editing session.
    
    Segmentation strategy:
    1. Try flat_segmenter (optimized for flat designs with alpha/white background)
    2. Fallback to rule_segmenter if flat fails
    
    Returns session_id and metadata.
    """
    logger.info("【interactive/upload】filename=%s", file.filename)
    
    # Read and decode image
    try:
        content = await file.read()
        pil_img = Image.open(BytesIO(content))
    except Exception as e:
        logger.warning("Image decode failed: %s", e)
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e
    
    w, h = pil_img.size
    logger.info("【interactive/upload】image size: %dx%d, mode=%s", w, h, pil_img.mode)
    
    # Try flat segmenter first
    seg_mode = "flat"
    alpha_val = 0.22
    masks: dict[str, np.ndarray] | None = None
    seg_error: str | None = None
    
    try:
        result = segment_from_pil(pil_img, alpha_val=alpha_val)
        masks = {
            "rug_mask": result["rug_mask"],
            "border_mask": result["border_mask"],
            "field_mask": result["field_mask"],
            "background_mask": result["background_mask"],
        }
        meta_info = result.get("_meta", {})
        seg_mode = meta_info.get("seg_mode", "flat")
        logger.info("【interactive/upload】flat_segmenter success, mode=%s", seg_mode)
    except Exception as e:
        seg_error = str(e)
        logger.warning("flat_segmenter failed: %s, trying rule_segmenter", e)
    
    # Fallback to rule segmenter
    if masks is None:
        try:
            # Convert to BGR for rule_segmenter
            rgb = np.asarray(pil_img.convert("RGB"), dtype=np.uint8)
            bgr = rgb[:, :, ::-1].copy()
            result = segment_rug_layers(bgr, alpha=alpha_val)
            masks = {
                "rug_mask": result["rug_mask"],
                "border_mask": result["border_mask"],
                "field_mask": result["field_mask"],
                "background_mask": result["background_mask"],
            }
            seg_mode = "rule"
            logger.info("【interactive/upload】rule_segmenter success")
        except Exception as e2:
            logger.error("Both segmenters failed: flat=%s, rule=%s", seg_error, e2)
            raise HTTPException(
                status_code=400,
                detail=f"分割失败: flat={seg_error}, rule={e2}",
            ) from e2
    
    # Convert image to BGR ndarray for session storage
    rgb = np.asarray(pil_img.convert("RGB"), dtype=np.uint8)
    bgr = rgb[:, :, ::-1].copy()
    
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
    
    logger.info("【interactive/upload】session created: %s", session.session_id)
    
    return UploadResponse(
        session_id=session.session_id,
        meta=meta,
    )


@router.post("/interactive/pick", response_model=PickResponse)
async def interactive_pick(req: PickRequest) -> PickResponse:
    """Pick layer by clicking point (x, y).
    
    Returns layer name and mask as base64 PNG.
    Layer priority: field > border > rug > background > none
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
    
    # Pick layer
    try:
        layer, mask = pick_layer(session.masks, req.x, req.y)
    except Exception as e:
        logger.warning("pick_layer failed: %s", e)
        raise HTTPException(status_code=400, detail=f"拾取失败: {e}") from e
    
    # Check if clicked on background
    if layer == "background" or (mask is not None and int(mask[req.y, req.x]) == 0):
        # Return "none" for background clicks
        logger.info("【interactive/pick】clicked background, returning none")
        # Return empty mask for "none"
        empty_mask = np.zeros((h, w), dtype=np.uint8)
        return PickResponse(
            layer="none",
            mask_png_base64=mask_to_png_base64(empty_mask),
        )
    
    logger.info("【interactive/pick】layer=%s", layer)
    
    return PickResponse(
        layer=layer,
        mask_png_base64=mask_to_png_base64(mask),
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
    valid_layers = ("field", "border", "rug")
    if req.layer not in valid_layers:
        raise HTTPException(
            status_code=422,
            detail=f"无效的层: {req.layer}, 支持: {valid_layers}",
        )
    
    # Validate prompt
    if not (req.prompt or "").strip():
        raise HTTPException(status_code=422, detail="prompt 不能为空")
    
    # Get mask for layer
    mask_key = f"{req.layer}_mask"
    mask = session.masks.get(mask_key)
    if mask is None:
        raise HTTPException(status_code=400, detail=f"找不到 {mask_key}")
    
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
