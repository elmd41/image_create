"""K-Means 像素级换色服务

提供：
1. 主色提取 - 使用 K-Means 聚类提取图像主色调
2. 像素级换色 - 基于颜色映射进行实时换色（不调用生成模型）
"""

from __future__ import annotations

import logging
from typing import TypedDict

import cv2
import numpy as np
from sklearn.cluster import KMeans

logger = logging.getLogger(__name__)


class ColorInfo(TypedDict):
    """颜色信息"""
    rgb: list[int]
    hex: str
    ratio: float


class ColorTransferService:
    """K-Means 像素级换色服务"""
    
    def extract_palette(
        self, 
        image: np.ndarray, 
        n_colors: int = 5,
        mask: np.ndarray | None = None
    ) -> list[ColorInfo]:
        """
        提取图像主色调
        
        Args:
            image: HxWx3 RGB 图像
            n_colors: 提取颜色数量
            mask: 可选 mask，只分析 mask 内的像素
        
        Returns:
            按占比排序的颜色列表
        """
        logger.info("【extract_palette】开始提取 %d 个主色调", n_colors)
        
        # 如果有 mask，只取 mask 内的像素
        if mask is not None:
            mask_flat = mask.flatten() > 128
            pixels = image.reshape(-1, 3)[mask_flat]
        else:
            pixels = image.reshape(-1, 3)
        
        if len(pixels) == 0:
            logger.warning("无有效像素，返回空结果")
            return []
        
        # K-Means 聚类
        pixels_float = pixels.astype(np.float32)
        kmeans = KMeans(n_clusters=min(n_colors, len(pixels)), random_state=42, n_init=10)
        kmeans.fit(pixels_float)
        
        # 统计每个颜色的占比
        labels, counts = np.unique(kmeans.labels_, return_counts=True)
        total = len(pixels)
        
        # 按占比排序
        sorted_indices = np.argsort(-counts)
        
        colors: list[ColorInfo] = []
        for idx in sorted_indices:
            rgb = kmeans.cluster_centers_[idx].astype(np.uint8).tolist()
            hex_color = "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])
            ratio = counts[idx] / total
            colors.append({
                "rgb": rgb,
                "hex": hex_color,
                "ratio": round(ratio, 4)
            })
        
        logger.info("【extract_palette】提取完成: %s", [c["hex"] for c in colors])
        return colors
    
    def apply_color_mapping(
        self, 
        image: np.ndarray, 
        source_colors: list[list[int]], 
        target_colors: list[list[int]],
        tolerance: int = 40,
        preserve_luminance: bool = True
    ) -> np.ndarray:
        """
        应用颜色映射（实时换色）
        
        Args:
            image: HxWx3 RGB 图像
            source_colors: 源颜色列表 [[R,G,B], ...]
            target_colors: 目标颜色列表 [[R,G,B], ...]
            tolerance: 颜色匹配容差（0-255）
            preserve_luminance: 是否保留原始亮度
        
        Returns:
            换色后的图像
        """
        logger.info(
            "【apply_color_mapping】映射 %d 个颜色，tolerance=%d, preserve_luminance=%s",
            len(source_colors), tolerance, preserve_luminance
        )
        
        result = image.copy()
        
        for src, tgt in zip(source_colors, target_colors):
            src_arr = np.array(src, dtype=np.int32)
            tgt_arr = np.array(tgt, dtype=np.uint8)
            
            # 计算颜色距离（欧氏距离）
            diff = result.astype(np.int32) - src_arr
            dist = np.sqrt((diff ** 2).sum(axis=2))
            mask = dist <= tolerance
            
            if not mask.any():
                continue
            
            if preserve_luminance:
                # HSV 空间换色，保留 Value（亮度）
                result_hsv = cv2.cvtColor(result, cv2.COLOR_RGB2HSV).astype(np.float32)
                tgt_rgb = np.array([[tgt_arr]], dtype=np.uint8)
                tgt_hsv = cv2.cvtColor(tgt_rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
                
                # 只修改 Hue 和 Saturation
                result_hsv[mask, 0] = tgt_hsv[0, 0, 0]
                result_hsv[mask, 1] = tgt_hsv[0, 0, 1]
                
                result = cv2.cvtColor(result_hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
            else:
                # 直接替换颜色
                result[mask] = tgt_arr
        
        logger.info("【apply_color_mapping】换色完成")
        return result
    
    def generate_color_variants(
        self,
        image: np.ndarray,
        base_colors: list[list[int]],
        hue_shifts: list[int] = [-30, -15, 15, 30]
    ) -> list[tuple[list[list[int]], np.ndarray]]:
        """
        生成色相变体
        
        Args:
            image: 原图 RGB
            base_colors: 基准颜色列表
            hue_shifts: 色相偏移列表（度数）
        
        Returns:
            [(new_colors, result_image), ...] 变体列表
        """
        variants = []
        
        for shift in hue_shifts:
            # 计算新颜色
            new_colors = []
            for color in base_colors:
                rgb = np.array([[color]], dtype=np.uint8)
                hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[0, 0]
                # 色相偏移（0-179 范围）
                new_h = (hsv[0] + shift // 2) % 180
                new_hsv = np.array([[[new_h, hsv[1], hsv[2]]]], dtype=np.uint8)
                new_rgb = cv2.cvtColor(new_hsv, cv2.COLOR_HSV2RGB)[0, 0].tolist()
                new_colors.append(new_rgb)
            
            # 应用换色
            result = self.apply_color_mapping(image, base_colors, new_colors)
            variants.append((new_colors, result))
        
        return variants


# 单例
color_transfer_service = ColorTransferService()
