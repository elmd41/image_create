#!/bin/bash
# ========================================
# Picture AI 云端部署脚本
# 服务器: 115.120.248.123:8023
# 域名: pic.deluagent.com
# ========================================

set -e

echo "=========================================="
echo "Picture AI 部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
APP_DIR="/var/www/picture-ai"
NGINX_CONTAINER="nginx"  # Nginx容器名称，根据实际情况修改
MYSQL_CONTAINER="mysql"  # MySQL容器名称，根据实际情况修改
MYSQL_ROOT_PASSWORD="rootpassword"

# ========================================
# 1. 检查环境
# ========================================
echo -e "${YELLOW}[1/7] 检查环境...${NC}"

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

# 检查运行中的容器
echo "当前运行的Docker容器:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# 查找Nginx和MySQL容器
NGINX_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i nginx | head -1)
MYSQL_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i mysql | head -1)

if [ -z "$NGINX_CONTAINER" ]; then
    echo -e "${RED}警告: 未找到Nginx容器，请手动指定容器名称${NC}"
fi

if [ -z "$MYSQL_CONTAINER" ]; then
    echo -e "${RED}警告: 未找到MySQL容器，请手动指定容器名称${NC}"
fi

echo -e "${GREEN}Nginx容器: $NGINX_CONTAINER${NC}"
echo -e "${GREEN}MySQL容器: $MYSQL_CONTAINER${NC}"

# ========================================
# 2. 创建目录结构
# ========================================
echo -e "${YELLOW}[2/7] 创建目录结构...${NC}"

mkdir -p $APP_DIR/{back,web,data}
mkdir -p $APP_DIR/data/{generated,vector_store,images,logs}
mkdir -p /var/log/picture-ai

echo -e "${GREEN}目录创建完成${NC}"

# ========================================
# 3. 安装Python依赖
# ========================================
echo -e "${YELLOW}[3/7] 安装Python依赖...${NC}"

# 检查Python版本
python3 --version

# 安装pip（如果没有）
if ! command -v pip3 &> /dev/null; then
    apt-get update && apt-get install -y python3-pip
fi

# 进入后端目录并安装依赖
cd $APP_DIR/back
if [ -f "requirements.txt" ]; then
    pip3 install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    echo -e "${GREEN}Python依赖安装完成${NC}"
else
    echo -e "${RED}警告: requirements.txt 不存在${NC}"
fi

# ========================================
# 4. 初始化MySQL数据库
# ========================================
echo -e "${YELLOW}[4/7] 初始化MySQL数据库...${NC}"

# 复制SQL脚本到MySQL容器
docker cp $APP_DIR/deploy/init_database.sql $MYSQL_CONTAINER:/tmp/

# 执行SQL脚本
docker exec -i $MYSQL_CONTAINER mysql -uroot -p$MYSQL_ROOT_PASSWORD < $APP_DIR/deploy/init_database.sql

echo -e "${GREEN}数据库初始化完成${NC}"

# ========================================
# 5. 配置Nginx
# ========================================
echo -e "${YELLOW}[5/7] 配置Nginx...${NC}"

# 复制Nginx配置到容器
docker cp $APP_DIR/deploy/nginx.conf $NGINX_CONTAINER:/etc/nginx/conf.d/pic.deluagent.com.conf

# 测试Nginx配置
docker exec $NGINX_CONTAINER nginx -t

# 重载Nginx
docker exec $NGINX_CONTAINER nginx -s reload

echo -e "${GREEN}Nginx配置完成${NC}"

# ========================================
# 6. 配置环境变量
# ========================================
echo -e "${YELLOW}[6/7] 配置环境变量...${NC}"

# 复制环境变量文件
cp $APP_DIR/deploy/env.production $APP_DIR/back/.env

echo -e "${YELLOW}请编辑 $APP_DIR/back/.env 填入API密钥${NC}"

# ========================================
# 7. 设置systemd服务
# ========================================
echo -e "${YELLOW}[7/7] 设置持久化服务...${NC}"

# 复制service文件
cp $APP_DIR/deploy/picture-ai.service /etc/systemd/system/

# 重载systemd
systemctl daemon-reload

# 启用并启动服务
systemctl enable picture-ai
systemctl start picture-ai

# 检查服务状态
systemctl status picture-ai --no-pager

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "访问地址: http://pic.deluagent.com"
echo ""
echo "常用命令:"
echo "  查看后端日志: tail -f /var/log/picture-ai/backend.log"
echo "  重启服务: systemctl restart picture-ai"
echo "  查看服务状态: systemctl status picture-ai"
echo ""
echo -e "${YELLOW}注意: 请确保已配置好 .env 文件中的API密钥${NC}"
