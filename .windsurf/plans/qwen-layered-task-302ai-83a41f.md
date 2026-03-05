# 地毯图分层编辑能力接入任务书

**基于 302.ai Qwen-Image-Layered API，替换现有 SAM 分层方案**

本任务书定义地毯图分层编辑功能的完整技术方案，通过 302.ai 提供的 Qwen-Image-Layered API 实现图片自动分层，支持颜色层、花纹层、边框层、底纹层的拆分与独立编辑。

---

## 1. 业务目标

### 1.1 核心业务场景

地毯设计师上传地毯图片后，系统自动将图片拆分为多个可编辑图层，支持：

- **颜色层**: 地毯主体颜色区域，支持一键换色
- **花纹层**: 地毯表面图案/纹理，支持替换、删除
- **边框层**: 地毯边缘装饰，支持独立编辑
- **底纹层**: 背景/基底，支持显隐控制

### 1.2 功能目标

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 自动分层 | 上传图片后自动拆分为 2-10 个图层 | P0 |
| 图层展示 | 前端展示图层列表、缩略图、可见性 | P0 |
| 单层换色 | 对选中图层进行颜色替换 | P0 |
| 图层显隐 | 控制图层可见/隐藏 | P0 |
| 图层删除 | 移除不需要的图层 | P1 |
| 图层合成 | 将编辑后的图层重新合成为完整图 | P0 |
| 局部 AI 编辑 | 对单层调用 Seedream 4.5 进行 AI 重绘 | P2 |

### 1.3 MVP 交付标准

上传地毯图 -> 自动分解为 4 个图层 -> 前端展示图层列表 -> 选中某层换色 -> 合成输出最终图

---

## 2. 技术路线

### 2.1 技术选型决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 分层模型 | Qwen-Image-Layered | 专为图片分层设计，输出多张独立 RGBA 图层 |
| API 平台 | 302.ai | 国内访问稳定，支持异步任务队列 |
| 调用模式 | 异步提交 + 轮询 | 302.ai 返回 request_id，需轮询获取结果 |
| 后端框架 | FastAPI (现有) | 复用现有架构 |
| 前端框架 | React + HeroUI (现有) | 复用现有架构 |
| AI 编辑 | Seedream 4.5 (现有) | 保留现有能力，用于单层 AI 编辑 |

### 2.2 302.ai API 接入规范

**提交任务**

`
POST https://api.302.ai/302/submit/qwen-image-layered
Headers:
  Authorization: Bearer {API_KEY_302}
  Content-Type: application/json
Body:
{
  "image_url": "https://...",
  "prompt": "分层提示词（可选）",
  "num_layers": 4,
  "enable_safety_checker": false,
  "output_format": "png"
}
Response:
{
  "request_id": "req_abc123",
  "status": "IN_QUEUE",
  "queue_position": 3
}
`

**查询状态**

`
GET https://api.302.ai/302/status/{request_id}
Headers:
  Authorization: Bearer {API_KEY_302}
Response:
{
  "request_id": "req_abc123",
  "status": "COMPLETED",
  "result": {
    "images": [
      {"url": "https://...", "content_type": "image/png"}
    ]
  }
}
`

### 2.3 系统架构

`
前端 (React + HeroUI)
  上传组件 -> 分层进度 -> 图层列表 -> 编辑操作区 -> 合成预览
                    |
                    v
后端 (FastAPI)
  POST /api/layered/decompose    -> 提交分层任务
  GET  /api/layered/task/{id}    -> 轮询任务状态
  GET  /api/layered/{id}/layers  -> 获取图层列表
  POST /api/layered/.../recolor  -> 单层换色
  POST /api/layered/.../edit     -> 单层 AI 编辑
  POST /api/layered/{id}/compose -> 图层合成
                    |
                    v
302.ai API
  POST /302/submit/qwen-image-layered  -> 提交分层
  GET  /302/status/{request_id}        -> 查询状态
`

---

## 3. 接口设计

### 3.1 提交分层任务

`
POST /api/layered/decompose
Request:
{
  "image_id": "img_xxx",
  "num_layers": 4,
  "prompt": "按颜色和花纹分层"
}
Response:
{
  "task_id": "task_abc123",
  "status": "submitted",
  "message": "分层任务已提交，请轮询状态"
}
`

### 3.2 查询任务状态

`
GET /api/layered/task/{task_id}
Response (处理中):
{
  "task_id": "task_abc123",
  "status": "processing",
  "progress": 60,
  "queue_position": 0
}
Response (完成):
{
  "task_id": "task_abc123",
  "status": "completed",
  "image_id": "img_xxx",
  "layers": [
    {
      "layer_id": "layer_001",
      "name": "颜色层",
      "url": "/generated/layers/layer_001.png",
      "thumbnail_url": "/generated/layers/layer_001_thumb.png",
      "order": 0,
      "visible": true
    }
  ]
}
`

### 3.3 单层换色

`
POST /api/layered/{image_id}/layer/{layer_id}/recolor
Request:
{
  "target_color": "#C41E3A",
  "blend_mode": "multiply"
}
Response:
{
  "layer_id": "layer_001",
  "url": "/generated/layers/layer_001_edited.png",
  "operation": "recolor"
}
`

### 3.4 图层合成

`
POST /api/layered/{image_id}/compose
Request:
{
  "layers": ["layer_001", "layer_002", "layer_003"],
  "output_format": "png"
}
Response:
{
  "composed_url": "/generated/composed/img_xxx_final.png",
  "width": 1024,
  "height": 768
}
`

---

## 4. 后端任务拆解

### 4.1 新增文件

| 文件路径 | 职责 |
|----------|------|
| back/app/service/layered/api302_service.py | 302.ai API 调用封装 |
| back/app/service/layered/layer_store.py | 图层存储管理 |
| back/app/service/layered/layer_composer.py | 多图层 RGBA 合成 |
| back/app/api/layered.py | 分层编辑 API 路由 |
| back/app/models/layered_schemas.py | Pydantic 数据模型 |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| back/app/config/settings.py | 新增 API_KEY_302 配置项 |
| back/app/main.py | 注册 /api/layered 路由 |
| back/.env | 添加 API_KEY_302=xxx |

### 4.3 删除文件

| 文件路径 | 原因 |
|----------|------|
| back/app/service/segmentation/sam_segmenter.py | SAM 分割器，完全替换 |
| back/models/sam/ | SAM 模型目录，无实际权重文件 |

---

## 5. 前端任务拆解

### 5.1 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| web/src/components/editor/EditMode.tsx | 移除 SAM mask 切换，改为图层列表展示 |
| web/src/components/editor/LayerPanel.tsx | 新增图层面板组件 |
| web/src/components/editor/LayerItem.tsx | 新增单个图层项组件 |
| web/src/services/api.ts | 新增 layered API 调用函数 |
| web/src/types/layered.ts | 新增 Layer 类型定义 |

### 5.2 前端交互流程

1. 上传图片 -> 调用 /api/layered/decompose -> 获取 task_id
2. 轮询状态 -> 每 2 秒调用 /api/layered/task/{task_id} -> 显示进度
3. 展示图层 -> 状态为 completed 后渲染图层列表
4. 选中图层 -> 点击图层项高亮，显示编辑操作区
5. 执行编辑 -> 调用对应编辑接口 -> 更新图层预览
6. 合成导出 -> 调用 /api/layered/{id}/compose -> 下载最终图

---

## 6. 数据结构设计

### 6.1 图层记录 (LayerRecord)

`python
class LayerRecord(BaseModel):
    layer_id: str
    image_id: str
    name: str
    order: int
    url: str
    thumbnail_url: str
    width: int
    height: int
    visible: bool = True
    opacity: float = 1.0
    locked: bool = False
    created_at: datetime
    updated_at: datetime
`

### 6.2 分层任务记录 (LayeredTask)

`python
class LayeredTask(BaseModel):
    task_id: str
    image_id: str
    request_id_302: str
    status: str
    progress: int = 0
    num_layers: int
    layers: list[LayerRecord] = []
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
`

---

## 7. 开发阶段

### Phase 1: 分层核心链路 (3 天)

- [ ] 新增 API_KEY_302 环境变量配置
- [ ] 实现 api302_service.py（提交 + 轮询）
- [ ] 实现 POST /api/layered/decompose
- [ ] 实现 GET /api/layered/task/{task_id}
- [ ] 实现图层下载与本地存储
- [ ] 前端轮询状态展示

### Phase 2: 图层展示与选择 (2 天)

- [ ] 实现 GET /api/layered/{image_id}/layers
- [ ] 前端图层列表组件 LayerPanel.tsx
- [ ] 图层缩略图生成
- [ ] 图层选中高亮
- [ ] 图层显隐切换

### Phase 3: 单层编辑能力 (3 天)

- [ ] 实现 POST .../recolor 换色接口
- [ ] 复用现有 layer_editor.py 换色逻辑
- [ ] 前端换色交互（颜色选择器）
- [ ] 实现图层删除
- [ ] 实现图层透明度调整

### Phase 4: 图层合成 (2 天)

- [ ] 实现 POST /api/layered/{id}/compose
- [ ] 复用现有 compositor.py 合成逻辑
- [ ] 前端合成预览
- [ ] 导出最终图

### Phase 5: SAM 代码清理 (1 天)

- [ ] 删除 sam_segmenter.py
- [ ] 删除 back/models/sam/
- [ ] 移除 interactive.py 中 SAM 相关代码
- [ ] 移除 session_store.py 中 sam_embedding 字段
- [ ] 移除前端 interactiveSwitchMask 相关代码

---

## 8. 验收标准

### 8.1 功能验收

| 验收项 | 标准 | 优先级 |
|--------|------|--------|
| 自动分层 | 上传地毯图后 3 分钟内完成分层 | P0 |
| 图层数量 | 输出 2-10 个图层（用户可配置） | P0 |
| 图层展示 | 前端正确显示所有图层缩略图 | P0 |
| 图层选择 | 点击图层项可选中并高亮 | P0 |
| 单层换色 | 选中图层后可更换颜色 | P0 |
| 图层显隐 | 可控制单个图层显示/隐藏 | P0 |
| 图层合成 | 可将可见图层合成为最终图 | P0 |
| 图层删除 | 可删除不需要的图层 | P1 |

### 8.2 性能验收

| 指标 | 标准 |
|------|------|
| 分层任务提交 | < 2 秒 |
| 分层完成时间 | < 180 秒 |
| 图层列表加载 | < 1 秒 |
| 换色操作响应 | < 3 秒 |
| 合成操作响应 | < 5 秒 |

### 8.3 兼容性验收

- [ ] 新分层链路完全替代原 SAM 分层职责
- [ ] 现有换色、亮度调整等编辑功能正常工作
- [ ] 现有 Seedream 4.5 生图功能不受影响
- [ ] 现有图片上传、存储逻辑正常工作

---

## 9. 风险控制

### 9.1 风险识别与应对

| 风险 | 影响 | 概率 | 应对方案 |
|------|------|------|----------|
| 302.ai API 延迟高 | 用户等待时间长 | 中 | 前端显示进度条，支持后台处理 |
| 302.ai API 不可用 | 功能完全不可用 | 低 | 降级到 flat_segmenter |
| 分层结果不理想 | 图层边界不清晰 | 中 | 提供重新分层按钮，支持调整 num_layers |
| 图层数量过多 | 前端渲染卡顿 | 低 | 限制最大 10 层，使用虚拟列表 |
| API_KEY_302 泄露 | 安全风险 | 低 | 仅后端使用，不暴露前端 |

### 9.2 回退方案

1. **302.ai 完全不可用**: 回退到现有 flat_segmenter（距离变换分层）
2. **分层结果不满足业务需求**: 提供手动绘制 mask 入口

---

## 10. 环境变量配置

`env
# back/.env 新增
API_KEY_302=your_302_api_key_here
`

---

## 11. 给 AI IDE 的执行要求

### 11.1 代码规范

- 所有新增文件必须包含类型注解
- API 接口必须使用 Pydantic 模型定义请求/响应
- 异步函数使用 async/await
- 日志使用 logging 模块，级别为 INFO

### 11.2 文件组织

- 302.ai 相关代码放在 back/app/service/layered/ 目录
- API 路由放在 back/app/api/layered.py
- 数据模型放在 back/app/models/layered_schemas.py

### 11.3 测试要求

- 每个 service 方法需有对应单元测试
- API 接口需有集成测试
- 测试文件放在 back/tests/test_layered/

### 11.4 错误处理

- 302.ai API 调用失败时抛出自定义异常
- 前端需显示友好错误提示
- 所有异常需记录日志

### 11.5 禁止事项

- 禁止将 API_KEY_302 硬编码在代码中
- 禁止将 API Key 暴露到前端
- 禁止删除现有 Seedream 4.5 相关代码
- 禁止修改现有生图接口

---

## 12. SAM 相关代码清理清单

删除:
- back/app/service/segmentation/sam_segmenter.py
- back/models/sam/

重构:
- back/app/api/interactive.py (移除 SAM 调用)
- back/app/service/session/session_store.py (移除 sam_embedding)
- back/app/config/settings.py (移除 SAM_* 配置)
- web/src/components/editor/EditMode.tsx (移除 SAM mask 切换)
- web/src/services/api.ts (移除 interactiveSwitchMask)

---

**任务书版本**: v2.0
**创建日期**: 2026-03-04
**最后更新**: 2026-03-04
