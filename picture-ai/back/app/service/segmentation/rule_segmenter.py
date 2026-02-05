from __future__ import annotations

import cv2
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
    """使用 OpenCV 进行膨胀操作，比 Python 循环快 100 倍以上"""
    if r <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(mask, kernel, iterations=1)


def _erode(mask: np.ndarray, r: int) -> np.ndarray:
    """使用 OpenCV 进行腐蚀操作，比 Python 循环快 100 倍以上"""
    if r <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
    return cv2.erode(mask, kernel, iterations=1)


def _open(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def _close(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * r + 1, 2 * r + 1))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def _largest_cc(mask: np.ndarray) -> np.ndarray:
    """使用 OpenCV 的连通域分析，比 Python 循环快 100 倍以上"""
    m = (mask > 0).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
    
    if num_labels <= 1:
        return np.zeros_like(mask)
    
    # 找到最大的非背景连通域（标签0是背景）
    # stats[:, cv2.CC_STAT_AREA] 是每个连通域的面积
    areas = stats[1:, cv2.CC_STAT_AREA]  # 跳过背景
    if len(areas) == 0:
        return np.zeros_like(mask)
    
    largest_label = np.argmax(areas) + 1  # +1 因为跳过了背景
    out = (labels == largest_label).astype(np.uint8) * 255
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
