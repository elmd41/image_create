'''
搜索业务逻辑服务
-------------------
功能：
1. 协调向量生成服务和向量检索引擎
2. 实现"文搜图"的具体逻辑：文本->向量->FAISS检索
3. 实现"图搜图"的具体逻辑：图片->向量->FAISS检索
4. 结合数据库元数据，格式化最终返回结果

作业：
- 优化搜索性能，考虑缓存热点查询
- 丰富返回的元数据信息
'''
import os
from app.service.embedding import qwen_embedding_service
from app.vectorstore.faiss_manager import faiss_manager
from app.db.sqlite import image_metadata_db
from typing import List, Dict, Any

class VectorSearchService:
    def search_by_text(self, text: str, top_k: int) -> List[Dict[str, Any]]:
        """
        Search for images by a text query.
        """
        # 1. Get text embedding
        query_embedding = qwen_embedding_service.get_text_embedding(text)
        
        # 2. Search in FAISS
        print(f"正在FAISS中搜索，top_k={top_k}")
        search_results = faiss_manager.search_vectors(
            query_embedding=query_embedding,
            top_k=top_k
        )
        print(f"搜索完成，找到 {len(search_results)} 个结果")
        
        # 3. Format results
        return self._format_results(search_results)

    def search_by_image(self, image_path: str, top_k: int) -> List[Dict[str, Any]]:
        """
        Search for similar images by an image file.
        """
        # 1. Get image embedding
        query_embedding = qwen_embedding_service.get_image_embedding(image_path)
        
        # 2. Search in FAISS
        search_results = faiss_manager.search_vectors(
            query_embedding=query_embedding,
            top_k=top_k
        )
        
        # 3. Format results
        return self._format_results(search_results)

    def _format_results(self, search_results: List[tuple[int, float]]) -> List[Dict[str, Any]]:
        """
        Formats the raw search results from FAISS into a structured list.
        Uses adaptive thresholding to filter results.
        """
        formatted_results = []
        if not search_results:
            return formatted_results

        # 1. 获取最佳匹配分数
        best_score = search_results[0][1]
        print(f"当前搜索最佳匹配分数: {best_score}")

        # 2. 设定阈值策略
        # 绝对保底阈值：防止完全不相关的噪音 (根据千问模型特性调整，暂时设低一点以便观察)
        ABSOLUTE_MIN_SCORE = 0.15
        
        # 相对阈值：如果分数掉得太厉害（比如不到第一名的 60%），则丢弃
        # 注意：如果 best_score 很低（比如 0.2），相对阈值可能会把 0.15 的也留下，这是合理的
        # 如果 best_score 很高（比如 0.8），相对阈值 0.48，可以有效过滤 0.3 的噪音
        RELATIVE_RATIO = 0.6

        for image_id, score in search_results:
            print(f"  - 候选图片 ID: {image_id}, 分数: {score}")
            
            # 绝对阈值过滤
            if score < ABSOLUTE_MIN_SCORE:
                print(f"    -> 过滤: 低于绝对阈值 {ABSOLUTE_MIN_SCORE}")
                continue
                
            # 相对阈值过滤 (仅当最佳分数本身较高时启用，避免在整体匹配度都低时过滤太多)
            if best_score > 0.3 and score < (best_score * RELATIVE_RATIO):
                print(f"    -> 过滤: 低于相对阈值 ({best_score} * {RELATIVE_RATIO} = {best_score * RELATIVE_RATIO})")
                continue

            # Get image path from SQLite using the ID
            image_info = image_metadata_db.get_image_metadata(image_id)
            if image_info:
                # 从绝对路径中获取文件名
                file_name = os.path.basename(image_info["file_path"])
                # 拼接成可访问的 URL
                image_url = f"/static/{file_name}"
                formatted_results.append({
                    "id": image_id,
                    "score": score,
                    "path": image_url,
                    "metadata": dict(image_info)
                })
            
        return formatted_results

# Create a singleton instance of the service
vector_search_service = VectorSearchService()
