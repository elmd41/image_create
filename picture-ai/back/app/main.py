"""
FastAPI 应用入口
================

应用启动流程:
1. 创建 FastAPI 实例
2. 配置 CORS 中间件
3. 挂载静态文件目录
4. 注册 API 路由

运行方式:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import sys

import uvicorn
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api import conversations, generate, search
from app.config.settings import settings


def _configure_logging() -> None:
    """配置日志系统"""
    # 日志格式
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    )
    
    # 配置根日志记录器 (force=True 强制重新配置，覆盖 uvicorn 的默认配置)
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
        force=True,  # 关键：强制重新配置
    )
    
    # 确保 app 模块的 logger 使用 INFO 级别
    logging.getLogger("app").setLevel(logging.INFO)
    
    # 确保访问日志 logger 使用 INFO 级别
    logging.getLogger("app.access").setLevel(logging.INFO)
    
    # 配置 uvicorn 的访问日志（保留 uvicorn 的访问日志格式）
    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    uvicorn_access_logger.setLevel(logging.INFO)
    # 为 uvicorn.access 设置格式化的 handler
    if not uvicorn_access_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(log_format, datefmt="%Y-%m-%d %H:%M:%S"))
        uvicorn_access_logger.addHandler(handler)
    
    # 降低第三方库的日志级别
    for lib_name in ["httpx", "httpcore", "urllib3", "requests", "dashscope"]:
        logging.getLogger(lib_name).setLevel(logging.WARNING)
    
    logging.info("日志系统初始化完成")


# 初始化日志配置（模块加载时执行）
_configure_logging()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件 - 记录每个 HTTP 请求"""
    
    def __init__(self, app):
        super().__init__(app)
        # 使用根 logger 确保日志能输出
        self.logger = logging.getLogger()
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # 记录请求开始
        self.logger.info(">>> 收到请求: %s %s", request.method, request.url.path)
        
        # 处理请求
        response = await call_next(request)
        
        # 计算耗时
        duration = time.time() - start_time
        
        # 记录请求结束
        self.logger.info(
            "<<< 请求完成: %s %s -> %d (耗时: %.2fs)",
            request.method,
            request.url.path,
            response.status_code,
            duration,
        )
        
        return response


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用实例"""
    
    app = FastAPI(
        title="Picture AI",
        description="图片搜索与生成 AI 服务",
        version="1.0.0",
    )

    # 配置 CORS
    _configure_cors(app)
    
    # 添加请求日志中间件
    app.add_middleware(RequestLoggingMiddleware)
    
    # 挂载静态文件
    _mount_static_files(app)
    
    # 注册路由
    _register_routes(app)

    return app


def _configure_cors(app: FastAPI) -> None:
    """配置跨域资源共享 (CORS)"""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 生产环境应配置具体域名
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _mount_static_files(app: FastAPI) -> None:
    """挂载静态文件目录"""
    # 原始图片目录
    app.mount(
        "/static",
        StaticFiles(directory=settings.IMAGE_SOURCE_PATH),
        name="static",
    )
    # 生成图片目录
    app.mount(
        "/generated",
        StaticFiles(directory=settings.GENERATED_PATH),
        name="generated",
    )


def _register_routes(app: FastAPI) -> None:
    """注册 API 路由"""
    app.include_router(search.router, prefix="/api", tags=["搜索"])
    app.include_router(generate.router, prefix="/api", tags=["生成"])
    app.include_router(conversations.router, prefix="/api", tags=["会话"])


    @app.get("/", tags=["系统"])
    async def root() -> dict[str, str]:
        """根路径，返回欢迎信息"""
        return {"message": "Welcome to Picture AI"}

    @app.get("/health", tags=["系统"])
    async def health_check() -> dict[str, str]:
        """健康检查接口"""
        return {"status": "ok"}


# 创建应用实例
app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_config=None,  # 使用我们自定义的日志配置
        access_log=True,  # 确保访问日志启用
    )
