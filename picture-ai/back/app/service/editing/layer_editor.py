from __future__ import annotations

import numpy as np


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = (hex_color or "").strip().lstrip("#")
    if len(h) != 6:
        raise ValueError("invalid hex color")
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return r, g, b


def edit_layer(image_bgr: np.ndarray, mask: np.ndarray, edit_params: dict) -> np.ndarray:
    """Edit image within mask.

    This is an MVP implementation with simple pixel operations.
    """
    if image_bgr is None or mask is None:
        raise ValueError("image/mask is None")
    if image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("image must be HxWx3")
    if mask.ndim != 2:
        raise ValueError("mask must be HxW")

    mode = (edit_params or {}).get("mode")
    out = image_bgr.astype(np.float32).copy()
    m = (mask.astype(np.uint8) > 0)

    if mode == "recolor":
        rgb = _hex_to_rgb(str(edit_params.get("color_hex") or ""))
        # convert to bgr
        bgr = np.array([rgb[2], rgb[1], rgb[0]], dtype=np.float32)
        # blend with original to keep texture
        alpha = float(edit_params.get("alpha", 0.65))
        alpha = max(0.0, min(1.0, alpha))
        out[m] = (1 - alpha) * out[m] + alpha * bgr

    elif mode in ("brightness", "saturation", "contrast"):
        delta = float(edit_params.get("delta", 0.0))
        delta = max(-1.0, min(1.0, delta))

        # convert to rgb for simple ops
        rgb = out[:, :, ::-1]
        if mode == "brightness":
            rgb[m] = rgb[m] * (1.0 + delta)
        elif mode == "contrast":
            mean = rgb[m].mean(axis=0, keepdims=True) if rgb[m].size else np.array([[127.0, 127.0, 127.0]])
            rgb[m] = (rgb[m] - mean) * (1.0 + delta) + mean
        else:  # saturation
            gray = (0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2])
            gray3 = np.stack([gray, gray, gray], axis=2)
            rgb[m] = (1.0 + delta) * rgb[m] + (-delta) * gray3[m]

        out = rgb[:, :, ::-1]

    else:
        # unknown mode: no-op
        return image_bgr

    out = np.clip(out, 0, 255).astype(np.uint8)
    return out
