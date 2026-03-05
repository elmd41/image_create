"""
搜索 API 模块
=============

提供图片搜索功能:
- 文本搜索: 根据文字描述搜索相似图片
- 图片搜索: 根据上传图片搜索相似图片
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.service.search_service import vector_search_service


logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== 响应模型 ====================

class SearchResultItem(BaseModel):
    """单个搜索结果"""
    id: str
    score: float
    path: str
    metadata: dict[str, Any] | None = None


class SearchResponse(BaseModel):
    """搜索响应"""
    results: list[SearchResultItem]


# ==================== API 端点 ====================

@router.post("/search", response_model=SearchResponse)
def search(
    text: str | None = Form(None, description="文本查询"),
    file: UploadFile | None = File(None, description="图片文件"),
    top_k: int = Form(10, description="返回结果数量"),
    style: str | None = Form(None, description="风格流派"),
    ratio: str | None = Form(None, description="图片比例"),
    color: str | None = Form(None, description="主体颜色"),
    scene: str | None = Form(None, description="图结构"),
) -> SearchResponse:
    """
    图片搜索接口
    
    支持两种搜索模式:
    - 文本搜索: 提供 text 参数
    - 图片搜索: 上传 file 文件
    
    必须提供 text 或 file 其中之一
    """
    query_text = _build_search_query(text=text, style=style, ratio=ratio, color=color, scene=scene)
    logger.info("收到搜索请求: text=%s, file=%s", query_text, file.filename if file else None)

    if file:
        results = _search_by_image(file, query_text, top_k)
    elif query_text:
        results = _search_by_text(query_text, top_k)
    else:
        raise HTTPException(
            status_code=400,
            detail="必须提供 text 或 file 参数",
        )

    return SearchResponse(results=results)


# ==================== 内部函数 ====================

def _search_by_image(file: UploadFile, query_text: str, top_k: int) -> list[SearchResultItem]:
    """通过图片进行搜索"""
    suffix = _get_file_extension(file.filename)
    tmp_path = None
    
    try:
        # 保存上传文件到临时目录
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # 执行搜索
        if (query_text or "").strip():
            results = vector_search_service.search_by_image_with_text(tmp_path, query_text, top_k)
        else:
            results = vector_search_service.search_by_image(tmp_path, top_k)
        return _format_results(results)
        
    except Exception as e:
        logger.exception("图片搜索失败")
        raise HTTPException(status_code=500, detail=f"图片搜索失败: {e}") from e
        
    finally:
        _cleanup_temp_file(tmp_path)


def _search_by_text(text: str, top_k: int) -> list[SearchResultItem]:
    """通过文本进行搜索"""
    try:
        results = vector_search_service.search_by_text(text, top_k)
        return _format_results(results)
    except Exception as e:
        logger.exception("文本搜索失败")
        raise HTTPException(status_code=500, detail=f"文本搜索失败: {e}") from e


def _build_search_query(
    text: str | None,
    style: str | None,
    ratio: str | None,
    color: str | None,
    scene: str | None,
) -> str:
    parts: list[str] = []
    if (text or "").strip():
        parts.append((text or "").strip())
    if (style or "").strip():
        parts.append(f"{(style or '').strip()}风格")
    if (ratio or "").strip():
        parts.append(f"比例为{(ratio or '').strip()}")
    if (color or "").strip():
        parts.append(f"主体颜色倾向于{(color or '').strip()}")
    if (scene or "").strip():
        parts.append(f"图结构为{(scene or '').strip()}")
    return "，".join([p for p in parts if p])


def _format_results(results: list[dict[str, Any]]) -> list[SearchResultItem]:
    """格式化搜索结果"""
    return [
        SearchResultItem(
            id=str(item["id"]),
            score=item["score"],
            path=item["path"],
            metadata=item.get("metadata"),
        )
        for item in results
    ]


def _get_file_extension(filename: str | None) -> str:
    """获取文件扩展名"""
    if filename:
        _, ext = os.path.splitext(filename)
        return ext or ".tmp"
    return ".tmp"


def _cleanup_temp_file(path: str | None) -> None:
    """清理临时文件"""
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            logger.warning("清理临时文件失败: %s", path)
