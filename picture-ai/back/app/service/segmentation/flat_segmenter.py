"""Flat design image segmenter for carpet production drafts.

Optimized for:
- White/transparent background flat designs
- Clean line art with no perspective
- Alpha channel or white background detection

Segmentation strategy:
1. Alpha channel detection (PNG with transparency)
2. White background threshold (fallback)
3. Largest contour fill (avoid internal white patterns breaking rug_mask)
4. Distance Transform for border/field separation

Performance: Uses OpenCV for all heavy operations (100x+ faster than Python loops)
"""

from __future__ import annotations

import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def _ensure_u8_mask(mask: np.ndarray) -> np.ndarray:
    """Ensure mask is uint8 0/255."""
    return (mask > 0).astype(np.uint8) * 255


def _morphology_close(mask: np.ndarray, kernel_size: int = 3) -> np.ndarray:
    """Morphological close using OpenCV (fast)."""
    if kernel_size <= 1:
        return mask
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def _flood_fill_from_edges(mask: np.ndarray) -> np.ndarray:
    """Flood fill background from image edges using OpenCV floodFill.
    
    This helps when the rug has internal white patterns that shouldn't be
    treated as background.
    """
    h, w = mask.shape
    
    # Create a mask for floodFill (needs to be 2 pixels larger)
    flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    
    # Copy input mask for flood fill
    fill_img = mask.copy()
    
    # Flood fill from all four corners and edges
    # We fill the background (white=255) starting from edges
    seed_points = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    
    for seed_y, seed_x in seed_points:
        if fill_img[seed_y, seed_x] > 0:
            cv2.floodFill(fill_img, flood_mask, (seed_x, seed_y), 128)
    
    # Also fill from edge pixels
    for x in range(w):
        if fill_img[0, x] > 0 and fill_img[0, x] != 128:
            cv2.floodFill(fill_img, flood_mask, (x, 0), 128)
        if fill_img[h - 1, x] > 0 and fill_img[h - 1, x] != 128:
            cv2.floodFill(fill_img, flood_mask, (x, h - 1), 128)
    for y in range(h):
        if fill_img[y, 0] > 0 and fill_img[y, 0] != 128:
            cv2.floodFill(fill_img, flood_mask, (0, y), 128)
        if fill_img[y, w - 1] > 0 and fill_img[y, w - 1] != 128:
            cv2.floodFill(fill_img, flood_mask, (w - 1, y), 128)
    
    # Foreground = pixels not filled (not reachable from edges)
    # fill_img == 128 means background (filled from edges)
    # fill_img == 255 means internal white (not filled) - treat as foreground
    # fill_img == 0 means original foreground
    foreground = (fill_img != 128).astype(np.uint8) * 255
    return foreground


def _largest_connected_component(mask: np.ndarray) -> np.ndarray:
    """Keep only the largest connected component using OpenCV."""
    m = (mask > 0).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=4)
    
    if num_labels <= 1:
        return np.zeros_like(mask)
    
    # Find largest non-background component
    areas = stats[1:, cv2.CC_STAT_AREA]
    if len(areas) == 0:
        return np.zeros_like(mask)
    
    largest_label = np.argmax(areas) + 1
    return (labels == largest_label).astype(np.uint8) * 255


def _distance_transform(mask: np.ndarray) -> np.ndarray:
    """Distance transform using OpenCV (Euclidean distance)."""
    m = (mask > 0).astype(np.uint8)
    dist = cv2.distanceTransform(m, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    return dist


def segment_flat_design(
    image: np.ndarray,
    alpha: np.ndarray | None = None,
    alpha_val: float = 0.22,
    white_threshold: int = 250,
) -> dict[str, np.ndarray]:
    """Segment a flat carpet design into layers.
    
    Args:
        image: HxWx3 BGR or RGB image (uint8)
        alpha: Optional HxW alpha channel (uint8, 0=transparent, 255=opaque)
        alpha_val: Distance transform threshold ratio for border/field split
        white_threshold: Grayscale threshold for white background detection
    
    Returns:
        Dict with keys: rug_mask, border_mask, field_mask, background_mask
        All masks are uint8 0/255.
    
    Raises:
        ValueError: If segmentation fails (no foreground found, etc.)
    """
    if image is None or not isinstance(image, np.ndarray):
        raise ValueError("image must be a numpy array")
    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("image must be HxWx3")
    
    h, w = image.shape[:2]
    logger.info("flat_segmenter: input size %dx%d, alpha_val=%.2f", w, h, alpha_val)
    
    # Step 1: Get foreground mask
    rug_mask: np.ndarray | None = None
    seg_mode = "unknown"
    
    # Try alpha channel first
    if alpha is not None and isinstance(alpha, np.ndarray) and alpha.shape == (h, w):
        # Foreground = opaque pixels
        rug_mask = (alpha > 0).astype(np.uint8) * 255
        seg_mode = "alpha"
        logger.info("flat_segmenter: using alpha channel")
    
    # Fallback to white background detection
    if rug_mask is None or rug_mask.sum() == 0:
        # Convert to grayscale
        if image.shape[2] == 3:
            # Assume BGR, convert to grayscale
            gray = (0.114 * image[:, :, 0] + 0.587 * image[:, :, 1] + 0.299 * image[:, :, 2]).astype(np.float32)
        else:
            gray = image[:, :, 0].astype(np.float32)
        
        # Background = near white
        bg_mask = (gray >= white_threshold).astype(np.uint8) * 255
        
        # Use flood fill from edges to handle internal white patterns
        rug_mask = _flood_fill_from_edges(bg_mask)
        seg_mode = "white_threshold"
        logger.info("flat_segmenter: using white threshold (>=%d)", white_threshold)
    
    # Step 2: Clean up with small morphological close (3x3 only per spec)
    rug_mask = _morphology_close(rug_mask, kernel_size=3)
    
    # Step 3: Keep largest connected component
    rug_mask = _largest_connected_component(rug_mask)
    
    # Validate: must have meaningful foreground
    fg_pixels = int((rug_mask > 0).sum())
    total_pixels = h * w
    fg_ratio = fg_pixels / total_pixels if total_pixels > 0 else 0
    
    if fg_ratio < 0.01:
        raise ValueError(f"Segmentation failed: foreground too small ({fg_ratio:.1%})")
    if fg_ratio > 0.99:
        raise ValueError(f"Segmentation failed: foreground too large ({fg_ratio:.1%}), likely no background")
    
    logger.info("flat_segmenter: rug_mask covers %.1f%% of image", fg_ratio * 100)
    
    # Step 4: Distance Transform for border/field separation
    dist = _distance_transform(rug_mask)
    max_dist = float(dist.max())
    
    if max_dist < 2:
        # Very thin rug, treat all as field
        border_mask = np.zeros((h, w), dtype=np.uint8)
        field_mask = rug_mask.copy()
    else:
        threshold = alpha_val * max_dist
        # Border = pixels with distance <= threshold (outer ring)
        border_mask = ((dist > 0) & (dist <= threshold)).astype(np.uint8) * 255
        # Field = pixels with distance > threshold (inner area)
        field_mask = (dist > threshold).astype(np.uint8) * 255
    
    # Background = not rug
    background_mask = (rug_mask == 0).astype(np.uint8) * 255
    
    logger.info(
        "flat_segmenter: border=%.1f%%, field=%.1f%%, bg=%.1f%%",
        100 * (border_mask > 0).sum() / total_pixels,
        100 * (field_mask > 0).sum() / total_pixels,
        100 * (background_mask > 0).sum() / total_pixels,
    )
    
    return {
        "rug_mask": _ensure_u8_mask(rug_mask),
        "border_mask": _ensure_u8_mask(border_mask),
        "field_mask": _ensure_u8_mask(field_mask),
        "background_mask": _ensure_u8_mask(background_mask),
        "_meta": {
            "seg_mode": seg_mode,
            "alpha_val": alpha_val,
            "max_dist": max_dist,
            "fg_ratio": fg_ratio,
        },
    }


def segment_from_pil(
    pil_image: Image.Image,
    alpha_val: float = 0.22,
) -> dict[str, np.ndarray]:
    """Convenience wrapper for PIL Image input.
    
    Handles RGBA/RGB/LA/L modes automatically.
    """
    if pil_image is None:
        raise ValueError("pil_image is None")
    
    # Convert to RGBA to check for alpha
    if pil_image.mode in ("RGBA", "LA", "PA"):
        rgba = pil_image.convert("RGBA")
        arr = np.asarray(rgba, dtype=np.uint8)
        rgb = arr[:, :, :3]
        alpha = arr[:, :, 3]
        # Convert RGB to BGR for consistency
        bgr = rgb[:, :, ::-1].copy()
    else:
        rgb = np.asarray(pil_image.convert("RGB"), dtype=np.uint8)
        bgr = rgb[:, :, ::-1].copy()
        alpha = None
    
    return segment_flat_design(bgr, alpha=alpha, alpha_val=alpha_val)
