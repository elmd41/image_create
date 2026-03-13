# 后端 Dockerfile
FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY picture-ai/back/requirements.txt ./requirements.txt

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir pymysql cryptography

# 复制应用代码
COPY picture-ai/back/ ./back/
COPY picture-ai/data/ ./data/

# 下载 SAM 模型（如果不存在）
RUN mkdir -p ./back/models/sam && \
    if [ ! -f ./back/models/sam/sam_vit_b_01ec64.pth ]; then \
    wget -q https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth \
    -O ./back/models/sam/sam_vit_b_01ec64.pth || echo "SAM model download failed, please download manually"; \
    fi

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/back

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
