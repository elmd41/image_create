# 部署检查清单

## ✅ 已完成的准备工作

### 1. 配置文件
- [x] Dockerfile - 后端镜像构建文件
- [x] docker-compose.yml - Docker Compose 配置
- [x] nginx.conf - Nginx 配置
- [x] .env.production - 环境变量模板（需要填入真实API密钥）
- [x] service.sh - 服务管理脚本
- [x] deploy.sh - 一键部署脚本
- [x] migrate-db.sh - 数据库迁移脚本
- [x] init-db/01-init.sql - 数据库初始化SQL
- [x] README.md - 部署文档

### 2. 构建产物
- [x] 前端构建产物: `picture-ai/web/dist/`

## ⚠️ 需要完成的工作

### 第一步：配置API密钥
在 `deploy/.env.production` 中填入真实的API密钥：
```bash
DASHSCOPE_API_KEY=your_real_key_here
VOLC_API_KEY=your_real_key_here  
QWEN_IMAGE_LAYERED_API_KEY=your_real_key_here
```

### 第二步：下载SAM模型（可选）
如果需要使用图像分割功能：
```bash
# 下载到 picture-ai/back/models/sam/ 目录
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
```

### 第三步：上传到服务器
使用以下方式之一上传：

#### 方式1：使用 SCP
```bash
# 上传整个项目（排除不必要的文件）
scp -r picture-ai/ deploy/ root@115.120.248.123:/opt/picture-ai/
```

#### 方式2：使用 rsync（推荐）
```bash
rsync -avz --exclude 'node_modules' --exclude 'venv' --exclude '.git' \
    picture-ai/ root@115.120.248.123:/opt/picture-ai/
rsync -avz deploy/ root@115.120.248.123:/opt/picture-ai/deploy/
```

### 第四步：服务器端部署
```bash
# 1. 登录服务器
ssh root@115.120.248.123
# 密码: Dlskj2025

# 2. 执行部署脚本
cd /opt/picture-ai/deploy
chmod +x deploy.sh service.sh migrate-db.sh
./deploy.sh

# 或者手动部署：
# 3. 复制环境变量文件
cp .env.production .env

# 4. 启动服务
docker-compose up -d --build

# 5. 查看日志
docker-compose logs -f
```

### 第五步：验证部署
```bash
# 检查容器状态
docker-compose ps

# 健康检查
curl http://localhost:8023/health
curl http://115.120.248.123:8023/

# 查看服务状态
./service.sh status
./service.sh health
```

## 📋 部署架构说明

```
云服务器 (115.120.248.123:8023)
├── MySQL (picture-ai-mysql)
│   ├── 端口: 3306
│   ├── 数据库: picture_ai
│   └── 字符集: utf8mb4
├── Backend (picture-ai-backend)
│   ├── 端口: 8000
│   └── 框架: FastAPI
└── Nginx (picture-ai-nginx)
    ├── 端口: 8023
    ├── 静态文件: /usr/share/nginx/html
    └── API代理: /api -> backend:8000
```

## 🌐 访问地址

- **前端**: http://pic.deluagent.com 或 http://115.120.248.123:8023
- **API文档**: http://pic.deluagent.com/docs
- **健康检查**: http://pic.deluagent.com/health

## 🔧 常用管理命令

```bash
# 使用 service.sh 管理
./service.sh start      # 启动服务
./service.sh stop       # 停止服务
./service.sh restart    # 重启服务
./service.sh status     # 查看状态
./service.sh logs       # 查看日志
./service.sh health     # 健康检查
./service.sh backup     # 备份数据库

# 或使用 docker-compose
docker-compose ps       # 查看容器状态
docker-compose logs -f  # 实时查看日志
docker-compose down     # 停止并删除容器
docker-compose up -d    # 后台启动服务
```

## ⚠️ 注意事项

1. **API密钥安全**: 生产环境务必使用真实的API密钥
2. **域名解析**: 确保 pic.deluagent.com 已解析到 115.120.248.123
3. **防火墙**: 确保端口 8023 已开放
4. **数据备份**: 定期执行 `./service.sh backup` 备份数据库
5. **日志清理**: 定期清理日志文件避免磁盘空间不足
6. **SAM模型**: 如需使用分割功能，请确保已下载模型文件

## 🚀 快速部署命令

如果服务器已配置好 Docker，可直接执行：

```bash
# 在本地执行（一键上传部署）
rsync -avz --exclude 'node_modules' --exclude 'venv' --exclude '.git' \
    picture-ai/ root@115.120.248.123:/opt/picture-ai/
rsync -avz deploy/ root@115.120.248.123:/opt/picture-ai/deploy/

# 在服务器执行
ssh root@115.120.248.123 "cd /opt/picture-ai/deploy && cp .env.production .env && docker-compose up -d --build"
```

## 📝 当前状态

**准备阶段**: ✅ 完成
**部署阶段**: ⏳ 等待执行
**验证阶段**: ⏳ 等待执行

---

**最后更新**: 2026-03-11
