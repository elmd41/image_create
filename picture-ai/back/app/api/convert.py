"""
图片格式转换 API
================
将不支持的图片格式（TIFF、BMP、HEIC等）转换为 PNG/JPEG
"""
import io
import logging
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import Response
from PIL import Image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/convert", tags=["图片转换"])

MAX_DIMENSION = 4096  # 增大到 4K 以支持高清地毯图
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB - 支持更大的地毯图


@router.post("/image", summary="转换图片格式")
async def convert_image(file: UploadFile = File(...)):
    """
    将图片转换为 PNG 或 JPEG 格式
    支持 TIFF、BMP、HEIC 等浏览器不支持的格式
    """
    try:
        # 读取上传的文件
        content = await file.read()
        
        # 使用 Pillow 打开图片
        img = Image.open(io.BytesIO(content))
        
        # 转换为 RGB（处理 CMYK、P 等模式）
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            # 保持透明度，输出 PNG
            output_format = 'PNG'
            content_type = 'image/png'
        else:
            # 转换为 RGB，输出 JPEG 或 PNG
            if img.mode != 'RGB':
                img = img.convert('RGB')
            output_format = 'PNG'
            content_type = 'image/png'
        
        # 检查是否需要缩放
        width, height = img.size
        if width > MAX_DIMENSION or height > MAX_DIMENSION:
            scale = min(MAX_DIMENSION / width, MAX_DIMENSION / height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            logger.info(f"图片已缩放: {width}x{height} -> {new_width}x{new_height}")
        
        # 输出到内存
        output = io.BytesIO()
        
        if output_format == 'PNG':
            img.save(output, format='PNG', optimize=True)
        else:
            img.save(output, format='JPEG', quality=85, optimize=True)
        
        output.seek(0)
        output_bytes = output.getvalue()
        
        # 如果 PNG 太大，转为 JPEG
        if len(output_bytes) > MAX_FILE_SIZE and output_format == 'PNG':
            output = io.BytesIO()
            if img.mode == 'RGBA':
                # 有透明度，添加白色背景
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(output, format='JPEG', quality=85, optimize=True)
            output.seek(0)
            output_bytes = output.getvalue()
            content_type = 'image/jpeg'
        
        logger.info(f"图片转换成功: {file.filename} -> {content_type}, size={len(output_bytes)}")
        
        return Response(
            content=output_bytes,
            media_type=content_type,
            headers={
                "X-Original-Filename": file.filename or "image",
                "X-Converted": "true",
            }
        )
        
    except Exception as e:
        logger.error(f"图片转换失败: {e}")
        raise HTTPException(status_code=400, detail=f"图片转换失败: {str(e)}")
