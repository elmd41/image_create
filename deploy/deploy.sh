#!/bin/bash
# ========================================
# 一键部署脚本
# 在云端服务器上执行
# ========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
SERVER_IP="115.120.248.123"
SERVER_PORT="8023"
DOMAIN="pic.deluagent.com"
PROJECT_DIR="/opt/picture-ai"

# 日志函数
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 用户或 sudo 执行此脚本"
        exit 1
    fi
}

# 安装 Docker
install_docker() {
    log_step "安装 Docker..."
    
    if command -v docker &> /dev/null; then
        log_info "Docker 已安装"
        return
    fi
    
    # 安装 Docker
    curl -fsSL https://get.docker.com | bash
    
    # 启动 Docker
    systemctl start docker
    systemctl enable docker
    
    # 安装 Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    log_info "Docker 安装完成"
}

# 配置防火墙
setup_firewall() {
    log_step "配置防火墙..."
    
    if command -v ufw &> /dev/null; then
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow 8023/tcp
        ufw --force enable
        log_info "UFW 防火墙配置完成"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=22/tcp
        firewall-cmd --permanent --add-port=80/tcp
        firewall-cmd --permanent --add-port=443/tcp
        firewall-cmd --permanent --add-port=8023/tcp
        firewall-cmd --reload
        log_info "Firewalld 防火墙配置完成"
    else
        log_warn "未检测到防火墙，请手动配置"
    fi
}

# 创建项目目录
setup_project() {
    log_step "创建项目目录..."
    
    mkdir -p "$PROJECT_DIR"
    mkdir -p "$PROJECT_DIR/deploy"
    mkdir -p "$PROJECT_DIR/picture-ai/data"
    mkdir -p "$PROJECT_DIR/picture-ai/back/models/sam"
    
    log_info "项目目录创建完成"
}

# 上传项目文件
upload_files() {
    log_step "上传项目文件..."
    
    log_warn "请确保已将以下文件上传到服务器:"
    log_warn "  - $PROJECT_DIR/deploy/Dockerfile"
    log_warn "  - $PROJECT_DIR/deploy/docker-compose.yml"
    log_warn "  - $PROJECT_DIR/deploy/nginx.conf"
    log_warn "  - $PROJECT_DIR/deploy/service.sh"
    log_warn "  - $PROJECT_DIR/deploy/.env.production"
    log_warn "  - $PROJECT_DIR/picture-ai/back/ (后端代码)"
    log_warn "  - $PROJECT_DIR/picture-ai/web/dist/ (前端构建产物)"
    log_warn "  - $PROJECT_DIR/picture-ai/data/ (数据目录)"
    
    read -p "文件已上传完成? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_error "请先上传文件后再继续"
        exit 1
    fi
}

# 配置环境变量
setup_env() {
    log_step "配置环境变量..."
    
    if [ -f "$PROJECT_DIR/deploy/.env.production" ]; then
        cp "$PROJECT_DIR/deploy/.env.production" "$PROJECT_DIR/deploy/.env"
        log_info "环境变量配置完成"
    else
        log_error "找不到 .env.production 文件"
        exit 1
    fi
}

# 设置权限
set_permissions() {
    log_step "设置文件权限..."
    
    chmod +x "$PROJECT_DIR/deploy/service.sh"
    chmod +x "$PROJECT_DIR/deploy/migrate-db.sh"
    
    # 创建 systemd 服务
    cat > /etc/systemd/system/picture-ai.service << 'EOF'
[Unit]
Description=Picture AI Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/picture-ai/deploy
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable picture-ai
    
    log_info "权限配置完成"
}

# 构建并启动服务
start_services() {
    log_step "构建并启动服务..."
    
    cd "$PROJECT_DIR/deploy"
    
    # 构建镜像
    docker-compose build
    
    # 启动服务
    docker-compose up -d
    
    # 等待服务就绪
    log_info "等待服务启动..."
    sleep 30
    
    log_info "服务启动完成"
}

# 验证部署
verify_deployment() {
    log_step "验证部署..."
    
    # 检查容器状态
    log_info "检查容器状态:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    # 检查服务健康
    echo ""
    log_info "健康检查:"
    
    # MySQL
    if docker exec picture-ai-mysql mysqladmin ping -h localhost -uroot -prootpassword &>/dev/null; then
        log_info "MySQL: 正常"
    else
        log_warn "MySQL: 启动中..."
    fi
    
    # 后端
    if curl -sf http://localhost:8000/health &>/dev/null; then
        log_info "Backend: 正常"
    else
        log_warn "Backend: 启动中..."
    fi
    
    # Nginx
    if curl -sf http://localhost:8023/health &>/dev/null; then
        log_info "Nginx: 正常"
    else
        log_warn "Nginx: 启动中..."
    fi
}

# 显示部署信息
show_info() {
    echo ""
    echo "========================================"
    echo -e "${GREEN}部署完成!${NC}"
    echo "========================================"
    echo ""
    echo "访问地址:"
    echo "  - 域名: http://$DOMAIN"
    echo "  - IP:   http://$SERVER_IP:$SERVER_PORT"
    echo "  - API:  http://$SERVER_IP:$SERVER_PORT/api"
    echo "  - 文档: http://$SERVER_IP:$SERVER_PORT/docs"
    echo ""
    echo "管理命令:"
    echo "  - 查看状态: $PROJECT_DIR/deploy/service.sh status"
    echo "  - 查看日志: $PROJECT_DIR/deploy/service.sh logs"
    echo "  - 重启服务: $PROJECT_DIR/deploy/service.sh restart"
    echo "  - 停止服务: $PROJECT_DIR/deploy/service.sh stop"
    echo "  - 备份数据: $PROJECT_DIR/deploy/service.sh backup"
    echo ""
    echo "数据库连接信息:"
    echo "  - 主机: mysql (容器内) / localhost:3306 (宿主机)"
    echo "  - 用户: root"
    echo "  - 密码: rootpassword"
    echo "  - 数据库: picture_ai"
    echo ""
    echo "注意事项:"
    echo "  1. 请确保域名 $DOMAIN 已解析到 $SERVER_IP"
    echo "  2. 请确保 SAM 模型文件已下载到 models/sam/ 目录"
    echo "  3. 请在 .env 文件中填入真实的 API 密钥"
    echo "========================================"
}

# 主函数
main() {
    echo ""
    echo "========================================"
    echo "   Picture AI 云端部署脚本"
    echo "========================================"
    echo ""
    
    check_root
    install_docker
    setup_firewall
    setup_project
    upload_files
    setup_env
    set_permissions
    start_services
    verify_deployment
    show_info
}

# 执行
main "$@"
