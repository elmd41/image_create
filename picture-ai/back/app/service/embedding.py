'''
向量生成服务封装
---------------
功能：
1. 封装阿里云 DashScope（通义千问）的多模态 Embedding API
2. 提供文本转向量接口
3. 提供图片转向量接口

作业：
- 监控 API 调用频率和成本
- 处理网络超时和 API 错误重试
'''

from typing import List
import dashscope
from dashscope import TextEmbedding, MultiModalEmbedding
from app.config.settings import settings
from http import HTTPStatus
import os

# 从配置中设置 DashScope API Key
# 确保你的 API Key 已经填入 settings.py 或 .env 文件
dashscope.api_key = settings.API_KEY
os.environ["DASHSCOPE_API_KEY"] = settings.API_KEY

class QwenEmbeddingService:

    @staticmethod
    def get_text_embedding(text: str) -> List[float]:
        """
        生成单个文本的向量
        :param text: 输入的文本
        :return: 向量
        """
        resp = MultiModalEmbedding.call(
            model=settings.TEXT_EMBEDDING_MODEL,
            input=[{'text': text}]
        )
        # 检查调用是否成功
        if resp.status_code == HTTPStatus.OK:
            # 返回第一个结果的 embedding
            return resp.output['embeddings'][0]['embedding']
        else:
            raise Exception(f"文本向量生成失败: code: {resp.code}, message: {resp.message}")

    @staticmethod
    def get_image_embedding(image_path: str) -> List[float]:
        """
        生成单个图片文件的向量
        :param image_path: 图片的本地路径 (不支持 URL)
        :return: 图片向量
        """
        # 千问 API 需要 file:// 协议头来指定本地文件
        local_file_path = f"file://{image_path}"
        
        resp = MultiModalEmbedding.call(
            model=settings.IMAGE_EMBEDDING_MODEL,
            input=[{'image': local_file_path}]
        )
        if resp.status_code == HTTPStatus.OK:
            # 多模态 embedding 直接返回向量
            return resp.output['embeddings'][0]['embedding']
        else:
            raise Exception(f"图片向量生成失败: code: {resp.code}, message: {resp.message}")

# 创建一个单例，方便在其他地方直接导入使用
qwen_embedding_service = QwenEmbeddingService()