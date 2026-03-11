from __future__ import annotations

import logging

from fastapi import APIRouter, Form, HTTPException
from pydantic import BaseModel

from app.service.selection.layer_picker import pick_layer
from app.service.session.session_store import mask_to_png_base64, session_store


logger = logging.getLogger(__name__)
router = APIRouter()


class PickLayerResponse(BaseModel):
    session_id: str
    x: int
    y: int
    layer: str
    mask_png_base64: str


@router.post("/select/pick", response_model=PickLayerResponse)
async def select_pick(
    session_id: str = Form(...),
    x: int = Form(...),
    y: int = Form(...),
) -> PickLayerResponse:
    s = session_store.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")

    x = int(x)
    y = int(y)

    if s.last_result_bgr is not None:
        height, width = s.last_result_bgr.shape[:2]
        if x >= width or y >= height:
            raise HTTPException(status_code=400, detail="x/y out of bounds")

    try:
        layer, mask = pick_layer(s.masks, x, y)
        return PickLayerResponse(
            session_id=session_id,
            x=x,
            y=y,
            layer=layer,
            mask_png_base64=mask_to_png_base64(mask),
        )
    except Exception as e:
        logger.exception("select_pick failed")
        raise HTTPException(status_code=500, detail=f"select_pick failed: {e}") from e
