from __future__ import annotations

import base64
import io
import uuid
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image


@dataclass
class EditSession:
    session_id: str
    last_result_bgr: np.ndarray
    masks: dict[str, np.ndarray]
    meta: dict[str, Any]
    sam_embedding: dict | None = None       # SAM embedding 缓存 (features tensor等)
    image_rgb: np.ndarray | None = None     # 原始 RGB 图像
    all_sam_masks: list | None = None       # 最近一次 pick 的全部候选 mask


def _bgr_to_png_bytes(bgr: np.ndarray) -> bytes:
    if bgr is None:
        raise ValueError("image is None")
    if not isinstance(bgr, np.ndarray) or bgr.ndim != 3 or bgr.shape[2] != 3:
        raise ValueError("image must be BGR uint8 HxWx3")
    rgb = bgr[:, :, ::-1].astype(np.uint8, copy=False)
    img = Image.fromarray(rgb, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _mask_to_png_bytes(mask: np.ndarray) -> bytes:
    if mask is None:
        raise ValueError("mask is None")
    if not isinstance(mask, np.ndarray) or mask.ndim != 2:
        raise ValueError("mask must be uint8 HxW")
    img = Image.fromarray(mask.astype(np.uint8, copy=False), mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def bgr_to_png_base64(bgr: np.ndarray) -> str:
    return base64.b64encode(_bgr_to_png_bytes(bgr)).decode("utf-8")


def mask_to_png_base64(mask: np.ndarray) -> str:
    return base64.b64encode(_mask_to_png_bytes(mask)).decode("utf-8")


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, EditSession] = {}

    def create_session(
        self,
        last_result_bgr: np.ndarray,
        masks: dict[str, np.ndarray] | None = None,
        meta: dict[str, Any] | None = None,
        sam_embedding: dict | None = None,
        image_rgb: np.ndarray | None = None,
    ) -> EditSession:
        sid = uuid.uuid4().hex
        s = EditSession(
            session_id=sid,
            last_result_bgr=last_result_bgr,
            masks=masks or {},
            meta=meta or {},
            sam_embedding=sam_embedding,
            image_rgb=image_rgb,
        )
        self._sessions[sid] = s
        return s

    def get_session(self, session_id: str) -> EditSession | None:
        return self._sessions.get(session_id)

    def update_session(self, session_id: str, **kwargs: Any) -> EditSession:
        s = self._sessions.get(session_id)
        if not s:
            raise KeyError("session not found")
        for k, v in kwargs.items():
            if hasattr(s, k):
                setattr(s, k, v)
            else:
                s.meta[k] = v
        return s

    def delete_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


session_store = SessionStore()
