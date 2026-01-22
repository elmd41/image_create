'''
搜索 API 路由定义
----------------
功能：
1. 定义 /api/search 接口，处理搜索请求
2. 支持 文本->图 和 图->图 的多模态搜索
3. 处理文件上传和临时文件管理
4. 格式化搜索结果并返回给前端

作业：
- 优化临时文件的清理逻辑，确保无残留
- 完善错误处理机制，提供更友好的错误提示
'''
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import shutil
import os
import tempfile
from app.service.search_service import vector_search_service

import logging

router = APIRouter()

class SearchResultItem(BaseModel):
    id: str
    score: float
    path: str
    metadata: Optional[Dict[str, Any]] = None

class SearchResponse(BaseModel):
    results: List[SearchResultItem]

@router.post("/search", response_model=SearchResponse)
def search(
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    top_k: int = Form(10)
):
    """
    Search endpoint supporting both text-to-image and image-to-image search.
    
    - **text**: Text query for text-to-image search.
    - **file**: Image file upload for image-to-image search.
    - **top_k**: Number of results to return (default: 10).
    
    You must provide either `text` or `file`.
    """
    print(f"收到搜索请求: text={text}, file={file.filename if file else None}")
    results = []
    
    if file:
        # Handle image search (Image-to-Image)
        # Create a temporary file to save the uploaded image
        # We need a physical file path for the embedding service
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        try:
            # Perform search using the temporary file path
            results = vector_search_service.search_by_image(tmp_path, top_k)
        except Exception as e:
            logging.exception("Image search failed")
            raise HTTPException(status_code=500, detail=f"Image search failed: {str(e)}")
        finally:
            # Clean up the temporary file
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except:
                    pass # Ignore cleanup errors
                
    elif text:
        # Handle text search (Text-to-Image)
        try:
            results = vector_search_service.search_by_text(text, top_k)
        except Exception as e:
            logging.exception("Text search failed")
            raise HTTPException(status_code=500, detail=f"Text search failed: {str(e)}")
            
    else:
        raise HTTPException(status_code=400, detail="Either 'text' or 'file' must be provided")

    # Format results for the response
    formatted_results = [
        SearchResultItem(
            id=str(res["id"]),
            score=res["score"],
            path=res["path"],
            metadata=res["metadata"]
        ) for res in results
    ]

    return SearchResponse(results=formatted_results)
