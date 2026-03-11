#!/bin/bash
# ========================================
# Picture AI 一键部署脚本
# ========================================
# 使用方法：
# 1. 将整个项目上传到服务器 /var/www/picture-ai
# 2. chmod +x deploy/install.sh
# 3. bash deploy/install.sh
# ========================================

set -e

echo "=========================================="
echo "Picture AI 一键部署脚本"
echo "域名: pic.deluagent.com"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/var/www/picture-ai"
MYSQL_PASSWORD="rootpassword"

# ========================================
# 步骤 1: 检查并查找 Docker 容器
# ========================================
echo -e "${YELLOW}[1/8] 检查 Docker 环境...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

echo "当前运行的 Docker 容器:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# 自动查找 nginx 和 mysql 容器
NGINX_CONTAINER=$(docker ps --format "{{.Names}}" | grep -iE "nginx" | head -1 || echo "")
MYSQL_CONTAINER=$(docker ps --format "{{.Names}}" | grep -iE "mysql|mariadb" | head -1 || echo "")

echo ""
echo -e "检测到的 Nginx 容器: ${GREEN}${NGINX_CONTAINER:-未找到}${NC}"
echo -e "检测到的 MySQL 容器: ${GREEN}${MYSQL_CONTAINER:-未找到}${NC}"
echo ""

if [ -z "$NGINX_CONTAINER" ]; then
    read -p "请输入 Nginx 容器名称: " NGINX_CONTAINER
fi

if [ -z "$MYSQL_CONTAINER" ]; then
    read -p "请输入 MySQL 容器名称: " MYSQL_CONTAINER
fi

# ========================================
# 步骤 2: 创建目录结构
# ========================================
echo -e "${YELLOW}[2/8] 创建目录结构...${NC}"

mkdir -p $APP_DIR/data/{generated,vector_store,images,logs}
mkdir -p /var/log/picture-ai

echo -e "${GREEN}目录创建完成${NC}"

# ========================================
# 步骤 3: 安装 Python 依赖
# ========================================
echo -e "${YELLOW}[3/8] 安装 Python 依赖...${NC}"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "安装 Python3..."
    apt-get update && apt-get install -y python3 python3-pip python3-venv
fi

# 创建虚拟环境
cd $APP_DIR/back
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# 激活虚拟环境并安装依赖
source venv/bin/activate
pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

echo -e "${GREEN}Python 依赖安装完成${NC}"

# ========================================
# 步骤 4: 初始化 MySQL 数据库
# ========================================
echo -e "${YELLOW}[4/8] 初始化 MySQL 数据库...${NC}"

# 执行 SQL 初始化脚本
docker exec -i $MYSQL_CONTAINER mysql -uroot -p$MYSQL_PASSWORD <<EOF
CREATE DATABASE IF NOT EXISTS picture_ai 
    DEFAULT CHARACTER SET utf8mb4 
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE picture_ai;

CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) DEFAULT '新对话',
    thumbnail MEDIUMTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'text',
    content MEDIUMTEXT,
    text MEDIUMTEXT,
    images JSON,
    is_user BOOLEAN DEFAULT FALSE,
    source VARCHAR(50),
    prompt MEDIUMTEXT,
    params JSON,
    reference_image MEDIUMTEXT,
    color_variant_config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS edit_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) DEFAULT '新编辑',
    thumbnail MEDIUMTEXT,
    original_image MEDIUMTEXT,
    current_image MEDIUMTEXT,
    layers JSON,
    history JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
EOF

echo -e "${GREEN}数据库初始化完成${NC}"

# ========================================
# 步骤 5: 配置环境变量
# ========================================
echo -e "${YELLOW}[5/8] 配置环境变量...${NC}"

cat > $APP_DIR/back/.env <<EOF
# 数据库配置 - 使用 MySQL
DB_TYPE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=$MYSQL_PASSWORD
MYSQL_DATABASE=picture_ai

# 火山引擎配置
VOLC_API_KEY=076f3484-2138-4fe1-bb65-5450d3309ab8

# DashScope 配置
DASHSCOPE_API_KEY=sk-3fab2e04b2104c05894ead0ca1e4cab1

# 服务配置
HOST=0.0.0.0
PORT=8000
DEBUG=false
BACKEND_PUBLIC_URL=http://pic.deluagent.com

# 数据目录
DATA_DIR=$APP_DIR/data
VECTOR_STORE_PATH=$APP_DIR/data/vector_store
GENERATED_PATH=$APP_DIR/data/generated
EOF

echo -e "${GREEN}环境变量配置完成${NC}"

# ========================================
# 步骤 6: 配置 Nginx
# ========================================
echo -e "${YELLOW}[6/8] 配置 Nginx...${NC}"

# 创建 Nginx 配置
cat > /tmp/pic.deluagent.com.conf <<'EOF'
server {
    listen 80;
    server_name pic.deluagent.com;

    access_log /var/log/nginx/pic.deluagent.com.access.log;
    error_log /var/log/nginx/pic.deluagent.com.error.log;

    # 前端静态文件
    location / {
        root /var/www/picture-ai/web/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
        proxy_read_timeout 300;
        client_max_body_size 50M;
    }

    # 生成的图片
    location /generated/ {
        alias /var/www/picture-ai/data/generated/;
        expires 30d;
    }
}
EOF

# 复制到 Nginx 容器
docker cp /tmp/pic.deluagent.com.conf $NGINX_CONTAINER:/etc/nginx/conf.d/

# 测试并重载 Nginx
docker exec $NGINX_CONTAINER nginx -t
docker exec $NGINX_CONTAINER nginx -s reload

echo -e "${GREEN}Nginx 配置完成${NC}"

# ========================================
# 步骤 7: 创建 systemd 服务
# ========================================
echo -e "${YELLOW}[7/8] 创建持久化服务...${NC}"

cat > /etc/systemd/system/picture-ai.service <<EOF
[Unit]
Description=Picture AI Backend Service
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/back
Environment="PATH=$APP_DIR/back/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$APP_DIR/back/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
StandardOutput=append:/var/log/picture-ai/backend.log
StandardError=append:/var/log/picture-ai/backend.error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable picture-ai

echo -e "${GREEN}systemd 服务创建完成${NC}"

# ========================================
# 步骤 8: 启动服务
# ========================================
echo -e "${YELLOW}[8/8] 启动服务...${NC}"

systemctl start picture-ai
sleep 3

# 检查服务状态
if systemctl is-active --quiet picture-ai; then
    echo -e "${GREEN}服务启动成功！${NC}"
else
    echo -e "${RED}服务启动失败，查看日志：${NC}"
    tail -20 /var/log/picture-ai/backend.error.log
fi

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "访问地址: http://pic.deluagent.com"
echo ""
echo "常用命令:"
echo "  查看服务状态: systemctl status picture-ai"
echo "  重启服务: systemctl restart picture-ai"
echo "  查看日志: tail -f /var/log/picture-ai/backend.log"
echo "  查看错误: tail -f /var/log/picture-ai/backend.error.log"
echo ""
