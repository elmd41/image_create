'''
FAISS 向量库管理模块
-------------------
功能：
1. 封装 Facebook AI Similarity Search (FAISS) 库
2. 管理向量索引的创建、加载和保存
3. 提供向量的归一化处理（用于计算余弦相似度）
4. 执行高效的向量相似度搜索

作业：
- 了解 FAISS 的不同索引类型（如 IndexFlatL2 vs IndexIVFFlat），尝试更换索引类型以提升搜索速度
- 理解 "归一化" (L2 Normalization) 在余弦相似度计算中的作用
'''
import faiss
import numpy as np
from app.config.settings import settings
from typing import List, Tuple
import os

class FaissManager:
    def __init__(self, embedding_dim: int = 1536):
        """
        初始化 FaissManager
        - embedding_dim: 向量的维度，对于千问 v2 模型是 1536
        """
        self.index_path = os.path.join(settings.VECTOR_STORE_PATH, "faiss_index.bin")
        self.embedding_dim = embedding_dim
        self.index = None
        self._load_index()

    def _load_index(self):
        """从磁盘加载 FAISS 索引。如果不存在，则创建一个新的。"""
        if os.path.exists(self.index_path):
            print(f"从 {self.index_path} 加载现有的 FAISS 索引...")
            self.index = faiss.read_index(self.index_path)
            print(f"索引加载成功，包含 {self.index.ntotal} 个向量。")
        else:
            print("未找到现有的 FAISS 索引，将创建一个新的。")
            # 使用 IndexIDMap 可以在 FAISS 索引中直接使用我们自己的数字 ID
            # 我们使用内积（IP）作为相似度度量，它等价于归一化向量的余弦相似度
            self.index = faiss.IndexIDMap(faiss.IndexFlatIP(self.embedding_dim))

    def save_index(self):
        """将当前索引保存到磁盘。"""
        print(f"将 FAISS 索引保存到 {self.index_path}...")
        faiss.write_index(self.index, self.index_path)
        print("索引保存成功。")

    def add_vectors(self, ids: List[int], embeddings: List[List[float]]):
        """
        向索引中添加向量。
        - ids: 向量的唯一数字标识符列表 (来自 SQLite 的主键)
        - embeddings: 向量数据列表
        """
        if not embeddings:
            return

        # FAISS 需要 numpy 数组
        vectors = np.array(embeddings, dtype='float32')
        # FAISS 的 ID 也需要是 numpy 数组
        faiss_ids = np.array(ids, dtype='int64')

        # 归一化向量，以便使用内积计算余弦相似度
        faiss.normalize_L2(vectors)

        self.index.add_with_ids(vectors, faiss_ids)

    def search_vectors(self, query_embedding: List[float], top_k: int = 10) -> List[Tuple[int, float]]:
        """
        使用单个查询向量执行相似度搜索。
        - query_embedding: 用于查询的向量
        - top_k: 希望返回的最相似结果的数量
        返回: 一个元组列表，每个元组是 (id, score)
        """
        if self.index.ntotal == 0:
            return []

        query_vector = np.array([query_embedding], dtype='float32')
        faiss.normalize_L2(query_vector)

        # 执行搜索
        distances, ids = self.index.search(query_vector, top_k)

        # 将结果格式化为 (id, score) 的列表
        results = []
        for i in range(len(ids[0])):
            # 如果 id 为 -1，表示没有更多有效的结果
            if ids[0][i] != -1:
                results.append((int(ids[0][i]), float(distances[0][i])))
        return results

    def count(self) -> int:
        """获取当前索引中的向量总数。"""
        return self.index.ntotal

# 创建一个单例，方便在其他地方直接导入使用
# 注意：千问 v2 模型的输出向量维度是 1536
faiss_manager = FaissManager(embedding_dim=settings.TEXT_EMBEDDING_MODEL_DIM)
