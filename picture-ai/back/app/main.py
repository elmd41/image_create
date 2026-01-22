'''
FastAPI 应用入口文件
-------------------
功能：
1. 初始化 FastAPI 应用实例
2. 配置 CORS（跨域资源共享）以允许前端访问
3. 挂载静态文件目录，提供图片访问服务
4. 注册 API 路由
5. 提供应用启动入口

作业：
- 检查 CORS 配置是否满足生产环境需求
- 确保静态文件路径配置正确
'''

from fastapi import FastAPI
import uvicorn
from app.api import search, generate
from fastapi.staticfiles import StaticFiles
from app.config.settings import settings
from fastapi.middleware.cors import CORSMiddleware

# 创建 FastAPI 实例
app = FastAPI(title="Picture AI Search")

# 配置 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源的跨域请求，在生产环境中应配置为你的前端域名
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有 HTTP 方法
    allow_headers=["*"],   # 允许所有 HTTP 请求头
)

# 挂载静态文件目录，用于前端访问图片
# /static/cat.png -> f:/work/picture-ai/picture-ai/data/images/cat.png
app.mount("/static", StaticFiles(directory=settings.IMAGE_SOURCE_PATH), name="static")

# 注册路由

# 注册路由
app.include_router(search.router, prefix="/api")
app.include_router(generate.router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# 启动服务
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
