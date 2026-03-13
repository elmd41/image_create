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
from httpx import HTTPStatusError
import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from PIL import Image
from pydantic import BaseModel

from app.config.settings import settings
from app.service.composition.compositor import composite
from app.service.editing.layer_editor import edit_layer
from app.service.editing.prompt_translator import translate_prompt_to_params
from app.service.layered.qwen_layered_service import (
    load_layer_masks,
    pil_to_data_url,
    submit_and_poll_layered,
)
from app.service.session.session_store import (
    EditSession,
    bgr_to_png_base64,
    mask_to_png_base64,
    session_store,
)

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_DIMENSION = 2048
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB


def _mask_to_thumbnail_base64(image_bgr: np.ndarray, mask: np.ndarray) -> str:
    if image_bgr is None or mask is None:
        raise ValueError("image/mask is None")
    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("image must be HxWx3")
    if mask.ndim != 2:
        raise ValueError("mask must be HxW")
    m = (mask.astype(np.uint8) > 0)
    out = np.zeros_like(image_bgr)
    out[m] = image_bgr[m]
    return bgr_to_png_base64(out)


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
    layer: str | None = None
    layers: list[str] | None = None
    prompt: str


class EditResponse(BaseModel):
    result_png_base64: str
    layer_mask_png_base64: str
    applied_params: dict


class LayersRequest(BaseModel):
    session_id: str


class LayerItem(BaseModel):
    id: str
    name: str
    mask_png_base64: str
    thumbnail_png_base64: str


class LayersResponse(BaseModel):
    layers: list[LayerItem]


def _prepare_layered_image_data_url(pil_img: Image.Image) -> tuple[Image.Image, str]:
    """将图片压缩为分层接口可接受的 data URL（尽量保留尺寸与细节）。"""
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")

    w, h = pil_img.size
    if w > MAX_DIMENSION or h > MAX_DIMENSION:
        scale = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        new_w, new_h = int(w * scale), int(h * scale)
        pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        logger.info("【interactive/upload】Image resized to %dx%d", new_w, new_h)

    # 优先尝试 PNG（无损）
    image_url = pil_to_data_url(pil_img, "PNG")
    if len(image_url.encode("utf-8")) <= MAX_FILE_SIZE:
        return pil_img, image_url

    # 超限后尝试 JPEG + 多轮降质/降采样
    work_img = pil_img
    for quality in [90, 82, 74, 66, 58, 50]:
        image_url = pil_to_data_url(work_img, "JPEG", quality=quality)
        if len(image_url.encode("utf-8")) <= MAX_FILE_SIZE:
            logger.info("【interactive/upload】Use JPEG quality=%d", quality)
            return work_img, image_url

    for _ in range(5):
        w, h = work_img.size
        if w <= 768 or h <= 768:
            break
        new_w = max(768, int(w * 0.85))
        new_h = max(768, int(h * 0.85))
        work_img = work_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        for quality in [72, 64, 56, 50, 45]:
            image_url = pil_to_data_url(work_img, "JPEG", quality=quality)
            if len(image_url.encode("utf-8")) <= MAX_FILE_SIZE:
                logger.info(
                    "【interactive/upload】Use resized JPEG %dx%d quality=%d",
                    new_w,
                    new_h,
                    quality,
                )
                return work_img, image_url

    # 最后兜底：返回当前最小结果
    image_url = pil_to_data_url(work_img, "JPEG", quality=45)
    return work_img, image_url


@router.get("/interactive/ping")
async def interactive_ping() -> dict:
    return {"ok": True}


@router.post("/interactive/upload", response_model=UploadResponse)
async def interactive_upload(
    file: UploadFile = File(..., description="Image file (PNG/JPEG/TIFF)"),
    layer_count: int = Query(4, ge=2, le=8, description="分层数量，2-8"),
) -> UploadResponse:
    """Upload image, call Qwen-Image-Layered, create editing session."""
    logger.info("【interactive/upload】filename=%s, layer_count=%d", file.filename, layer_count)

    try:
        content = await file.read()
        pil_img = Image.open(BytesIO(content)).convert("RGB")
    except Exception as e:
        logger.warning("Image decode failed: %s", e)
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e

    pil_img, image_url = _prepare_layered_image_data_url(pil_img)
    w, h = pil_img.size
    
    rgb = np.asarray(pil_img, dtype=np.uint8)
    bgr = rgb[:, :, ::-1].copy()

    try:
        qwen_result, layer_urls = await submit_and_poll_layered(image_url=image_url, num_layers=layer_count)
        masks = await load_layer_masks(layer_urls, target_size=(w, h))
    except HTTPStatusError as e:
        logger.exception("【interactive/upload】Qwen API error: %s", e)
        if e.response.status_code == 401:
            raise HTTPException(status_code=503, detail="分层服务授权失败，API密钥可能已过期，请联系管理员") from e
        if e.response.status_code == 500:
            raise HTTPException(status_code=503, detail="分层服务暂时不可用，请稍后重试") from e
        raise HTTPException(status_code=400, detail=f"分层API调用失败: {e}") from e
    except Exception as e:
        logger.exception("【interactive/upload】Qwen layered failed")
        raise HTTPException(status_code=400, detail=f"Qwen分层失败: {e}") from e

    layer_names = [k.replace("_mask", "") for k in masks.keys() if k.startswith("layer_")]
    layer_names.sort(key=lambda x: int(x.split("_")[1]))

    meta = {
        "w": w,
        "h": h,
        "seg_mode": "qwen_layered",
        "filename": file.filename,
        "layer_count": len(layer_names),
        "layer_names": layer_names,
        "qwen_status": str(qwen_result.get("status", "")),
    }

    session = session_store.create_session(
        last_result_bgr=bgr,
        masks=masks,
        meta=meta,
    )

    logger.info("【interactive/upload】session created: %s, mode=qwen_layered, layers=%d", session.session_id, len(layer_names))

    return UploadResponse(session_id=session.session_id, meta=meta)


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

    # Qwen 分层模式：按 layer_N 顺序从上到下拾取
    layer_keys = [k for k in session.masks.keys() if k.startswith("layer_") and k.endswith("_mask")]
    if not layer_keys:
        raise HTTPException(status_code=400, detail="当前会话没有可用图层")

    layer_keys.sort(key=lambda k: int(k.split("_")[1]))

    selected_key: str | None = None
    selected_mask: np.ndarray | None = None
    for key in reversed(layer_keys):
        m = session.masks.get(key)
        if m is None:
            continue
        if req.y < m.shape[0] and req.x < m.shape[1] and int(m[req.y, req.x]) > 0:
            selected_key = key
            selected_mask = m
            break

    if selected_key is None or selected_mask is None:
        logger.info("【interactive/pick】clicked background, returning none")
        return PickResponse(layer="none", mask_png_base64=mask_to_png_base64(empty_mask))

    layer_name = selected_key.replace("_mask", "")
    logger.info("【interactive/pick】layer=%s", layer_name)
    return PickResponse(layer=layer_name, mask_png_base64=mask_to_png_base64(selected_mask))


@router.post("/interactive/layers", response_model=LayersResponse)
async def interactive_layers(req: LayersRequest) -> LayersResponse:
    """Get layer list with masks and thumbnails."""
    logger.info("【interactive/layers】session=%s", req.session_id)

    session = session_store.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    layer_keys = [k for k in session.masks.keys() if k.startswith("layer_") and k.endswith("_mask")]
    if not layer_keys:
        raise HTTPException(status_code=400, detail="当前会话没有可用图层")

    layer_keys.sort(key=lambda k: int(k.split("_")[1]))

    items: list[LayerItem] = []
    for key in layer_keys:
        mask = session.masks.get(key)
        if mask is None:
            continue
        layer_id = key.replace("_mask", "")
        items.append(
            LayerItem(
                id=layer_id,
                name=layer_id,
                mask_png_base64=mask_to_png_base64(mask),
                thumbnail_png_base64=_mask_to_thumbnail_base64(session.last_result_bgr, mask),
            )
        )

    return LayersResponse(layers=items)


# ── SAM mask 候选切换 ──

class SwitchMaskRequest(BaseModel):
    session_id: str
    mask_index: int  # 0/1/2


@router.post("/interactive/switch-mask", response_model=PickResponse)
async def switch_mask(req: SwitchMaskRequest) -> PickResponse:
    """Qwen 分层模式不支持 SAM 候选切换。"""
    _ = req
    raise HTTPException(status_code=400, detail="当前分层模式不支持候选 mask 切换")


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
        "【interactive/edit】session=%s, layer=%s, layers=%s, prompt=%s",
        req.session_id, req.layer, req.layers, req.prompt,
    )
    
    # Get session
    session = session_store.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Validate layer(s)
    valid_layers = [k.replace("_mask", "") for k in session.masks.keys() if k.startswith("layer_") and k.endswith("_mask")]
    layers = [l for l in (req.layers or []) if l]
    if not layers:
        if req.layer:
            layers = [req.layer]
    if not layers:
        raise HTTPException(status_code=422, detail="未提供要编辑的图层")
    invalid_layers = [l for l in layers if l not in valid_layers]
    if invalid_layers:
        raise HTTPException(
            status_code=422,
            detail=f"无效的层: {tuple(invalid_layers)}, 支持: {tuple(valid_layers)}",
        )
    
    # Validate prompt
    if not (req.prompt or "").strip():
        raise HTTPException(status_code=422, detail="prompt 不能为空")
    
    # Get union mask for layers
    union_mask: np.ndarray | None = None
    for layer_name in layers:
        mask = session.masks.get(f"{layer_name}_mask")
        if mask is None:
            continue
        if union_mask is None:
            union_mask = (mask.astype(np.uint8) > 0).astype(np.uint8) * 255
        else:
            union_mask = np.maximum(union_mask, (mask.astype(np.uint8) > 0).astype(np.uint8) * 255)

    if union_mask is None:
        raise HTTPException(status_code=400, detail="找不到对应 mask，请先选择图层")
    
    # Parse prompt to edit params
    try:
        edit_params = translate_prompt_to_params(req.prompt, req.layer)
    except Exception as e:
        logger.warning("prompt parse failed: %s", e)
        raise HTTPException(status_code=400, detail=f"指令解析失败: {e}") from e
    
    logger.info("【interactive/edit】parsed params: %s", edit_params)
    
    # Apply edit to layer(s)
    try:
        edited_bgr = edit_layer(session.last_result_bgr, union_mask, edit_params)
    except Exception as e:
        logger.warning("edit_layer failed: %s", e)
        raise HTTPException(status_code=500, detail=f"编辑失败: {e}") from e
    
    # Composite with hard edge (feather_radius=0 for flat designs)
    try:
        result_bgr = composite(
            session.last_result_bgr,
            edited_bgr,
            union_mask,
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
        layer_mask_png_base64=mask_to_png_base64(union_mask),
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
