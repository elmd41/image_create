'''
[示例文件] 图片上传与搜索接口示例
------------------------------
注意：此文件当前未在 main.py 中注册，仅作为参考示例。
实际的搜索逻辑在 api/search.py 中。

功能：
1. 展示基本的文件上传处理
2. 展示模拟的搜索返回结果

作业：
- 对比此文件与 api/search.py 的区别，理解正式代码是如何组织的
'''
from fastapi import APIRouter, File, UploadFile, HTTPException
from typing import List
import uuid
import os

router = APIRouter(prefix="/api/images", tags=["图片相关接口"])

# 模拟存储目录
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("/upload", summary="上传图片")
async def upload_image(file: UploadFile = File(...)):
    """
    上传图片并保存到服务器
    """
    try:
        # 获取文件后缀
        file_extension = os.path.splitext(file.filename)[1]
        # 生成唯一文件名
        file_id = str(uuid.uuid4())
        file_name = f"{file_id}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        
        # 保存文件
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
            
        return {
            "code": 200, 
            "message": "上传成功", 
            "data": {
                "id": file_id, 
                "url": f"/static/uploads/{file_name}"
            }
        }
    except Exception as e:
        return {"code": 500, "message": f"上传失败: {str(e)}"}

@router.post("/search", summary="图找图")
async def search_by_image(file: UploadFile = File(...)):
    """
    通过上传的图片搜索库中相似的图片
    """
    try:
        # 读取图片内容用于特征提取
        content = await file.read()
        
        # TODO: 集成特征提取模型 (如 ResNet, CLIP) 和 向量数据库 (如 Milvus, Faiss)
        # 1. 将 content 转换为 image tensor
        # 2. 提取特征向量
        # 3. 在向量库中检索 top_k 个相似结果
        
        # 模拟返回检索结果
        mock_results = [
            {"id": "101", "score": 0.992, "url": "http://cdn.example.com/img1.jpg"},
            {"id": "102", "score": 0.856, "url": "http://cdn.example.com/img2.jpg"},
            {"id": "103", "score": 0.721, "url": "http://cdn.example.com/img3.jpg"}
        ]
        
        return {
            "code": 200, 
            "message": "检索完成", 
            "data": mock_results
        }
    except Exception as e:
        return {"code": 500, "message": f"搜索失败: {str(e)}"}
