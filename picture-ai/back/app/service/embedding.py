"""
向量生成服务模块
================

基于阿里云 DashScope (通义千问) 的多模态 Embedding 服务:
- 文本转向量: 将文本描述转换为向量表示
- 图片转向量: 将图片转换为向量表示

向量可用于相似度搜索和检索任务。
"""

from __future__ import annotations

import logging
import os
import tempfile
from http import HTTPStatus

import dashscope
from dashscope import MultiModalEmbedding
from PIL import Image

from app.config.settings import settings


logger = logging.getLogger(__name__)

# 初始化 DashScope API Key
dashscope.api_key = settings.API_KEY
os.environ["DASHSCOPE_API_KEY"] = settings.API_KEY


class EmbeddingService:
    """向量生成服务"""

    IMAGE_SIZE_LIMIT_BYTES = 3 * 1024 * 1024

    @staticmethod
    def _prepare_image_for_embedding(image_path: str) -> tuple[str, str | None]:
        if not image_path or not os.path.exists(image_path):
            return image_path, None

        try:
            file_size = os.path.getsize(image_path)
        except OSError:
            return image_path, None

        if file_size <= EmbeddingService.IMAGE_SIZE_LIMIT_BYTES:
            return image_path, None

        try:
            img = Image.open(image_path)
        except Exception:
            return image_path, None

        img = img.convert("RGB")

        max_dim = max(img.size)
        if max_dim > 1600:
            scale = 1600 / max_dim
            img = img.resize((max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale))))

        quality_steps = (88, 80, 72, 65, 58)
        scale_steps = (1.0, 0.9, 0.8, 0.7)

        last_tmp_path: str | None = None
        for scale in scale_steps:
            candidate = img
            if scale < 1.0:
                candidate = img.resize(
                    (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale)))
                )
            for q in quality_steps:
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
                tmp_path = tmp.name
                tmp.close()
                try:
                    candidate.save(tmp_path, format="JPEG", quality=q, optimize=True)
                    if os.path.getsize(tmp_path) <= EmbeddingService.IMAGE_SIZE_LIMIT_BYTES:
                        if last_tmp_path and os.path.exists(last_tmp_path):
                            try:
                                os.remove(last_tmp_path)
                            except OSError:
                                pass
                        return tmp_path, tmp_path
                except Exception:
                    pass
                finally:
                    if last_tmp_path and os.path.exists(last_tmp_path):
                        try:
                            os.remove(last_tmp_path)
                        except OSError:
                            pass
                    last_tmp_path = tmp_path

        if last_tmp_path and os.path.exists(last_tmp_path):
            try:
                os.remove(last_tmp_path)
            except OSError:
                pass
        return image_path, None

    @staticmethod
    def get_text_embedding(text: str) -> list[float]:
        """
        生成文本的向量表示
        
        Args:
            text: 输入文本
            
        Returns:
            向量 (浮点数列表)
            
        Raises:
            RuntimeError: API 调用失败时抛出
        """
        logger.debug("生成文本向量: %s", text[:50] + "..." if len(text) > 50 else text)
        
        response = MultiModalEmbedding.call(
            model=settings.TEXT_EMBEDDING_MODEL,
            input=[{"text": text}],
        )
        
        if response.status_code == HTTPStatus.OK:
            embedding = response.output["embeddings"][0]["embedding"]
            logger.debug("文本向量生成成功，维度: %d", len(embedding))
            return embedding
        
        raise RuntimeError(
            f"文本向量生成失败: code={response.code}, message={response.message}"
        )

    @staticmethod
    def get_image_embedding(image_path: str) -> list[float]:
        """
        生成图片的向量表示
        
        Args:
            image_path: 图片本地路径
            
        Returns:
            向量 (浮点数列表)
            
        Raises:
            RuntimeError: API 调用失败时抛出
        """
        logger.debug("生成图片向量: %s", image_path)

        prepared_path, tmp_path = EmbeddingService._prepare_image_for_embedding(image_path)
        try:
            local_file_uri = f"file://{prepared_path}"

            response = MultiModalEmbedding.call(
                model=settings.IMAGE_EMBEDDING_MODEL,
                input=[{"image": local_file_uri}],
            )
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    logger.warning("清理临时压缩文件失败: %s", tmp_path)
        
        if response.status_code == HTTPStatus.OK:
            embedding = response.output["embeddings"][0]["embedding"]
            logger.debug("图片向量生成成功，维度: %d", len(embedding))
            return embedding
        
        raise RuntimeError(
            f"图片向量生成失败: code={response.code}, message={response.message}"
        )


# 模块级单例 (保持向后兼容)
qwen_embedding_service = EmbeddingService()
