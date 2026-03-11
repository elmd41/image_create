-- ========================================
-- MySQL 数据库初始化脚本
-- ========================================
-- 在 MySQL 容器中执行此脚本

-- 创建数据库
CREATE DATABASE IF NOT EXISTS picture_ai 
    DEFAULT CHARACTER SET utf8mb4 
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE picture_ai;

-- 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) DEFAULT '新对话',
    thumbnail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'text',
    content TEXT,
    text TEXT,
    images JSON,
    is_user BOOLEAN DEFAULT FALSE,
    source VARCHAR(50),
    prompt TEXT,
    params JSON,
    reference_image TEXT,
    color_variant_config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 编辑会话表
CREATE TABLE IF NOT EXISTS edit_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) DEFAULT '新编辑',
    thumbnail TEXT,
    original_image TEXT,
    current_image TEXT,
    layers JSON,
    history JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 授权（如果需要远程访问）
-- GRANT ALL PRIVILEGES ON picture_ai.* TO 'root'@'%' IDENTIFIED BY 'rootpassword';
-- FLUSH PRIVILEGES;
