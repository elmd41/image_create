"""
SAM (Segment Anything Model) 分割服务
=====================================

基于 Meta SAM vit_b 的实例分割，替代纯规则分割。
- 懒加载单例，首次调用时加载模型
- 自动 CUDA/CPU 检测
- 提供 embedding 缓存 + 点击分割接口
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
import torch

from app.config.settings import settings

logger = logging.getLogger(__name__)

# ==================== 数据结构 ====================


@dataclass
class MaskResult:
    """单个分割 mask 结果"""
    mask: np.ndarray      # HxW uint8 0/255
    score: float          # SAM 置信度
    area: int             # mask 像素面积


# ==================== SAM 分割器 ====================


class SamSegmenter:
    """SAM 模型懒加载单例，提供 embedding 预计算和点击分割。"""

    _instance: SamSegmenter | None = None
    _lock = Lock()

    def __init__(self) -> None:
        self._predictor: Any = None
        self._model_loaded = False
        self._device: str = "cpu"

    @classmethod
    def get_instance(cls) -> SamSegmenter:
        """获取单例（线程安全）"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = SamSegmenter()
        return cls._instance

    # ── 可用性检查 ──

    def is_available(self) -> bool:
        """检查 SAM 权重文件是否存在"""
        checkpoint = Path(settings.SAM_CHECKPOINT)
        return checkpoint.exists() and checkpoint.is_file()

    # ── 模型加载 ──

    def _resolve_device(self) -> str:
        device_cfg = (settings.SAM_DEVICE or "auto").strip().lower()
        if device_cfg == "auto":
            return "cuda" if torch.cuda.is_available() else "cpu"
        return device_cfg

    def _ensure_model(self) -> None:
        """确保模型已加载（懒加载）"""
        if self._model_loaded and self._predictor is not None:
            return

        if not self.is_available():
            raise RuntimeError(
                f"SAM 权重文件不存在: {settings.SAM_CHECKPOINT}"
            )

        from segment_anything import SamPredictor, sam_model_registry

        self._device = self._resolve_device()
        checkpoint = str(settings.SAM_CHECKPOINT)
        model_type = settings.SAM_MODEL_TYPE

        logger.info(
            "【SAM】加载模型: type=%s, device=%s, checkpoint=%s",
            model_type, self._device, checkpoint,
        )
        t0 = time.time()

        sam = sam_model_registry[model_type](checkpoint=checkpoint)
        sam.to(device=self._device)

        self._predictor = SamPredictor(sam)
        self._model_loaded = True

        logger.info("【SAM】模型加载完成，耗时 %.2fs", time.time() - t0)

    # ── Embedding 预计算 ──

    def compute_embedding(self, image_rgb: np.ndarray) -> dict:
        """
        对图像预计算 SAM embedding（调用 set_image）。

        Args:
            image_rgb: HxWx3 uint8 RGB 图像

        Returns:
            可序列化到 session 的 embedding dict，包含：
            - features: torch.Tensor (GPU/CPU)
            - input_size: tuple
            - original_size: tuple
        """
        self._ensure_model()

        t0 = time.time()
        self._predictor.set_image(image_rgb)

        embedding = {
            "features": self._predictor.features,
            "input_size": self._predictor.input_size,
            "original_size": self._predictor.original_size,
        }

        logger.info(
            "【SAM】embedding 计算完成: %dx%d, 耗时 %.2fs",
            image_rgb.shape[1], image_rgb.shape[0], time.time() - t0,
        )
        return embedding

    # ── Embedding 恢复 ──

    def _restore_embedding(self, embedding: dict) -> None:
        """将缓存的 embedding 恢复到 predictor，避免重复 set_image"""
        self._ensure_model()
        self._predictor.features = embedding["features"]
        self._predictor.input_size = embedding["input_size"]
        self._predictor.original_size = embedding["original_size"]
        self._predictor.is_image_set = True

    # ── 点击分割 ──

    def predict_at_point(
        self,
        x: int,
        y: int,
        embedding: dict,
        multimask: bool = True,
    ) -> list[MaskResult]:
        """
        根据点击坐标进行 SAM 分割。

        Args:
            x, y: 点击坐标（原始图像像素坐标）
            embedding: compute_embedding 返回的 dict
            multimask: 是否返回多候选 mask

        Returns:
            按 score 降序排列的 MaskResult 列表
        """
        self._restore_embedding(embedding)

        t0 = time.time()

        point_coords = np.array([[x, y]])
        point_labels = np.array([1])  # 1 = foreground

        masks, scores, _ = self._predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            multimask_output=multimask,
        )

        # masks: (N, H, W) bool, scores: (N,)
        results: list[MaskResult] = []
        for i in range(len(scores)):
            m = masks[i].astype(np.uint8) * 255
            results.append(MaskResult(
                mask=m,
                score=float(scores[i]),
                area=int(m.sum() // 255),
            ))

        # 按 score 降序
        results.sort(key=lambda r: r.score, reverse=True)

        logger.info(
            "【SAM】predict 完成: point=(%d,%d), %d masks, best_score=%.3f, 耗时 %.3fs",
            x, y, len(results),
            results[0].score if results else 0,
            time.time() - t0,
        )
        return results

    def predict_at_points(
        self,
        points: list[tuple[int, int]],
        labels: list[int],
        embedding: dict,
    ) -> list[MaskResult]:
        """
        多点提示分割（正/负点结合）。

        Args:
            points: [(x1,y1), (x2,y2), ...] 坐标列表
            labels: [1, 0, ...] 1=前景, 0=背景
            embedding: compute_embedding 返回的 dict
        """
        self._restore_embedding(embedding)

        point_coords = np.array(points)
        point_labels = np.array(labels)

        masks, scores, _ = self._predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            multimask_output=True,
        )

        results: list[MaskResult] = []
        for i in range(len(scores)):
            m = masks[i].astype(np.uint8) * 255
            results.append(MaskResult(
                mask=m,
                score=float(scores[i]),
                area=int(m.sum() // 255),
            ))

        results.sort(key=lambda r: r.score, reverse=True)
        return results


# ==================== 模块级便捷函数 ====================


def get_sam_segmenter() -> SamSegmenter:
    """获取 SAM 分割器单例"""
    return SamSegmenter.get_instance()


def sam_is_available() -> bool:
    """检查 SAM 是否可用"""
    return SamSegmenter.get_instance().is_available()
