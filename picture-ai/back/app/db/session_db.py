"""
会话数据库管理模块
==================
功能：
1. 聊天会话管理（ChatSession）
2. 编辑会话管理（EditSession）
3. 消息/快照存储
"""
import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any

from app.config.settings import settings


class SessionDB:
    """会话数据库管理类"""

    def __init__(self):
        self.db_path = settings.DATABASE_URL.split("///")[1]
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """初始化会话相关表结构"""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 聊天会话表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT DEFAULT '',
                    thumbnail TEXT,
                    first_prompt TEXT,
                    message_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 检查并添加 first_prompt 列（兼容已有数据库）
            cursor.execute("PRAGMA table_info(chat_sessions)")
            columns = [col[1] for col in cursor.fetchall()]
            if 'first_prompt' not in columns:
                cursor.execute('ALTER TABLE chat_sessions ADD COLUMN first_prompt TEXT')

            # 聊天消息表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    text TEXT,
                    prompt TEXT,
                    reference_image TEXT,
                    source TEXT,
                    params TEXT,
                    images TEXT,
                    color_variant_config TEXT,
                    is_user INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
                )
            ''')
            
            # 检查并添加 images 列（兼容已有数据库）
            cursor.execute("PRAGMA table_info(chat_messages)")
            msg_columns = [col[1] for col in cursor.fetchall()]
            if 'images' not in msg_columns:
                cursor.execute('ALTER TABLE chat_messages ADD COLUMN images TEXT')
            if 'color_variant_config' not in msg_columns:
                cursor.execute('ALTER TABLE chat_messages ADD COLUMN color_variant_config TEXT')

            # 编辑会话表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS edit_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT DEFAULT '',
                    thumbnail TEXT,
                    original_image TEXT,
                    layer_count INTEGER DEFAULT 0,
                    step_count INTEGER DEFAULT 0,
                    meta TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # 编辑快照表（每步操作的快照）
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS edit_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    step_index INTEGER NOT NULL,
                    image_data_url TEXT NOT NULL,
                    layers TEXT NOT NULL,
                    prompt TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (session_id) REFERENCES edit_sessions(id) ON DELETE CASCADE
                )
            ''')

            # 创建索引
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_edit_snapshots_session ON edit_snapshots(session_id)')

            conn.commit()

    # ==================== 聊天会话 CRUD ====================

    def create_chat_session(self, title: str = '', thumbnail: str | None = None, first_prompt: str | None = None) -> dict:
        """创建新的聊天会话"""
        session_id = f"chat_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO chat_sessions (id, title, thumbnail, first_prompt, message_count, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 0, ?, ?)''',
                (session_id, title, thumbnail, first_prompt, now, now)
            )
            conn.commit()

        return self.get_chat_session(session_id)

    def get_chat_session(self, session_id: str) -> dict | None:
        """获取单个聊天会话"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM chat_sessions WHERE id = ?', (session_id,))
            row = cursor.fetchone()
            if row:
                return {
                    'id': row['id'],
                    'title': row['title'],
                    'thumbnail': row['thumbnail'],
                    'firstPrompt': row['first_prompt'],
                    'messageCount': row['message_count'],
                    'createdAt': row['created_at'],
                    'updatedAt': row['updated_at'],
                }
            return None

    def list_chat_sessions(self, limit: int = 50) -> list[dict]:
        """获取聊天会话列表（按更新时间倒序）"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT ?',
                (limit,)
            )
            rows = cursor.fetchall()
            return [
                {
                    'id': row['id'],
                    'title': row['title'],
                    'thumbnail': row['thumbnail'],
                    'firstPrompt': row['first_prompt'],
                    'messageCount': row['message_count'],
                    'createdAt': row['created_at'],
                    'updatedAt': row['updated_at'],
                }
                for row in rows
            ]

    def update_chat_session(self, session_id: str, **kwargs) -> dict | None:
        """更新聊天会话"""
        allowed_fields = {'title', 'thumbnail', 'message_count', 'first_prompt'}
        updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
        if not updates:
            return self.get_chat_session(session_id)

        updates['updated_at'] = datetime.now().isoformat()
        set_clause = ', '.join(f'{k} = ?' for k in updates.keys())
        values = list(updates.values()) + [session_id]

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f'UPDATE chat_sessions SET {set_clause} WHERE id = ?',
                values
            )
            conn.commit()

        return self.get_chat_session(session_id)

    def delete_chat_session(self, session_id: str) -> bool:
        """删除聊天会话及其消息"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
            conn.commit()
            return cursor.rowcount > 0

    # ==================== 聊天消息 CRUD ====================

    def add_chat_message(self, session_id: str, message: dict) -> int:
        """添加聊天消息"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO chat_messages 
                   (session_id, type, content, text, prompt, reference_image, source, params, images, color_variant_config, is_user)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    session_id,
                    message.get('type', 'text'),
                    message.get('content', ''),
                    message.get('text'),
                    message.get('prompt'),
                    message.get('referenceImage'),
                    message.get('source'),
                    json.dumps(message.get('params')) if message.get('params') else None,
                    json.dumps(message.get('images')) if message.get('images') else None,
                    json.dumps(message.get('colorVariantConfig')) if message.get('colorVariantConfig') else None,
                    1 if message.get('isUser') else 0,
                )
            )
            # 更新会话消息数
            cursor.execute(
                '''UPDATE chat_sessions 
                   SET message_count = message_count + 1, updated_at = ?
                   WHERE id = ?''',
                (datetime.now().isoformat(), session_id)
            )
            conn.commit()
            return cursor.lastrowid

    def get_chat_messages(self, session_id: str) -> list[dict]:
        """获取会话的所有消息"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
                (session_id,)
            )
            rows = cursor.fetchall()
            messages = []
            for row in rows:
                msg = {
                    'type': row['type'],
                    'content': row['content'],
                    'text': row['text'],
                    'prompt': row['prompt'],
                    'referenceImage': row['reference_image'],
                    'source': row['source'],
                    'params': json.loads(row['params']) if row['params'] else None,
                    'isUser': bool(row['is_user']),
                }
                # 处理 images 字段
                try:
                    images_val = row['images']
                    if images_val:
                        msg['images'] = json.loads(images_val)
                except (KeyError, TypeError):
                    pass
                # 处理 colorVariantConfig 字段
                try:
                    config_val = row['color_variant_config']
                    if config_val:
                        msg['colorVariantConfig'] = json.loads(config_val)
                except (KeyError, TypeError):
                    pass
                messages.append(msg)
            return messages

    # ==================== 编辑会话 CRUD ====================

    def create_edit_session(
        self,
        title: str = '',
        thumbnail: str | None = None,
        original_image: str | None = None,
        layer_count: int = 0,
        meta: dict | None = None,
    ) -> dict:
        """创建新的编辑会话"""
        session_id = f"edit_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO edit_sessions 
                   (id, title, thumbnail, original_image, layer_count, step_count, meta, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)''',
                (
                    session_id,
                    title,
                    thumbnail,
                    original_image,
                    layer_count,
                    json.dumps(meta) if meta else None,
                    now,
                    now,
                )
            )
            conn.commit()

        return self.get_edit_session(session_id)

    def get_edit_session(self, session_id: str) -> dict | None:
        """获取单个编辑会话"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM edit_sessions WHERE id = ?', (session_id,))
            row = cursor.fetchone()
            if row:
                return {
                    'id': row['id'],
                    'title': row['title'],
                    'thumbnail': row['thumbnail'],
                    'originalImage': row['original_image'],
                    'layerCount': row['layer_count'],
                    'stepCount': row['step_count'],
                    'meta': json.loads(row['meta']) if row['meta'] else None,
                    'createdAt': row['created_at'],
                    'updatedAt': row['updated_at'],
                }
            return None

    def list_edit_sessions(self, limit: int = 50) -> list[dict]:
        """获取编辑会话列表"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM edit_sessions ORDER BY updated_at DESC LIMIT ?',
                (limit,)
            )
            rows = cursor.fetchall()
            return [
                {
                    'id': row['id'],
                    'title': row['title'],
                    'thumbnail': row['thumbnail'],
                    'originalImage': row['original_image'],
                    'layerCount': row['layer_count'],
                    'stepCount': row['step_count'],
                    'meta': json.loads(row['meta']) if row['meta'] else None,
                    'createdAt': row['created_at'],
                    'updatedAt': row['updated_at'],
                }
                for row in rows
            ]

    def update_edit_session(self, session_id: str, **kwargs) -> dict | None:
        """更新编辑会话"""
        allowed_fields = {'title', 'thumbnail', 'layer_count', 'step_count', 'meta'}
        updates = {}
        for k, v in kwargs.items():
            if k in allowed_fields:
                updates[k] = json.dumps(v) if k == 'meta' and v is not None else v

        if not updates:
            return self.get_edit_session(session_id)

        updates['updated_at'] = datetime.now().isoformat()
        set_clause = ', '.join(f'{k} = ?' for k in updates.keys())
        values = list(updates.values()) + [session_id]

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f'UPDATE edit_sessions SET {set_clause} WHERE id = ?',
                values
            )
            conn.commit()

        return self.get_edit_session(session_id)

    def delete_edit_session(self, session_id: str) -> bool:
        """删除编辑会话及其快照"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM edit_sessions WHERE id = ?', (session_id,))
            conn.commit()
            return cursor.rowcount > 0

    # ==================== 编辑快照 CRUD ====================

    def add_edit_snapshot(
        self,
        session_id: str,
        step_index: int,
        image_data_url: str,
        layers: list[dict],
        prompt: str | None = None,
    ) -> int:
        """添加编辑快照"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''INSERT INTO edit_snapshots (session_id, step_index, image_data_url, layers, prompt)
                   VALUES (?, ?, ?, ?, ?)''',
                (session_id, step_index, image_data_url, json.dumps(layers), prompt)
            )
            # 更新会话步数
            cursor.execute(
                '''UPDATE edit_sessions 
                   SET step_count = ?, updated_at = ?
                   WHERE id = ?''',
                (step_index + 1, datetime.now().isoformat(), session_id)
            )
            conn.commit()
            return cursor.lastrowid

    def get_edit_snapshots(self, session_id: str) -> list[dict]:
        """获取会话的所有快照"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT * FROM edit_snapshots WHERE session_id = ? ORDER BY step_index ASC',
                (session_id,)
            )
            rows = cursor.fetchall()
            return [
                {
                    'stepIndex': row['step_index'],
                    'imageDataUrl': row['image_data_url'],
                    'layers': json.loads(row['layers']),
                    'prompt': row['prompt'],
                    'createdAt': row['created_at'],
                }
                for row in rows
            ]


# 单例
session_db = SessionDB()
