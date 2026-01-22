'''
项目配置文件
-----------
功能：
1. 管理项目的所有配置项（API Key、文件路径、数据库连接等）
2. 自动创建项目所需的数据目录结构
3. 提供统一的配置访问接口

作业：
- 确保 API Key 安全存储（建议使用环境变量）
- 检查文件路径在不同操作系统下的兼容性
'''
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional

# 项目根目录 back/
BACK_DIR = Path(__file__).parent.parent.parent

class Settings(BaseSettings):
    # API Key 配置
    # 请将你的千问 API Key 填入下方，或者在项目根目录创建 .env 文件并写入 API_KEY="sk-..."
    API_KEY: str = "sk-3fab2e04b2104c05894ead0ca1e4cab1"

    # 路径配置
    # 所有数据（数据库、向量库、日志、上传文件）都将存储在项目根目录下的 data 目录中
    DATA_PATH: Path = BACK_DIR.parent / "data"
    # 存放原始图片的目录
    IMAGE_SOURCE_PATH: Path = DATA_PATH / "images"
    # 日志文件路径
    LOG_PATH: Path = DATA_PATH / "logs"
    # SQLite 数据库文件路径
    DATABASE_URL: str = f"sqlite:///{DATA_PATH / 'picture_ai.db'}"
    # 向量数据库存储路径 (FAISS 索引文件将保存在此目录)
    VECTOR_STORE_PATH: str = str(DATA_PATH / "vector_store")

    # Embedding 模型配置
    TEXT_EMBEDDING_MODEL: str = "multimodal-embedding-v1"
    IMAGE_EMBEDDING_MODEL: str = "multimodal-embedding-v1"
    # 向量维度 (千问 multimodal-embedding-v1 图片向量实际返回 1024 维)
    TEXT_EMBEDDING_MODEL_DIM: int = 1024

    # 其他配置
    DEBUG: bool = True

    class Config:
        # 允许从 .env 文件中加载环境变量
        env_file = BACK_DIR / ".env"
        env_file_encoding = "utf-8"

# 实例化配置对象
settings = Settings()

# --- 自动创建项目所需目录 ---
def create_directories():
    """在应用启动时创建所有必需的数据目录"""
    paths_to_create = [
        settings.DATA_PATH,
        settings.IMAGE_SOURCE_PATH,
        settings.LOG_PATH,
        Path(settings.VECTOR_STORE_PATH)
    ]
    for path in paths_to_create:
        path.mkdir(parents=True, exist_ok=True)

# 在模块加载时执行创建目录的操作
create_directories()
