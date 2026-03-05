from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from PIL import Image
import io
import os
import httpx
from urllib.parse import unquote
from app.config.settings import settings

router = APIRouter()

async def fetch_image_content(url: str) -> bytes:
    """获取图片内容，支持本地路径和远程 URL"""
    # 1. 处理本地路径
    if url.startswith('/static/'):
        # 映射到 IMAGE_SOURCE_PATH
        rel_path = url[len('/static/'):]
        file_path = settings.IMAGE_SOURCE_PATH / rel_path.lstrip('/')
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Local file not found")
        return file_path.read_bytes()
    
    elif url.startswith('/generated/'):
        # 映射到 GENERATED_PATH
        rel_path = url[len('/generated/'):]
        file_path = settings.GENERATED_PATH / rel_path.lstrip('/')
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Generated file not found")
        return file_path.read_bytes()
    
    # 2. 处理远程 URL
    elif url.startswith(('http://', 'https://')):
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url, timeout=30.0)
                resp.raise_for_status()
                return resp.content
            except httpx.RequestError as e:
                raise HTTPException(status_code=400, detail=f"Failed to fetch remote image: {str(e)}")
            except httpx.HTTPStatusError as e:
                raise HTTPException(status_code=e.response.status_code, detail="Remote server error")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid URL format")

def convert_image(content: bytes, target_format: str) -> io.BytesIO:
    """同步的图片转换逻辑 (将在线程池中运行)"""
    try:
        # 打开图片
        img = Image.open(io.BytesIO(content))
        
        # 转换模式
        # BMP 不需要 Alpha 通道，通常是 RGB
        # TIFF 支持 RGBA
        # JPEG 不支持 RGBA, 需要转 RGB
        if target_format.lower() in ('jpg', 'jpeg', 'bmp') and img.mode == 'RGBA':
            img = img.convert('RGB')
        
        output = io.BytesIO()
        # 保存为目标格式
        save_format = target_format.upper()
        if save_format == 'JPG':
            save_format = 'JPEG'
            
        img.save(output, format=save_format)
        output.seek(0)
        return output
    except Exception as e:
        raise ValueError(f"Image conversion failed: {str(e)}")

@router.get("/download", summary="下载并转换图片")
async def download_image(
    url: str = Query(..., description="图片 URL (本地或远程)"),
    format: str = Query('png', description="目标格式 (png, jpg, webp, bmp, tiff)")
):
    """
    下载图片并转换为指定格式返回流
    """
    try:
        decoded_url = unquote(url)
        
        # 1. 获取图片内容 (Async IO)
        content = await fetch_image_content(decoded_url)
        
        # 2. 转换格式 (CPU bound -> ThreadPool)
        # 验证格式
        valid_formats = {'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'}
        if format.lower() not in valid_formats:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {format}")
            
        output_stream = await run_in_threadpool(convert_image, content, format)
        
        # 3. 返回流
        filename = f"image.{format.lower()}"
        media_type = f"image/{format.lower()}"
        if format.lower() == 'jpg':
            media_type = "image/jpeg"
            
        return StreamingResponse(
            output_stream,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
