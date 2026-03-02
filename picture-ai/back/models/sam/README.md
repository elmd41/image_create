# SAM 模型文件说明

## 模型下载

由于 GitHub 文件大小限制（100MB），SAM 模型文件需要手动下载。

### 下载地址
- SAM ViT-B 模型：https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
- 文件大小：357.67 MB

### 下载步骤

1. 访问上述下载地址
2. 下载 `sam_vit_b_01ec64.pth` 文件
3. 将文件放置到此目录：`picture-ai/back/models/sam/`

### 目录结构
```
picture-ai/back/models/sam/
├── README.md              # 本说明文件
└── sam_vit_b_01ec64.pth   # SAM 模型文件（需手动下载）
```

### 验证下载

下载完成后，可以运行以下命令验证：

```bash
cd picture-ai/back
python -c "
import torch
model_path = 'models/sam/sam_vit_b_01ec64.pth'
try:
    checkpoint = torch.load(model_path, map_location='cpu')
    print('模型文件加载成功')
    print(f'模型键: {list(checkpoint.keys())}')
except Exception as e:
    print(f'模型文件加载失败: {e}')
"
```

### 注意事项

- 确保下载的文件名完全匹配：`sam_vit_b_01ec64.pth`
- 模型文件较大，下载可能需要一些时间
- 下载完成后请验证文件完整性
