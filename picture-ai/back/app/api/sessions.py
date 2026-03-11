"""
会话管理 API
============
提供聊天会话和编辑会话的 CRUD 接口
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.session_db import session_db

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== 请求/响应模型 ====================

class ChatSessionCreate(BaseModel):
    title: str = ''
    thumbnail: str | None = None
    firstPrompt: str | None = None


class ChatSessionUpdate(BaseModel):
    title: str | None = None
    thumbnail: str | None = None
    firstPrompt: str | None = None


class ChatMessageCreate(BaseModel):
    type: str = 'text'
    content: str
    text: str | None = None
    prompt: str | None = None
    referenceImage: str | None = None
    source: str | None = None
    params: dict | None = None
    images: list[str] | None = None
    colorVariantConfig: dict[str, Any] | None = None
    isUser: bool = False


class EditSessionCreate(BaseModel):
    title: str = ''
    thumbnail: str | None = None
    originalImage: str | None = None
    layerCount: int = 0
    meta: dict | None = None


class EditSessionUpdate(BaseModel):
    title: str | None = None
    thumbnail: str | None = None
    layerCount: int | None = None
    stepCount: int | None = None


class EditSnapshotCreate(BaseModel):
    stepIndex: int
    imageDataUrl: str
    layers: list[dict]
    prompt: str | None = None


# ==================== 聊天会话接口 ====================

@router.get("/sessions/chat")
async def list_chat_sessions(limit: int = 50) -> list[dict]:
    """获取聊天会话列表"""
    return session_db.list_chat_sessions(limit=limit)


@router.post("/sessions/chat")
async def create_chat_session(data: ChatSessionCreate) -> dict:
    """创建新的聊天会话"""
    return session_db.create_chat_session(title=data.title, thumbnail=data.thumbnail, first_prompt=data.firstPrompt)


@router.get("/sessions/chat/{session_id}")
async def get_chat_session(session_id: str) -> dict:
    """获取单个聊天会话"""
    session = session_db.get_chat_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.put("/sessions/chat/{session_id}")
async def update_chat_session(session_id: str, data: ChatSessionUpdate) -> dict:
    """更新聊天会话"""
    # 将 camelCase 字段映射到 snake_case
    raw_updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates = {}
    for k, v in raw_updates.items():
        if k == 'firstPrompt':
            updates['first_prompt'] = v
        else:
            updates[k] = v
    session = session_db.update_chat_session(session_id, **updates)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.delete("/sessions/chat/{session_id}")
async def delete_chat_session(session_id: str) -> dict:
    """删除聊天会话"""
    success = session_db.delete_chat_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True}


# ==================== 聊天消息接口 ====================

@router.get("/sessions/chat/{session_id}/messages")
async def get_chat_messages(session_id: str) -> list[dict]:
    """获取会话的所有消息"""
    session = session_db.get_chat_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session_db.get_chat_messages(session_id)


@router.post("/sessions/chat/{session_id}/messages")
async def add_chat_message(session_id: str, data: ChatMessageCreate) -> dict:
    """添加聊天消息"""
    session = session_db.get_chat_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    message_id = session_db.add_chat_message(session_id, data.model_dump())
    return {"id": message_id, "success": True}


# ==================== 编辑会话接口 ====================

@router.get("/sessions/edit")
async def list_edit_sessions(limit: int = 50) -> list[dict]:
    """获取编辑会话列表"""
    return session_db.list_edit_sessions(limit=limit)


@router.post("/sessions/edit")
async def create_edit_session(data: EditSessionCreate) -> dict:
    """创建新的编辑会话"""
    return session_db.create_edit_session(
        title=data.title,
        thumbnail=data.thumbnail,
        original_image=data.originalImage,
        layer_count=data.layerCount,
        meta=data.meta,
    )


@router.get("/sessions/edit/{session_id}")
async def get_edit_session(session_id: str) -> dict:
    """获取单个编辑会话"""
    session = session_db.get_edit_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.put("/sessions/edit/{session_id}")
async def update_edit_session(session_id: str, data: EditSessionUpdate) -> dict:
    """更新编辑会话"""
    updates = {}
    if data.title is not None:
        updates['title'] = data.title
    if data.thumbnail is not None:
        updates['thumbnail'] = data.thumbnail
    if data.layerCount is not None:
        updates['layer_count'] = data.layerCount
    if data.stepCount is not None:
        updates['step_count'] = data.stepCount

    session = session_db.update_edit_session(session_id, **updates)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session


@router.delete("/sessions/edit/{session_id}")
async def delete_edit_session(session_id: str) -> dict:
    """删除编辑会话"""
    success = session_db.delete_edit_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True}


# ==================== 编辑快照接口 ====================

@router.get("/sessions/edit/{session_id}/snapshots")
async def get_edit_snapshots(session_id: str) -> list[dict]:
    """获取编辑会话的所有快照"""
    session = session_db.get_edit_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return session_db.get_edit_snapshots(session_id)


@router.post("/sessions/edit/{session_id}/snapshots")
async def add_edit_snapshot(session_id: str, data: EditSnapshotCreate) -> dict:
    """添加编辑快照"""
    session = session_db.get_edit_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    snapshot_id = session_db.add_edit_snapshot(
        session_id=session_id,
        step_index=data.stepIndex,
        image_data_url=data.imageDataUrl,
        layers=data.layers,
        prompt=data.prompt,
    )
    return {"id": snapshot_id, "success": True}
