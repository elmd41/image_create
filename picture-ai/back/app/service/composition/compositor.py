from __future__ import annotations

import numpy as np


def _box_blur(mask_f: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask_f
    h, w = mask_f.shape
    out = np.zeros_like(mask_f)
    # simple integral image
    ii = np.pad(mask_f, ((1, 0), (1, 0)), mode="constant").cumsum(axis=0).cumsum(axis=1)
    k = 2 * r + 1
    for y in range(h):
        y0 = max(0, y - r)
        y1 = min(h - 1, y + r)
        for x in range(w):
            x0 = max(0, x - r)
            x1 = min(w - 1, x + r)
            # integral indices are +1
            s = ii[y1 + 1, x1 + 1] - ii[y0, x1 + 1] - ii[y1 + 1, x0] + ii[y0, x0]
            area = float((y1 - y0 + 1) * (x1 - x0 + 1))
            out[y, x] = s / area
    return out


def composite(
    base_bgr: np.ndarray,
    edited_bgr: np.ndarray,
    mask: np.ndarray,
    feather_radius: int = 2,
) -> np.ndarray:
    """Alpha composite with feathered mask."""
    if base_bgr.shape != edited_bgr.shape:
        raise ValueError("base and edited shape mismatch")
    if mask.shape[:2] != base_bgr.shape[:2]:
        raise ValueError("mask shape mismatch")

    m = (mask.astype(np.float32) / 255.0)
    m = np.clip(m, 0.0, 1.0)
    if feather_radius and feather_radius > 0:
        m = _box_blur(m, int(feather_radius))
        m = np.clip(m, 0.0, 1.0)

    m3 = np.repeat(m[:, :, None], 3, axis=2)
    out = (1.0 - m3) * base_bgr.astype(np.float32) + m3 * edited_bgr.astype(np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)
