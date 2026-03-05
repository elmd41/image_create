from __future__ import annotations

import logging
import os
import shutil
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.service.segmentation.rule_segmenter import segment_rug_layers
from app.service.session.session_store import bgr_to_png_base64, session_store


logger = logging.getLogger(__name__)
router = APIRouter()


class SessionCreateResponse(BaseModel):
    session_id: str
    image_png_base64: str
    masks: dict[str, str]


@router.post("/session/create", response_model=SessionCreateResponse)
async def session_create(
    file: UploadFile = File(...),
    alpha: float = Form(0.25),
) -> SessionCreateResponse:
    suffix = os.path.splitext(file.filename or "")[1] or ".png"
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # load image (BGR)
        from PIL import Image
        import numpy as np

        img = Image.open(tmp_path).convert("RGB")
        rgb = np.asarray(img, dtype=np.uint8)
        bgr = rgb[:, :, ::-1].copy()

        masks = segment_rug_layers(bgr, alpha=float(alpha))
        s = session_store.create_session(last_result_bgr=bgr, masks=masks, meta={"alpha": float(alpha)})

        # Return image and masks as base64 PNG. For masks, use session_store helper for 1-channel.
        from app.service.session.session_store import mask_to_png_base64

        masks_b64 = {k: mask_to_png_base64(v) for k, v in masks.items()}
        return SessionCreateResponse(
            session_id=s.session_id,
            image_png_base64=bgr_to_png_base64(bgr),
            masks=masks_b64,
        )
    except Exception as e:
        logger.exception("session_create failed")
        raise HTTPException(status_code=500, detail=f"session_create failed: {e}") from e
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
