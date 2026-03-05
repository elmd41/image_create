'''
批量处理图片，生成向量并构建索引的脚本。

该脚本会执行以下操作：
1. 扫描配置中指定的图片源目录 (IMAGE_SOURCE_PATH)。
2. 对每张图片：
   a. 检查是否已在 SQLite 数据库中存在记录，如果存在则跳过。
   b. 如果不存在，将其元数据（路径、文件名等）添加到 SQLite 数据库，并获取一个唯一的 ID。
   c. 调用千问 Embedding 服务为图片生成向量。
   d. 将生成的向量与 SQLite 中的 ID 关联，存入 ChromaDB 向量库。
'''
import os
import sys
import traceback
from pathlib import Path
from tqdm import tqdm

# 将项目根目录的 'back' 文件夹添加到 Python 路径中
# 这是为了能够正确地从脚本中导入 'app' 模块
# 获取当前脚本文件所在的目录 (scripts)
scripts_dir = Path(__file__).parent
# 获取项目根目录 (picture-ai/picture-ai)
project_root = scripts_dir.parent
# 获取后端代码目录 (back)
back_dir = project_root / 'back'
# 将 back 目录添加到系统路径
sys.path.insert(0, str(back_dir))

# 导入我们重构好的模块
from app.config.settings import settings
from app.db.sqlite import image_metadata_db
from app.vectorstore.faiss_manager import faiss_manager
from app.service.embedding import qwen_embedding_service

def get_image_files(directory: Path) -> list[Path]:
    """递归地查找指定目录下的所有图片文件"""
    image_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif']
    image_files = []
    for ext in image_extensions:
        image_files.extend(directory.rglob(f'*{ext}'))
    return image_files

def main():
    """主函数，执行索引构建流程"""
    print("--- 开始构建图片索引 ---")
    
    # 1. 检查并获取图片源目录
    image_source_dir = settings.IMAGE_SOURCE_PATH
    if not image_source_dir.exists() or not image_source_dir.is_dir():
        print(f"错误：图片源目录不存在或不是一个文件夹: {image_source_dir}")
        print("请确保在 back/data/images 文件夹中放入了你的图片，或者在 settings.py 中配置了正确的 IMAGE_SOURCE_PATH。")
        return

    print(f"1. 从目录 '{image_source_dir}' 扫描图片文件...")
    image_paths = get_image_files(image_source_dir)
    
    if not image_paths:
        print("在指定目录中没有找到任何图片文件。")
        return

    print(f"   找到 {len(image_paths)} 张图片。")
    
    # 2. 遍历所有图片，处理并存入数据库和向量库
    print("\n2. 开始处理图片，生成向量并存入数据库...")
    
    # 使用 tqdm 创建一个进度条
    for image_path in tqdm(image_paths, desc="处理进度"):
        try:
            # 将 Path 对象转换为绝对路径字符串
            abs_image_path = str(image_path.resolve())

            # a. 检查图片是否已处理
            tqdm.write(f"--- 开始处理: {image_path.name} ---")
            tqdm.write("步骤 A: 检查 SQLite 中是否存在...")
            existing_id = image_metadata_db.get_image_id_by_path(abs_image_path)
            if existing_id:
                # tqdm.write 会在不打乱进度条的情况下打印信息
                tqdm.write(f"跳过已存在的图片: {image_path.name}")
                continue

            # b. 添加图片元数据到 SQLite，并获取 ID
            tqdm.write("步骤 B: 添加元数据到 SQLite...")
            image_id = image_metadata_db.add_image(abs_image_path)
            if not image_id:
                tqdm.write(f"警告：无法为图片 {image_path.name} 添加到数据库。")
                continue
            tqdm.write(f"-> 已添加到 SQLite, ID: {image_id}")

            # c. 生成图片向量
            tqdm.write("步骤 C: 调用千问 API 生成向量...")
            embedding = qwen_embedding_service.get_image_embedding(abs_image_path)
            tqdm.write(f"-> 向量生成成功，维度: {len(embedding)}")

            # d. 将向量添加到 FAISS
            tqdm.write("步骤 D: 添加向量到 FAISS...")
            # FAISS 的 ID 需要是整数类型
            faiss_manager.add_vectors(
                ids=[image_id],
                embeddings=[embedding]
            )
            tqdm.write("-> 向量添加成功。")
            
        except Exception as e:
            tqdm.write(f"处理图片 {image_path.name} 时发生错误: {e}")
            tqdm.write(traceback.format_exc())

    # 3. 保存 FAISS 索引到磁盘
    print("\n3. 保存向量索引到磁盘...")
    faiss_manager.save_index()

    print("\n--- 索引构建完成 ---")
    print(f"总共处理了 {len(image_paths)} 个文件路径。")
    print(f"当前 SQLite 数据库中有 {len(image_metadata_db.list_all_images())} 条记录。")
    print(f"当前 FAISS 索引中有 {faiss_manager.count()} 个向量。")

if __name__ == "__main__":
    main()
