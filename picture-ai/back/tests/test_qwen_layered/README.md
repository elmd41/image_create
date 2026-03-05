# 千问分层模型 (Qwen-Image-Layered) 测试

本目录包含 302.ai `qwen-image-layered` API 的测试脚本。

## 文件说明

- `test_302ai_layered_api.py` - 主测试脚本，调用 302.ai API 进行图片分层（异步模式）
- `output_YYYYMMDD_HHMMSS/` - 运行脚本后自动生成的输出目录

## 使用方法

### 1. 获取 302.ai API Key

1. 访问 [302.ai](https://302.ai/) 注册账号
2. 在控制台获取 API Key

### 2. 配置 API Key

打开 `test_302ai_layered_api.py`，找到配置区域：

```python
# 请在这里填写你的 302.ai API Key
API_KEY_302 = "YOUR_302_API_KEY_HERE"
```

将 `YOUR_302_API_KEY_HERE` 替换为你的实际 API Key。

### 3. 运行测试

```bash
cd F:\work\image_create-master\picture-ai\back\tests\test_qwen_layered
python test_302ai_layered_api.py
```

### 4. 查看结果

运行完成后，会在当前目录下生成 `output_YYYYMMDD_HHMMSS` 文件夹，包含：

- `original_carpet.png` - 原始输入图片
- `submit_response.json` - 任务提交响应
- `layer_00.png` - 第 1 层图片
- `layer_01.png` - 第 2 层图片
- `layer_02.png` - 第 3 层图片
- `layer_03.png` - 第 4 层图片
- `api_response.json` - API 完整响应

## 配置参数

可在脚本中调整以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `num_layers` | 4 | 分层数量 (2-10) |
| `prompt` | "" | 分层提示词（可选，如"按颜色和花纹分层"） |
| `output_format` | "png" | 输出格式 (png/webp) |
| `enable_safety_checker` | false | 是否启用安全检查 |

## 302.ai API 调用模式

302.ai 采用**异步模式**：

1. **提交任务**: `POST /302/submit/qwen-image-layered` → 返回 `request_id`
2. **轮询状态**: `GET /302/status/{request_id}` → 返回 `status`
3. **获取结果**: 当 `status=COMPLETED` 时，响应中包含图层图片 URL

## 注意事项

1. **API Key 安全**: 不要将 API Key 提交到代码仓库
2. **网络要求**: 需要能访问 302.ai API（国内可直连）
3. **图片大小**: 大图片会增加处理时间
4. **超时设置**: 默认最大等待 300 秒，轮询间隔 3 秒

## 输出示例

```
============================================================
🎨 千问分层模型 (qwen-image-layered) API 测试
   平台: 302.ai (异步模式)
============================================================

📁 输入图片: F:\work\...\carpet.png
📂 输出目录: F:\work\...\output_20260304_144500
   ✅ 原图已复制: ...\original_carpet.png

🔄 转换图片为 base64...
   ✅ 转换完成 (长度: 123456 字符)

📤 提交分层任务到 302.ai...
   - 分层数量: 4
   - 输出格式: png
   ✅ 任务已提交 (request_id: req_abc123)

⏳ 等待任务完成 (request_id: req_abc123)...
   🔄 排队中... 位置: 2 (已等待 0s)
   🔄 处理中... (已等待 3s)
   🔄 处理中... (已等待 6s)
   ✅ 任务完成!

📥 处理分层结果...
   ✅ API 响应已保存: ...\api_response.json
   📊 共 4 个图层
   📥 下载图层 0: layer_00.png
      ✅ 已保存: ...\layer_00.png
   📥 下载图层 1: layer_01.png
      ✅ 已保存: ...\layer_01.png
   ...

============================================================
🎉 测试完成!
📂 所有结果已保存到: ...\output_20260304_144500
============================================================
```
