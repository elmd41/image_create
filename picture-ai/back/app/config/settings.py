"""
应用配置模块
============

集中管理所有配置项，支持环境变量覆盖。

使用方式:
    from app.config.settings import settings
    print(settings.API_KEY)

环境变量:
    可通过 .env 文件或系统环境变量覆盖默认配置
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


# 目录常量
_BACK_DIR = Path(__file__).resolve().parent.parent.parent
_PROJECT_ROOT = _BACK_DIR.parent
_DATA_DIR = _PROJECT_ROOT / "data"


class Settings(BaseSettings):
    """应用配置类，支持从环境变量加载配置"""
    DASHSCOPE_API_KEY: str = "sk-3fab2e04b2104c05894ead0ca1e4cab1"
    VOLC_API_KEY: str = "076f3484-2138-4fe1-bb65-5450d3309ab8"

    DEFAULT_VOLC_IMAGE_MODEL: ClassVar[str] = "doubao-seedream-4-5-251128"

    # ==================== 目录配置 ====================
    DATA_PATH: Path = _DATA_DIR
    IMAGE_SOURCE_PATH: Path = _DATA_DIR / "images"
    LOG_PATH: Path = _DATA_DIR / "logs"
    VECTOR_STORE_PATH: Path = _DATA_DIR / "vector_store"
    GENERATED_PATH: Path = _DATA_DIR / "generated"

    # ==================== 数据库配置 ====================
    DATABASE_URL: str = f"sqlite:///{_DATA_DIR / 'picture_ai.db'}"

    # ==================== API Keys ====================
    # DashScope (阿里云通义千问)
    API_KEY: str = "sk-3fab2e04b2104c05894ead0ca1e4cab1"
    
    # 火山引擎 (Volcengine)
    VOLC_API_KEY: str = "076f3484-2138-4fe1-bb65-5450d3309ab8"

    # ==================== 模型配置 ====================
    # Embedding 模型
    TEXT_EMBEDDING_MODEL: str = "multimodal-embedding-v1"
    IMAGE_EMBEDDING_MODEL: str = "multimodal-embedding-v1"
    TEXT_EMBEDDING_MODEL_DIM: int = 1024

    # 火山引擎图像生成模型
    VOLC_IMAGE_MODEL: str = DEFAULT_VOLC_IMAGE_MODEL
    VOLC_API_ENDPOINT: str = "https://ark.cn-beijing.volces.com/api/v3/images/generations"

    VOLC_REQUEST_TIMEOUT_SECONDS: int = 180
    VOLC_REQUEST_MAX_RETRIES: int = 2
    VOLC_REQUEST_RETRY_BACKOFF_SECONDS: float = 1.0

    VOLC_MIN_IMAGE_PIXELS: int = 3686400
    VOLC_SIZE_ALIGN: int = 64

    GENERATE_FLAT_QC_ENABLED: bool = True
    GENERATE_FLAT_QC_MAX_RETRIES: int = 2

    # ==================== SAM 分割模型配置 ====================
    SAM_CHECKPOINT: Path = _BACK_DIR / "models" / "sam" / "sam_vit_b_01ec64.pth"
    SAM_MODEL_TYPE: str = "vit_b"
    SAM_DEVICE: str = "auto"  # "auto" / "cuda" / "cpu"

    # ==================== 服务配置 ====================
    BACKEND_PUBLIC_URL: str = "http://127.0.0.1:8000"
    DEBUG: bool = True

    # ==================== Pydantic 配置 ====================
    model_config = SettingsConfigDict(
        env_file=_BACK_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # 忽略未知的环境变量
    )


@lru_cache
def get_settings() -> Settings:
    """
    获取配置单例（带缓存）
    
    使用 lru_cache 确保只创建一个 Settings 实例
    """
    return Settings()


# 配置单例
settings = get_settings()

# 强制使用默认模型，避免环境变量覆盖导致版本不一致
if settings.VOLC_IMAGE_MODEL != Settings.DEFAULT_VOLC_IMAGE_MODEL:
    settings.VOLC_IMAGE_MODEL = Settings.DEFAULT_VOLC_IMAGE_MODEL


def _ensure_directories() -> None:
    """确保所有必需的数据目录存在"""
    directories = [
        settings.DATA_PATH,
        settings.IMAGE_SOURCE_PATH,
        settings.LOG_PATH,
        settings.VECTOR_STORE_PATH,
        settings.GENERATED_PATH,
    ]
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)


# 模块加载时创建目录
_ensure_directories()
