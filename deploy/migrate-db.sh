#!/bin/bash
# ========================================
# 数据库迁移脚本
# 从 SQLite 迁移数据到 MySQL
# ========================================

set -e

echo "========================================"
echo "数据库迁移脚本: SQLite -> MySQL"
echo "========================================"

# 配置变量
MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-rootpassword}"
MYSQL_DATABASE="${MYSQL_DATABASE:-picture_ai}"

SQLITE_DB="${SQLITE_DB:-/app/data/picture_ai.db}"

# 等待 MySQL 就绪
echo "[1/5] 等待 MySQL 服务就绪..."
until mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1" &> /dev/null; do
    echo "  MySQL 未就绪，等待中..."
    sleep 2
done
echo "  MySQL 已就绪!"

# 检查 SQLite 数据库是否存在
echo "[2/5] 检查 SQLite 数据库..."
if [ ! -f "$SQLITE_DB" ]; then
    echo "  SQLite 数据库不存在，跳过迁移"
    exit 0
fi
echo "  SQLite 数据库存在: $SQLITE_DB"

# 迁移 images 表
echo "[3/5] 迁移 images 表..."
sqlite3 "$SQLITE_DB" "SELECT id, file_path, file_name, file_size, created_at FROM images;" 2>/dev/null | while IFS='|' read -r id file_path file_name file_size created_at; do
    if [ -n "$file_path" ]; then
        mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "
            INSERT IGNORE INTO images (file_path, file_name, file_size, created_at) 
            VALUES ('$file_path', '$file_name', $file_size, '$created_at');
        " 2>/dev/null || true
    fi
done
echo "  images 表迁移完成"

# 迁移 chat_sessions 表
echo "[4/5] 迁移 chat_sessions 表..."
sqlite3 "$SQLITE_DB" "SELECT id, title, thumbnail, first_prompt, message_count, created_at, updated_at FROM chat_sessions;" 2>/dev/null | while IFS='|' read -r id title thumbnail first_prompt message_count created_at updated_at; do
    if [ -n "$id" ]; then
        # 转义单引号
        title="${title//\'/\\\'}"
        thumbnail="${thumbnail//\'/\\\'}"
        first_prompt="${first_prompt//\'/\\\'}"
        mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "
            INSERT IGNORE INTO chat_sessions (id, title, thumbnail, first_prompt, message_count, created_at, updated_at) 
            VALUES ('$id', '$title', '$thumbnail', '$first_prompt', $message_count, '$created_at', '$updated_at');
        " 2>/dev/null || true
    fi
done
echo "  chat_sessions 表迁移完成"

# 迁移 edit_sessions 表
echo "[5/5] 迁移 edit_sessions 表..."
sqlite3 "$SQLITE_DB" "SELECT id, title, thumbnail, original_image, layer_count, step_count, created_at, updated_at FROM edit_sessions;" 2>/dev/null | while IFS='|' read -r id title thumbnail original_image layer_count step_count created_at updated_at; do
    if [ -n "$id" ]; then
        title="${title//\'/\\\'}"
        thumbnail="${thumbnail//\'/\\\'}"
        original_image="${original_image//\'/\\\'}"
        mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "
            INSERT IGNORE INTO edit_sessions (id, title, thumbnail, original_image, layer_count, step_count, created_at, updated_at) 
            VALUES ('$id', '$title', '$thumbnail', '$original_image', $layer_count, $step_count, '$created_at', '$updated_at');
        " 2>/dev/null || true
    fi
done
echo "  edit_sessions 表迁移完成"

echo "========================================"
echo "数据库迁移完成!"
echo "========================================"
