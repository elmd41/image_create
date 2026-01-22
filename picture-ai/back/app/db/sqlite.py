'''
SQLite 数据库管理模块
------------------
功能：
1. 管理 SQLite 数据库连接
2. 维护图片文件的元数据表（ID、路径、文件名、大小等）
3. 提供增删改查（CRUD）接口

作业：
- 学习 SQL 注入的概念，并确认当前实现是否防范了注入（提示：参数化查询）
- 尝试添加一个新的字段，例如 "description" 或 "tags"
'''
import sqlite3
import os
from app.config.settings import settings

class ImageMetadataDB:

    def __init__(self):
        # 从配置中获取数据库文件路径
        # settings.DATABASE_URL 的格式是 "sqlite:///path/to/database.db"
        # 我们需要提取 "path/to/database.db" 部分
        self.db_path = settings.DATABASE_URL.split("///")[1]
        self._init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        """初始化数据库表结构"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT UNIQUE NOT NULL,
                    file_name TEXT NOT NULL,
                    file_size INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()

    def add_image(self, file_path):
        """添加图片元数据"""
        # 在 Windows 上，路径分隔符可能是 \，统一转换为 /
        file_path = file_path.replace('\\', '/')

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO images (file_path, file_name, file_size) VALUES (?, ?, ?)",
                    (file_path, file_name, file_size)
                )
                conn.commit()
                return cursor.lastrowid
        except sqlite3.IntegrityError:
            # 如果路径已存在，则返回对应的 ID
            return self.get_image_id_by_path(file_path)

    def get_image_id_by_path(self, file_path):
        """根据路径查询图片 ID"""
        file_path = file_path.replace('\\', '/')
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM images WHERE file_path = ?", (file_path,))
            result = cursor.fetchone()
            return result[0] if result else None

    def get_image_metadata(self, image_id):
        """根据 ID 获取图片详细元数据"""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM images WHERE id = ?", (image_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def list_all_images(self):
        """列出所有存储的图片信息"""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM images")
            return [dict(row) for row in cursor.fetchall()]

    def delete_image(self, image_id):
        """根据 ID 删除元数据记录"""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM images WHERE id = ?", (image_id,))
            conn.commit()

# 创建一个单例，方便在其他地方直接导入使用
image_metadata_db = ImageMetadataDB()
