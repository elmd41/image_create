#!/bin/bash
# ========================================
# 持久化服务脚本
# 用于在云端服务器上管理服务
# ========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_DIR="/opt/picture-ai"
DEPLOY_DIR="$PROJECT_DIR/deploy"

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 启动服务
start_service() {
    log_info "启动 Picture AI 服务..."
    cd "$DEPLOY_DIR"
    docker-compose up -d
    log_info "服务启动完成!"
    show_status
}

# 停止服务
stop_service() {
    log_info "停止 Picture AI 服务..."
    cd "$DEPLOY_DIR"
    docker-compose down
    log_info "服务已停止"
}

# 重启服务
restart_service() {
    log_info "重启 Picture AI 服务..."
    stop_service
    sleep 2
    start_service
}

# 查看状态
show_status() {
    log_info "服务状态:"
    cd "$DEPLOY_DIR"
    docker-compose ps
    echo ""
    log_info "容器健康状态:"
    docker inspect --format='{{.Name}}: {{.State.Health.Status}}' picture-ai-mysql 2>/dev/null || echo "MySQL: 未启动或无健康检查"
    docker inspect --format='{{.Name}}: {{.State.Health.Status}}' picture-ai-backend 2>/dev/null || echo "Backend: 未启动或无健康检查"
    docker inspect --format='{{.Name}}: {{.State.Health.Status}}' picture-ai-nginx 2>/dev/null || echo "Nginx: 未启动或无健康检查"
}

# 查看日志
show_logs() {
    local service=$1
    cd "$DEPLOY_DIR"
    if [ -n "$service" ]; then
        docker-compose logs -f --tail=100 "$service"
    else
        docker-compose logs -f --tail=100
    fi
}

# 更新代码
update_code() {
    log_info "更新代码..."
    cd "$PROJECT_DIR"
    
    # 拉取最新代码
    git pull origin main
    
    # 重新构建前端
    log_info "构建前端..."
    cd "$PROJECT_DIR/picture-ai/web"
    npm install
    npm run build
    
    # 重新构建后端镜像
    log_info "重新构建后端镜像..."
    cd "$DEPLOY_DIR"
    docker-compose build backend
    
    # 重启服务
    restart_service
}

# 数据库备份
backup_db() {
    local backup_dir="/opt/backups"
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$backup_dir/picture_ai_$timestamp.sql"
    
    mkdir -p "$backup_dir"
    
    log_info "备份数据库到: $backup_file"
    docker exec picture-ai-mysql mysqldump -uroot -prootpassword picture_ai > "$backup_file"
    gzip "$backup_file"
    
    log_info "备份完成: ${backup_file}.gz"
    
    # 清理旧备份（保留最近7天）
    find "$backup_dir" -name "picture_ai_*.sql.gz" -mtime +7 -delete
    log_info "已清理7天前的旧备份"
}

# 数据库恢复
restore_db() {
    local backup_file=$1
    
    if [ -z "$backup_file" ]; then
        log_error "请指定备份文件路径"
        exit 1
    fi
    
    log_warn "警告: 此操作将覆盖当前数据库!"
    read -p "确认继续? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "操作已取消"
        exit 0
    fi
    
    log_info "从备份恢复数据库: $backup_file"
    
    # 解压并恢复
    gunzip -c "$backup_file" | docker exec -i picture-ai-mysql mysql -uroot -prootpassword picture_ai
    
    log_info "数据库恢复完成"
}

# 清理资源
cleanup() {
    log_info "清理无用资源..."
    docker system prune -f
    docker volume prune -f
    log_info "清理完成"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    # 检查 MySQL
    if docker exec picture-ai-mysql mysqladmin ping -h localhost -uroot -prootpassword &>/dev/null; then
        log_info "MySQL: 正常"
    else
        log_error "MySQL: 异常"
    fi
    
    # 检查后端
    if curl -sf http://localhost:8000/health &>/dev/null; then
        log_info "Backend: 正常"
    else
        log_error "Backend: 异常"
    fi
    
    # 检查 Nginx
    if curl -sf http://localhost:8023/health &>/dev/null; then
        log_info "Nginx: 正常"
    else
        log_error "Nginx: 异常"
    fi
}

# 帮助信息
show_help() {
    echo "Picture AI 服务管理脚本"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  start       启动服务"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看服务状态"
    echo "  logs [服务] 查看日志 (可选: mysql/backend/frontend/all)"
    echo "  update      更新代码并重启"
    echo "  backup      备份数据库"
    echo "  restore <文件> 恢复数据库"
    echo "  cleanup     清理无用资源"
    echo "  health      健康检查"
    echo "  help        显示帮助信息"
}

# 主入口
case "$1" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$2"
        ;;
    update)
        update_code
        ;;
    backup)
        backup_db
        ;;
    restore)
        restore_db "$2"
        ;;
    cleanup)
        cleanup
        ;;
    health)
        health_check
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac
