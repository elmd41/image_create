from __future__ import annotations

import numpy as np


def _estimate_background_rgb_from_corners(rgb: np.ndarray) -> np.ndarray:
    h, w = int(rgb.shape[0]), int(rgb.shape[1])
    p = max(4, int(round(min(h, w) * 0.06)))
    p = min(p, h, w)

    patches = [
        rgb[0:p, 0:p, :],
        rgb[0:p, w - p : w, :],
        rgb[h - p : h, 0:p, :],
        rgb[h - p : h, w - p : w, :],
    ]
    samples = np.concatenate([x.reshape(-1, 3) for x in patches], axis=0)
    return np.median(samples.astype(np.float32), axis=0)


def _ensure_u8_mask(mask: np.ndarray) -> np.ndarray:
    m = (mask > 0).astype(np.uint8) * 255
    return m


def _dilate(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    h, w = mask.shape
    out = np.zeros_like(mask)
    ys, xs = np.where(mask > 0)
    if ys.size == 0:
        return out
    for y, x in zip(ys.tolist(), xs.tolist()):
        y0 = max(0, y - r)
        y1 = min(h, y + r + 1)
        x0 = max(0, x - r)
        x1 = min(w, x + r + 1)
        out[y0:y1, x0:x1] = 255
    return out


def _erode(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    h, w = mask.shape
    out = np.full_like(mask, 255)
    ys, xs = np.where(mask == 0)
    if ys.size == 0:
        return out
    for y, x in zip(ys.tolist(), xs.tolist()):
        y0 = max(0, y - r)
        y1 = min(h, y + r + 1)
        x0 = max(0, x - r)
        x1 = min(w, x + r + 1)
        out[y0:y1, x0:x1] = 0
    return out


def _open(mask: np.ndarray, r: int) -> np.ndarray:
    return _dilate(_erode(mask, r), r)


def _close(mask: np.ndarray, r: int) -> np.ndarray:
    return _erode(_dilate(mask, r), r)


def _largest_cc(mask: np.ndarray) -> np.ndarray:
    m = (mask > 0).astype(np.uint8)
    h, w = m.shape
    visited = np.zeros_like(m, dtype=np.uint8)
    best = []

    for y in range(h):
        for x in range(w):
            if m[y, x] == 0 or visited[y, x] != 0:
                continue
            stack = [(y, x)]
            visited[y, x] = 1
            cc = [(y, x)]
            while stack:
                cy, cx = stack.pop()
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] == 1 and visited[ny, nx] == 0:
                        visited[ny, nx] = 1
                        stack.append((ny, nx))
                        cc.append((ny, nx))
            if len(cc) > len(best):
                best = cc

    out = np.zeros((h, w), dtype=np.uint8)
    for y, x in best:
        out[y, x] = 255
    return out


def segment_rug_layers(image_bgr: np.ndarray, alpha: float = 0.25) -> dict[str, np.ndarray]:
    """A minimal rule-based segmenter.

    Returns masks with keys:
    - background_mask
    - rug_mask
    - border_mask
    - field_mask
    - rug_mask (same as rug)

    This is a heuristic segmenter intended as an MVP fallback without ML deps.
    """
    if not isinstance(image_bgr, np.ndarray) or image_bgr.ndim != 3 or image_bgr.shape[2] != 3:
        raise ValueError("image_bgr must be HxWx3 numpy array")

    img = image_bgr.astype(np.float32)
    rgb = img[:, :, ::-1]

    # Estimate background color from corners and treat pixels close to that color as background.
    # This makes the segmenter robust to light gray / gradient backgrounds.
    bg_rgb = _estimate_background_rgb_from_corners(rgb)
    diff = rgb - bg_rgb.reshape(1, 1, 3)
    dist = np.sqrt((diff * diff).sum(axis=2))
    bg_score = (rgb[:, :, 0] + rgb[:, :, 1] + rgb[:, :, 2]) / 3.0

    # Background is usually bright and close to corner color.
    bg = ((dist <= 26.0) & (bg_score >= 200.0)).astype(np.uint8) * 255
    # Also keep a hard near-white rule to reduce corner-sample failures.
    bg = np.maximum(bg, (bg_score >= 248.0).astype(np.uint8) * 255)

    # rug mask = not background
    rug = (bg == 0).astype(np.uint8) * 255

    # clean up
    rug = _largest_cc(rug)
    rug = _close(rug, 3)

    h, w = rug.shape
    # border = ring around rug
    ring = _dilate(rug, max(2, int(round(min(h, w) * 0.02))))
    inner = _erode(rug, max(2, int(round(min(h, w) * 0.04))))
    border = np.clip(ring.astype(np.int16) - inner.astype(np.int16), 0, 255).astype(np.uint8)

    # field = inside rug but not border
    field = np.clip(rug.astype(np.int16) - border.astype(np.int16), 0, 255).astype(np.uint8)

    background = (rug == 0).astype(np.uint8) * 255

    return {
        "background_mask": _ensure_u8_mask(background),
        "rug_mask": _ensure_u8_mask(rug),
        "border_mask": _ensure_u8_mask(border),
        "field_mask": _ensure_u8_mask(field),
    }
