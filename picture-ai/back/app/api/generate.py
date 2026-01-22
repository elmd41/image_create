'''
图像生成 API 路由定义
--------------------
功能：
1. 提供 /api/generate 接口
2. 处理文生图 (Text-to-Image) 请求
3. 处理图生图 (Image-to-Image) 请求
'''

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Optional
from pydantic import BaseModel
import shutil
import os
import tempfile
import logging
from app.service.wanx_service import wanx_service

router = APIRouter()

class GenerateResponse(BaseModel):
    results: List[str] # 返回图片 URL 列表

@router.post("/generate", response_model=GenerateResponse)
def generate(
    prompt: str = Form(..., description="生成提示词"),
    file: Optional[UploadFile] = File(None, description="参考图（用于图生图）"),
    n: int = Form(1, description="生成数量"),
    size: str = Form("1024*1024", description="图片尺寸")
):
    """
    图像生成接口
    
    - **prompt**: 必需。描述想要生成的图片内容。
    - **file**: 可选。如果提供，将进行图生图（风格重绘）；否则进行文生图。
    - **n**: 生成数量，默认为 1。
    - **size**: 图片尺寸，默认为 1024*1024。
    """
    print(f"收到生成请求: prompt='{prompt}', file={file.filename if file else None}")
    
    try:
        if file:
            # --- 图生图流程 ---
            # 1. 保存上传的临时文件
            print(f"[Generate API] 接收到图生图请求，文件名: {file.filename}")
            suffix = os.path.splitext(file.filename)[1] if file.filename else ".tmp"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                shutil.copyfileobj(file.file, tmp)
                tmp_path = tmp.name
            print(f"[Generate API] 图片已保存到临时路径: {tmp_path}")
            
            try:
                # 2. 调用图生图服务
                # 注意：图生图通常需要 prompt 来辅助描述
                results = wanx_service.image_to_image(tmp_path, prompt, n, size)
                return GenerateResponse(results=results)
            finally:
                # 3. 清理临时文件
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                        print(f"[Generate API] 临时文件已清理: {tmp_path}")
                    except:
                        pass
        else:
            # --- 文生图流程 ---
            print(f"[Generate API] 接收到文生图请求，Prompt: {prompt}")
            results = wanx_service.text_to_image(prompt, n, size)
            return GenerateResponse(results=results)
            
    except Exception as e:
        logging.exception("Image generation failed")
        error_msg = str(e)
        status_code = 500
        
        # 映射配额不足错误为 403 Forbidden
        if "API 免费额度已耗尽" in error_msg or "AllocationQuota" in error_msg:
            status_code = 403
            
        raise HTTPException(status_code=status_code, detail=f"Image generation failed: {error_msg}")
