from __future__ import annotations

import logging

from fastapi import APIRouter, Form, HTTPException
from pydantic import BaseModel

from app.service.composition.compositor import composite
from app.service.editing.layer_editor import edit_layer
from app.service.editing.prompt_translator import translate_prompt_to_params
from app.service.session.session_store import bgr_to_png_base64, mask_to_png_base64, session_store


logger = logging.getLogger(__name__)
router = APIRouter()


class EditApplyResponse(BaseModel):
    session_id: str
    layer: str
    edit_params: dict
    image_png_base64: str
    mask_png_base64: str


@router.post("/edit/apply", response_model=EditApplyResponse)
async def edit_apply(
    session_id: str = Form(...),
    layer: str = Form(...),
    prompt: str = Form(""),
    feather_radius: int = Form(2),
) -> EditApplyResponse:
    s = session_store.get_session(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")

    layer_key = f"{(layer or '').strip().lower()}_mask"
    mask = (s.masks or {}).get(layer_key)
    if mask is None:
        raise HTTPException(status_code=400, detail="unknown layer or missing mask")

    try:
        edit_params = translate_prompt_to_params(prompt, layer=layer)
        edited_bgr = edit_layer(s.last_result_bgr, mask, edit_params)
        out_bgr = composite(s.last_result_bgr, edited_bgr, mask, feather_radius=int(feather_radius))
        session_store.update_session(session_id, last_result_bgr=out_bgr)

        return EditApplyResponse(
            session_id=session_id,
            layer=layer,
            edit_params=edit_params,
            image_png_base64=bgr_to_png_base64(out_bgr),
            mask_png_base64=mask_to_png_base64(mask),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("edit_apply failed")
        raise HTTPException(status_code=500, detail=f"edit_apply failed: {e}") from e
