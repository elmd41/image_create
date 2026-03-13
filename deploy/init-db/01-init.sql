-- MySQL 初始化脚本
-- 数据库: picture_ai
-- 字符集: utf8mb4

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS picture_ai 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

USE picture_ai;

-- 图片元数据表
CREATE TABLE IF NOT EXISTS images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_path VARCHAR(512) NOT NULL UNIQUE,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_file_path (file_path),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 聊天会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255),
    thumbnail TEXT,
    first_prompt TEXT,
    message_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    type VARCHAR(50),
    content TEXT,
    text TEXT,
    prompt TEXT,
    reference_image TEXT,
    source VARCHAR(100),
    params JSON,
    images JSON,
    color_variant_config JSON,
    is_user BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 编辑会话表
CREATE TABLE IF NOT EXISTS edit_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255),
    thumbnail TEXT,
    original_image TEXT,
    layer_count INT DEFAULT 0,
    step_count INT DEFAULT 0,
    meta JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 编辑快照表
CREATE TABLE IF NOT EXISTS edit_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    step_index INT NOT NULL,
    image_data_url LONGTEXT,
    layers JSON,
    prompt TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES edit_sessions(id) ON DELETE CASCADE,
    INDEX idx_session_id (session_id),
    INDEX idx_step_index (step_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 打印初始化完成信息
SELECT 'Database picture_ai initialized successfully!' AS message;
