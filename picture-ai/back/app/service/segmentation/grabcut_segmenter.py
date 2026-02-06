"""GrabCut 辅助分割服务

当 flat_segmenter 分割效果不理想时，可使用 GrabCut 进行优化。
GrabCut 是 OpenCV 提供的交互式前景提取算法。

使用场景：
1. 作为 flat_segmenter 的 fallback
2. 用户手动校正分割结果
"""
from __future__ import annotations

import logging
import cv2
import numpy as np

logger = logging.getLogger(__name__)


def segment_with_grabcut(
    image: np.ndarray,
    initial_mask: np.ndarray | None = None,
    rect: tuple[int, int, int, int] | None = None,
    iterations: int = 5
) -> np.ndarray:
    """
    使用 GrabCut 优化分割结果
    
    Args:
        image: HxWx3 BGR 图像 (uint8)
        initial_mask: 初始 mask（可来自 flat_segmenter），0=背景, 255=前景
        rect: 前景矩形 (x, y, w, h)，与 initial_mask 二选一
        iterations: GrabCut 迭代次数
        
    Returns:
        二值 mask (0/255)
    """
    if image is None or image.ndim != 3:
        raise ValueError("image must be HxWx3 BGR array")
    
    h, w = image.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    
    if initial_mask is not None:
        # 将 flat_segmenter 的结果转换为 GrabCut 格式
        # 0=背景, 1=前景, 2=可能背景, 3=可能前景
        mask[initial_mask > 128] = cv2.GC_PR_FGD  # 3: 可能前景
        mask[initial_mask <= 128] = cv2.GC_PR_BGD  # 2: 可能背景
        
        # 根据距离中心的位置，确定一些确定的前景/背景
        # 边缘区域更可能是背景
        center_y, center_x = h // 2, w // 2
        y_coords, x_coords = np.ogrid[:h, :w]
        dist_from_center = np.sqrt((x_coords - center_x)**2 + (y_coords - center_y)**2)
        max_dist = np.sqrt(center_x**2 + center_y**2)
        
        # 中心区域的前景更确定
        core_mask = (dist_from_center < max_dist * 0.3) & (initial_mask > 128)
        mask[core_mask] = cv2.GC_FGD  # 1: 确定前景
        
        # 边缘区域的背景更确定
        edge_mask = (dist_from_center > max_dist * 0.9) & (initial_mask <= 128)
        mask[edge_mask] = cv2.GC_BGD  # 0: 确定背景
        
        mode = cv2.GC_INIT_WITH_MASK
        rect = None
        logger.info("GrabCut: using initial mask, FGD=%d, PR_FGD=%d", 
                    (mask == cv2.GC_FGD).sum(), (mask == cv2.GC_PR_FGD).sum())
    elif rect is not None:
        mode = cv2.GC_INIT_WITH_RECT
        logger.info("GrabCut: using rect %s", rect)
    else:
        # 默认使用中心 80% 区域作为前景矩形
        margin_x = int(w * 0.1)
        margin_y = int(h * 0.1)
        rect = (margin_x, margin_y, w - 2*margin_x, h - 2*margin_y)
        mode = cv2.GC_INIT_WITH_RECT
        logger.info("GrabCut: using default rect %s", rect)
    
    bgd_model = np.zeros((1, 65), dtype=np.float64)
    fgd_model = np.zeros((1, 65), dtype=np.float64)
    
    try:
        cv2.grabCut(image, mask, rect, bgd_model, fgd_model, iterations, mode)
    except cv2.error as e:
        logger.warning("GrabCut failed: %s", e)
        # 返回原始 mask 或空 mask
        if initial_mask is not None:
            return initial_mask
        return np.zeros((h, w), dtype=np.uint8)
    
    # 输出二值 mask：前景(1) 或可能前景(3) → 255
    result = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 
        255, 
        0
    ).astype(np.uint8)
    
    logger.info("GrabCut: result FG=%.1f%%", 100 * (result > 0).sum() / (h * w))
    return result


def refine_segmentation(
    image: np.ndarray,
    coarse_mask: np.ndarray,
    iterations: int = 3
) -> np.ndarray:
    """
    使用 GrabCut 精炼粗略分割结果
    
    Args:
        image: HxWx3 BGR 图像
        coarse_mask: 粗略分割 mask (0/255)
        iterations: GrabCut 迭代次数
        
    Returns:
        精炼后的 mask (0/255)
    """
    return segment_with_grabcut(image, initial_mask=coarse_mask, iterations=iterations)
