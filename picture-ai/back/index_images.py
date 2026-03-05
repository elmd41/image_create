'''
图片索引脚本 (index_images.py)
-----------------------------
功能：
1. 扫描 data/images 目录下的所有图片
2. 检查哪些图片尚未入库
3. 调用千问多模态模型生成图片向量
4. 将元数据存入 SQLite，将向量存入 FAISS
5. 保存 FAISS 索引文件

使用方法：
在 back 目录下运行：
python index_images.py
'''

import os
import sys
from tqdm import tqdm

# 将当前目录添加到 Python 路径，以便能导入 app 模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.config.settings import settings
from app.db.sqlite import image_metadata_db
from app.service.embedding import qwen_embedding_service
from app.vectorstore.faiss_manager import faiss_manager

def index_images():
    print(f"开始扫描图片目录: {settings.IMAGE_SOURCE_PATH}")
    
    if not os.path.exists(settings.IMAGE_SOURCE_PATH):
        print("图片目录不存在！")
        return

    # 获取目录下所有图片文件
    image_files = [
        f for f in os.listdir(settings.IMAGE_SOURCE_PATH)
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'))
    ]
    
    print(f"找到 {len(image_files)} 张图片文件。")
    
    new_images_count = 0
    
    for file_name in tqdm(image_files, desc="处理图片"):
        file_path = os.path.join(settings.IMAGE_SOURCE_PATH, file_name)
        # 统一路径分隔符
        file_path = file_path.replace('\\', '/')
        
        # 1. 检查图片是否已存在于数据库
        existing_id = image_metadata_db.get_image_id_by_path(file_path)
        
        if existing_id:
            # 图片已存在，跳过
            continue
            
        try:
            # 2. 生成向量
            # 注意：这里需要传入绝对路径，embedding service 会处理 file:// 协议
            vector = qwen_embedding_service.get_image_embedding(file_path)
            
            # 3. 存入 SQLite 获取 ID
            image_id = image_metadata_db.add_image(file_path)
            
            # 4. 存入 FAISS
            faiss_manager.add_vectors([image_id], [vector])
            
            new_images_count += 1
            
        except Exception as e:
            print(f"\n处理图片 {file_name} 失败: {e}")
            continue

    if new_images_count > 0:
        print(f"\n成功添加 {new_images_count} 张新图片。")
        # 5. 保存索引
        faiss_manager.save_index()
    else:
        print("\n没有发现新图片，无需更新索引。")

if __name__ == "__main__":
    index_images()
