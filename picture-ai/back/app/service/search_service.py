"""
搜索业务服务模块
================

协调向量生成和向量检索:
- 文搜图: 文本 -> 向量 -> FAISS 检索 -> 返回图片
- 图搜图: 图片 -> 向量 -> FAISS 检索 -> 返回相似图片

使用自适应阈值过滤低质量结果。
"""

from __future__ import annotations

import logging
import os
from typing import List, Dict, Any

import numpy as np

from app.db.sqlite import image_metadata_db
from app.service.embedding import qwen_embedding_service
from app.vectorstore.faiss_manager import faiss_manager


logger = logging.getLogger(__name__)


class VectorSearchService:
    """向量搜索服务"""

    # 搜索阈值配置
    ABSOLUTE_MIN_SCORE = 0.15  # 绝对最低分数阈值
    RELATIVE_RATIO = 0.6       # 相对分数阈值比例
    HIGH_SCORE_THRESHOLD = 0.3  # 启用相对阈值的最低分数

    IMAGE_TEXT_FUSION_WEIGHT = 0.35  # 0~1，越大代表越偏向文本/参数约束

    def search_by_text(self, text: str, top_k: int) -> List[Dict[str, Any]]:
        """
        通过文本搜索相似图片
        
        Args:
            text: 搜索文本
            top_k: 返回结果数量
            
        Returns:
            搜索结果列表，每项包含 id, score, path, metadata
        """
        logger.info("执行文本搜索: '%s', top_k=%d", text, top_k)
        
        # 生成文本向量
        query_embedding = qwen_embedding_service.get_text_embedding(text)
        
        # FAISS 检索
        search_results = faiss_manager.search_vectors(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        logger.info("FAISS 返回 %d 个结果", len(search_results))
        
        return self._format_and_filter_results(search_results)

    def search_by_image_with_text(self, image_path: str, text: str, top_k: int) -> List[Dict[str, Any]]:
        """Fuse image + text embeddings for retrieval."""
        if not (text or "").strip():
            return self.search_by_image(image_path, top_k)

        img_emb = qwen_embedding_service.get_image_embedding(image_path)
        txt_emb = qwen_embedding_service.get_text_embedding(text)
        fused = self._fuse_embeddings(img_emb, txt_emb, weight=0.35)

        search_results = faiss_manager.search_vectors(
            query_embedding=fused,
            top_k=top_k,
        )
        return self._format_and_filter_results(search_results)

    @staticmethod
    def _fuse_embeddings(image_embedding: List[float], text_embedding: List[float], weight: float = 0.35) -> List[float]:
        w = float(np.clip(weight, 0.0, 1.0))
        vi = np.asarray(image_embedding, dtype=np.float32)
        vt = np.asarray(text_embedding, dtype=np.float32)
        if vi.shape != vt.shape:
            raise ValueError("embedding dim mismatch")

        def _norm(v: np.ndarray) -> np.ndarray:
            n = float(np.linalg.norm(v) + 1e-12)
            return v / n

        vi = _norm(vi)
        vt = _norm(vt)
        vf = (1.0 - w) * vi + w * vt
        vf = _norm(vf)
        return vf.astype(np.float32).tolist()

    def search_by_image(self, image_path: str, top_k: int) -> List[Dict[str, Any]]:
        """
        通过图片搜索相似图片
        
        Args:
            image_path: 查询图片路径
            top_k: 返回结果数量
            
        Returns:
            搜索结果列表，每项包含 id, score, path, metadata
        """
        logger.info("执行图片搜索: '%s', top_k=%d", image_path, top_k)
        
        # 生成图片向量
        query_embedding = qwen_embedding_service.get_image_embedding(image_path)
        
        # FAISS 检索
        search_results = faiss_manager.search_vectors(
            query_embedding=query_embedding,
            top_k=top_k,
        )
        logger.info("FAISS 返回 %d 个结果", len(search_results))
        
        return self._format_and_filter_results(search_results)

    def _format_and_filter_results(
        self,
        search_results: list[tuple[int, float]],
    ) -> list[dict[str, Any]]:
        """
        格式化并过滤搜索结果
        
        使用自适应阈值策略:
        1. 绝对阈值: 过滤分数过低的结果
        2. 相对阈值: 过滤与最高分相差过大的结果
        """
        if not search_results:
            return []

        best_score = search_results[0][1]
        logger.debug("最佳匹配分数: %.4f", best_score)

        formatted_results = []
        
        for image_id, score in search_results:
            # 绝对阈值过滤
            if score < self.ABSOLUTE_MIN_SCORE:
                logger.debug("过滤 ID=%d: 分数 %.4f < 绝对阈值 %.4f", 
                           image_id, score, self.ABSOLUTE_MIN_SCORE)
                continue

            # 相对阈值过滤 (仅当最佳分数较高时启用)
            relative_threshold = best_score * self.RELATIVE_RATIO
            if best_score > self.HIGH_SCORE_THRESHOLD and score < relative_threshold:
                logger.debug("过滤 ID=%d: 分数 %.4f < 相对阈值 %.4f",
                           image_id, score, relative_threshold)
                continue

            # 获取图片元数据
            image_info = image_metadata_db.get_image_metadata(image_id)
            if not image_info:
                logger.warning("图片 ID=%d 在数据库中不存在", image_id)
                continue

            # 构建可访问的 URL
            file_name = os.path.basename(image_info["file_path"])
            image_url = f"/static/{file_name}"

            formatted_results.append({
                "id": image_id,
                "score": score,
                "path": image_url,
                "metadata": image_info,
            })

        logger.info("过滤后返回 %d 个结果", len(formatted_results))
        return formatted_results


# 模块级单例
vector_search_service = VectorSearchService()
