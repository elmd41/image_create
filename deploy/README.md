# Picture AI 云端部署指南

## 概述

本文档说明如何将 Picture AI 项目部署到云端服务器。

### 服务器信息

| 项目 | 值 |
|------|-----|
| 服务器IP | <your-server-ip> |
| 服务端口 | 8023 |
| 域名 | <your-domain> |
| MySQL用户 | <your-mysql-user> |
| MySQL密码 | <your-mysql-password> |

---

## 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                    云服务器 (Docker)                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Nginx     │  │   Backend   │  │    MySQL    │     │
│  │  (端口8023)  │──│  (端口8000)  │──│  (端口3306)  │     │
│  │  静态文件+代理 │  │  FastAPI    │  │   数据存储   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                                    │          │
│         ▼                                    ▼          │
│  ┌─────────────┐                    ┌─────────────┐     │
│  │  前端静态文件 │                    │  数据卷挂载   │     │
│  │  web/dist/  │                    │  mysql_data │     │
│  └─────────────┘                    └─────────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

## 部署步骤

### 第一步：本地准备

#### 1. 构建前端
```bash
cd picture-ai/web
npm install
npm run build
```

#### 2. 准备配置文件
编辑 `deploy/.env.production`，填入真实的 API 密钥：
```env
DASHSCOPE_API_KEY=your_real_key
VOLC_API_KEY=your_real_key
QWEN_IMAGE_LAYERED_API_KEY=your_real_key
```

#### 3. 下载 SAM 模型（可选）
```bash
# 下载到 picture-ai/back/models/sam/ 目录
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
```

### 第二步：上传到服务器

使用 SCP 或其他工具上传项目到服务器：

```bash
# 在本地执行
scp -r picture-ai root@115.120.248.123:/opt/

# 或者使用 rsync
rsync -avz --exclude 'node_modules' --exclude 'venv' --exclude '.git' \
    picture-ai/ root@115.120.248.123:/opt/picture-ai/
```

需要上传的关键文件：
- `picture-ai/back/` - 后端代码
- `picture-ai/web/dist/` - 前端构建产物
- `picture-ai/data/` - 数据目录（如果有）
- `picture-ai/back/models/sam/` - SAM 模型（如果有）
- `deploy/` - 部署配置目录

### 第三步：服务器配置

#### 1. 登录服务器
```bash
ssh root@<your-server-ip>
# 使用密钥登录或安全密码管理工具，不要在文档中明文记录密码
```

#### 2. 安装 Docker（如果未安装）
```bash
curl -fsSL https://get.docker.com | bash
systemctl start docker
systemctl enable docker

# 安装 Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

#### 3. 配置防火墙
```bash
# CentOS/RHEL
firewall-cmd --permanent --add-port=8023/tcp
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --reload

# Ubuntu/Debian
ufw allow 8023/tcp
ufw allow 80/tcp
```

### 第四步：启动服务

```bash
cd /opt/picture-ai/deploy

# 复制环境变量文件
cp .env.production .env

# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

### 第五步：验证部署

```bash
# 检查容器状态
docker-compose ps

# 健康检查
curl http://localhost:8023/health

# 访问测试
curl http://115.120.248.123:8023/
```

---

## 管理命令

### 服务管理
```bash
# 使用管理脚本
./service.sh start     # 启动服务
./service.sh stop      # 停止服务
./service.sh restart   # 重启服务
./service.sh status    # 查看状态
./service.sh logs      # 查看日志
./service.sh health    # 健康检查

# 或使用 docker-compose
docker-compose up -d
docker-compose down
docker-compose logs -f
docker-compose ps
```

### 数据库管理
```bash
# 备份
./service.sh backup

# 恢复
./service.sh restore /opt/backups/picture_ai_xxx.sql.gz

# 直接连接
docker exec -it picture-ai-mysql mysql -u<your-mysql-user> -p<your-mysql-password> picture_ai
```

### 更新部署
```bash
# 更新代码后重新构建
cd /opt/picture-ai/deploy
docker-compose build backend
docker-compose up -d
```

---

## 域名配置

### DNS 解析
在域名服务商添加 A 记录：
- 主机记录: `pic`
- 记录类型: `A`
- 记录值: `115.120.248.123`

### HTTPS 配置（可选）
```bash
# 安装 certbot
apt install certbot python3-certbot-nginx  # Ubuntu
yum install certbot python3-certbot-nginx  # CentOS

# 申请证书
certbot --nginx -d pic.deluagent.com

# 自动续期
certbot renew --dry-run
```

---

## 故障排查

### 容器无法启动
```bash
# 查看详细日志
docker-compose logs backend
docker-compose logs mysql

# 检查容器状态
docker inspect picture-ai-backend
```

### MySQL 连接失败
```bash
# 检查 MySQL 是否就绪
docker exec picture-ai-mysql mysqladmin ping -h localhost -uroot -prootpassword

# 检查网络
docker network inspect picture-ai-network
```

### 前端无法访问 API
```bash
# 检查 Nginx 配置
docker exec picture-ai-nginx nginx -t

# 检查后端是否正常
curl http://localhost:8000/health
```

### 上传图片失败（格式或体积问题）
建议按以下顺序排查：
1. 确认前端已启用上传前自动转换/压缩；
2. 检查后端 `/api/convert/image` 与 `/api/interactive/upload` 日志；
3. 优先使用 PNG/JPG/WEBP，TIFF/BMP/HEIC 走转换流程；
4. 对超大图片先压缩再上传，避免链路超时。

---

## 文件结构

```
/opt/picture-ai/
├── deploy/
│   ├── Dockerfile          # 后端镜像构建文件
│   ├── docker-compose.yml  # Docker Compose 配置
│   ├── nginx.conf          # Nginx 配置
│   ├── .env                # 环境变量（敏感信息）
│   ├── .env.production     # 环境变量模板
│   ├── deploy.sh           # 一键部署脚本
│   ├── service.sh          # 服务管理脚本
│   ├── migrate-db.sh       # 数据库迁移脚本
│   └── init-db/
│       └── 01-init.sql     # 数据库初始化 SQL
├── picture-ai/
│   ├── back/               # 后端代码
│   ├── web/dist/           # 前端构建产物
│   ├── data/               # 数据目录
│   └── back/models/sam/    # SAM 模型
└── backups/                # 数据库备份目录
```

---

## 注意事项

1. **API 密钥安全**: 生产环境请使用真实的 API 密钥，并妥善保管 `.env` 文件
2. **数据持久化**: MySQL 数据存储在 Docker 卷中，重启不会丢失
3. **日志管理**: 定期清理日志，避免磁盘空间不足
4. **备份策略**: 建议设置定时任务自动备份数据库
5. **SAM 模型**: 如需使用分割功能，请确保 SAM 模型文件已下载
