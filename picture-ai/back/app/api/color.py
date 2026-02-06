"""颜色处理 API

提供：
1. 主色提取 - 提取图像主色调
2. 像素级换色 - 实时颜色映射
3. 配色推荐 - LLM 辅助风格词配色
"""

from __future__ import annotations

import base64
import logging
from io import BytesIO

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel, Field

from app.service.color.color_transfer import color_transfer_service

logger = logging.getLogger(__name__)
router = APIRouter()


class ExtractPaletteResponse(BaseModel):
    """主色提取响应"""
    palette: list[dict]


class ColorMappingRequest(BaseModel):
    """换色请求"""
    image_base64: str = Field(..., description="原图 Base64")
    source_colors: list[list[int]] = Field(..., description="源颜色 [[R,G,B], ...]")
    target_colors: list[list[int]] = Field(..., description="目标颜色 [[R,G,B], ...]")
    tolerance: int = Field(40, ge=10, le=100, description="颜色匹配容差")
    preserve_luminance: bool = Field(True, description="保留原始亮度")


class ColorMappingResponse(BaseModel):
    """换色响应"""
    result_base64: str


class ColorVariantResponse(BaseModel):
    """色相变体响应"""
    variants: list[dict]  # [{colors: [[R,G,B]], image_base64: str}]


def _decode_base64_image(b64: str) -> Image.Image:
    """解码 Base64 图像"""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    data = base64.b64decode(b64)
    return Image.open(BytesIO(data)).convert("RGB")


def _encode_image_base64(img: Image.Image) -> str:
    """编码图像为 Base64"""
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


@router.post("/color/extract-palette", response_model=ExtractPaletteResponse)
async def extract_palette(
    file: UploadFile = File(..., description="图片文件"),
    n_colors: int = Form(5, ge=2, le=10, description="提取颜色数量"),
) -> ExtractPaletteResponse:
    """
    提取图像主色调
    
    使用 K-Means 聚类算法提取图像中占比最高的颜色
    """
    logger.info("【color/extract-palette】n_colors=%d", n_colors)
    
    try:
        content = await file.read()
        img = Image.open(BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e
    
    img_arr = np.array(img)
    palette = color_transfer_service.extract_palette(img_arr, n_colors)
    
    return ExtractPaletteResponse(palette=palette)


@router.post("/color/apply-mapping", response_model=ColorMappingResponse)
async def apply_color_mapping(req: ColorMappingRequest) -> ColorMappingResponse:
    """
    应用颜色映射（实时换色）
    
    将图像中的源颜色替换为目标颜色，支持容差匹配和亮度保留
    """
    logger.info(
        "【color/apply-mapping】%d 组颜色映射",
        len(req.source_colors)
    )
    
    try:
        img = _decode_base64_image(req.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e
    
    if len(req.source_colors) != len(req.target_colors):
        raise HTTPException(status_code=422, detail="源颜色和目标颜色数量必须相同")
    
    img_arr = np.array(img)
    result = color_transfer_service.apply_color_mapping(
        img_arr,
        req.source_colors,
        req.target_colors,
        tolerance=req.tolerance,
        preserve_luminance=req.preserve_luminance,
    )
    
    result_img = Image.fromarray(result)
    return ColorMappingResponse(result_base64=_encode_image_base64(result_img))


@router.post("/color/generate-variants", response_model=ColorVariantResponse)
async def generate_color_variants(
    file: UploadFile = File(..., description="图片文件"),
    n_colors: int = Form(3, ge=2, le=5, description="提取颜色数量"),
) -> ColorVariantResponse:
    """
    生成色相变体
    
    自动提取主色调并生成多个色相偏移的变体版本
    """
    logger.info("【color/generate-variants】")
    
    try:
        content = await file.read()
        img = Image.open(BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"图片解析失败: {e}") from e
    
    img_arr = np.array(img)
    
    # 提取主色调
    palette = color_transfer_service.extract_palette(img_arr, n_colors)
    base_colors = [c["rgb"] for c in palette]
    
    # 生成变体
    variants_data = color_transfer_service.generate_color_variants(img_arr, base_colors)
    
    variants = []
    for new_colors, result in variants_data:
        result_img = Image.fromarray(result)
        variants.append({
            "colors": new_colors,
            "palette": [
                {"rgb": c, "hex": "#{:02x}{:02x}{:02x}".format(*c)}
                for c in new_colors
            ],
            "image_base64": _encode_image_base64(result_img),
        })
    
    return ColorVariantResponse(variants=variants)
