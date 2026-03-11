# RugCanvas - 智能地毯设计系统

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

一个专为地毯设计行业打造的 AI 图像生成与编辑系统，提供从创意设计到生产稿输出的一站式解决方案。

## 🎯 核心功能

### 图像生成
- **文生图** - 根据文字描述生成地毯设计图
- **图生图** - 基于参考图进行风格重绘
- **多图生成** - 支持一次生成多张图片（如"生成3张红色地毯"）
- **智能提示词扩写** - 简短输入自动优化为专业描述

### 套色功能
- **批量配色变体** - 上传一张设计稿，自动生成多套配色方案
- **指定色系** - 可限定颜色范围（如只生成红、蓝色系）
- **保持原图结构** - 只改变颜色，保持图案和尺寸不变

### 交互式编辑
- **智能分层** - 自动识别地毯的边框、内芯、背景等区域
- **选区编辑** - 点击选择特定区域进行局部修改
- **自然语言指令** - "改成蓝色"、"变亮一点"等中文指令

### 图像搜索
- **语义搜索** - 根据文字描述搜索相似图片
- **图片搜索** - 上传图片找相似设计

### 质量控制
- **生产稿 QC** - 自动检测是否满足生产标准
- **满铺度检测** - 确保图案覆盖完整
- **透视/阴影检测** - 识别不符合平面设计稿的问题

## 🛠 技术栈

### 后端
- **FastAPI** - Python Web 框架
- **SQLite** - 会话和消息持久化
- **FAISS** - 向量相似度搜索
- **火山引擎** (doubao-seedream) - 图像生成
- **DashScope** (qwen-plus/qwen-vl-max) - 提示词优化和视觉分析

### 前端
- **React 18** + **TypeScript**
- **Vite** - 构建工具
- **HeroUI** + **Ant Design** - UI 组件库
- **Tailwind CSS** - 样式框架

## 📦 快速开始

### 环境要求
- Python 3.10+
- Node.js 18+
- npm 或 yarn

### 后端安装

```bash
cd picture-ai/back

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API 密钥
```

### 前端安装

```bash
cd picture-ai/web

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

### 启动服务

```bash
# 后端 (端口 8000)
cd picture-ai/back
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 前端 (端口 5173)
cd picture-ai/web
npm run dev
```

或使用一键启动脚本：

```bash
# Windows
start-all.bat
```

## 🔧 配置说明

### 环境变量

创建 `back/.env` 文件：

```env
# 火山引擎配置
VOLC_API_KEY=your_volcengine_api_key
VOLC_IMAGE_MODEL=doubao-seedream-3-0-t2i-250415

# DashScope 配置
DASHSCOPE_API_KEY=your_dashscope_api_key

# 服务器配置
HOST=0.0.0.0
PORT=8000
```

## 📁 项目结构

```
picture-ai/
├── back/                   # 后端服务
│   ├── app/
│   │   ├── api/           # API 路由
│   │   │   ├── generate.py      # 图像生成
│   │   │   ├── color.py         # 套色功能
│   │   │   ├── edit.py          # 图像编辑
│   │   │   ├── search.py        # 图像搜索
│   │   │   └── sessions.py      # 会话管理
│   │   ├── service/       # 业务逻辑
│   │   │   ├── volcengine_service.py   # 火山引擎调用
│   │   │   ├── vision_service.py       # 视觉分析
│   │   │   └── color_variant_service.py # 套色服务
│   │   ├── db/            # 数据库
│   │   └── config/        # 配置
│   └── requirements.txt
├── web/                    # 前端应用
│   ├── src/
│   │   ├── App.tsx        # 主应用
│   │   ├── components/    # React 组件
│   │   │   ├── chat/      # 对话相关
│   │   │   ├── editor/    # 编辑相关
│   │   │   └── layout/    # 布局相关
│   │   └── services/      # API 服务
│   └── package.json
└── data/                   # 数据存储
    ├── images/            # 图片素材库
    └── vector_store/      # 向量索引
```

## 🚀 API 文档

启动后端后访问：`http://localhost:8000/docs`

### 主要接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/generate` | POST | 文生图/图生图 |
| `/api/color-variants` | POST | 套色生成 |
| `/api/search` | POST | 图像搜索 |
| `/api/interactive/upload` | POST | 上传编辑图片 |
| `/api/interactive/edit` | POST | 执行编辑操作 |
| `/api/sessions/chat` | GET/POST | 会话管理 |

## 📝 更新日志

### v1.0.0 (2026-03-10)
- ✅ 会话持久化功能
- ✅ 历史会话侧边栏 UI
- ✅ 套色功能完善（保持原图尺寸）
- ✅ 多图生成支持
- ✅ 取消生成功能

## 📄 许可证

MIT License

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request
