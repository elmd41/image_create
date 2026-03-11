"""
套色服务模块
============

专门用于单张图生成多张套色图的服务。
使用火山引擎的 sequential_image_generation 功能。
"""

from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
from typing import Any

import requests

from app.config.settings import settings

logger = logging.getLogger(__name__)


class ColorVariantService:
    """套色服务 - 单张图生成多张不同配色的图片"""

    @staticmethod
    def _normalize_size(size: str) -> str:
        """规范化尺寸参数，确保满足最小像素要求"""
        import math
        
        raw = (size or "").strip().lower().replace("*", "x")
        
        # 关键字尺寸
        if raw in ("1k", "1024"):
            w, h = 1024, 1024
        elif raw in ("2k", "2048"):
            w, h = 2048, 2048
        elif raw in ("4k", "4096"):
            w, h = 4096, 4096
        else:
            # WxH 格式
            if "x" in raw:
                parts = raw.split("x")
                if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                    w, h = int(parts[0].strip()), int(parts[1].strip())
                else:
                    w, h = 1920, 1920
            else:
                w, h = 1920, 1920
        
        w = max(1, int(w))
        h = max(1, int(h))
        
        # 最小像素要求: 3686400 (1920x1920)
        min_pixels = 3686400
        align = 64
        
        area = w * h
        if area < min_pixels:
            scale = math.sqrt(min_pixels / float(area))
            w = int(math.ceil(w * scale))
            h = int(math.ceil(h * scale))
        
        # 对齐到 64
        if align > 1:
            w = int(math.ceil(w / align) * align)
            h = int(math.ceil(h / align) * align)
        
        return f"{w}x{h}"

    @staticmethod
    def _image_to_base64_data_url(image_path: str) -> str:
        """将图片文件转换为 base64 data URL"""
        import mimetypes
        
        mime_type, _ = mimetypes.guess_type(image_path)
        if not mime_type:
            mime_type = "image/png"
        
        with open(image_path, "rb") as f:
            data = f.read()
        
        # 检查文件大小，如果太大需要压缩
        max_size = 10 * 1024 * 1024  # 10MB
        if len(data) > max_size:
            from PIL import Image
            import io
            
            img = Image.open(image_path)
            # 压缩图片
            if img.mode == 'RGBA':
                img = img.convert('RGB')
            
            # 逐步降低质量直到大小合适
            quality = 85
            while quality > 20:
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=quality)
                data = buffer.getvalue()
                if len(data) <= max_size:
                    break
                quality -= 10
            
            mime_type = "image/jpeg"
        
        b64 = base64.b64encode(data).decode("utf-8")
        return f"data:{mime_type};base64,{b64}"

    def generate_variants(
        self,
        image_path_or_base64: str,
        count: int = 2,
        color_scheme: list[str] | None = None,
        size: str = "2K",
    ) -> list[str]:
        """
        生成套色图片
        
        Args:
            image_path_or_base64: 图片路径或 base64 字符串
            count: 生成数量 (2-10)
            color_scheme: 色系列表，如 ["红色", "蓝色"]
            size: 输出尺寸
            
        Returns:
            生成的图片URL列表
        """
        api_key = getattr(settings, "VOLC_API_KEY", None)
        if not api_key:
            raise RuntimeError("VOLC_API_KEY not configured")
        
        # 限制数量
        count = max(2, min(10, count))
        
        # 准备图片输入
        tmp_path: str | None = None
        try:
            if image_path_or_base64.startswith("data:"):
                # 已经是 data URL
                image_input = image_path_or_base64
            elif image_path_or_base64.startswith(("http://", "https://")):
                # URL - 需要下载后转为 base64
                timeout_s = 60
                resp = requests.get(image_path_or_base64, timeout=timeout_s)
                resp.raise_for_status()
                
                import mimetypes
                suffix = mimetypes.guess_extension(resp.headers.get("content-type") or "") or ".png"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp_path = tmp.name
                    tmp.write(resp.content)
                
                image_input = self._image_to_base64_data_url(tmp_path)
            elif os.path.exists(image_path_or_base64):
                # 本地文件路径
                image_input = self._image_to_base64_data_url(image_path_or_base64)
            else:
                # 假设是纯 base64 字符串
                image_input = f"data:image/png;base64,{image_path_or_base64}"
            
            # 构建提示词
            if color_scheme and len(color_scheme) > 0:
                colors_str = "、".join(color_scheme)
                # 计算每个颜色大约分配多少张图
                colors_count = len(color_scheme)
                per_color = count // colors_count
                remainder = count % colors_count
                
                # 构建详细的颜色分配说明
                color_distribution = []
                for i, color in enumerate(color_scheme):
                    num = per_color + (1 if i < remainder else 0)
                    if num > 0:
                        color_distribution.append(f"{color}系{num}张（使用该颜色不同的色号，如深浅不同的变体）")
                
                distribution_str = "，".join(color_distribution)
                
                prompt = (
                    f"【套色任务】根据这张图片，生成{count}张配色变体。"
                    f"【颜色限制】只允许使用以下颜色：{colors_str}。具体分配：{distribution_str}。"
                    f"每张图只能是这些指定颜色中的一种，禁止出现其他颜色。"
                    f"同一颜色系内，请使用该颜色不同的色号/色差来区分。"
                    f"【强制要求】必须保持原图的尺寸、大小、结构、图案、元素位置完全一致，只改变颜色。输出图片的宽高比和分辨率必须与原图相同。"
                )
            else:
                prompt = (
                    f"【套色任务】根据这张图片，生成{count}张配色不同的变体。"
                    f"每张图使用完全不同的色系（如红色系、蓝色系、绿色系、紫色系、橙色系、青色系等），让{count}张图的颜色尽量丰富多样。"
                    f"【强制要求】必须保持原图的尺寸、大小、结构、图案、元素位置完全一致，只改变颜色。输出图片的宽高比和分辨率必须与原图相同。"
                )
            
            # 规范化尺寸 - 必须至少 3686400 像素
            normalized_size = self._normalize_size(size)
            
            # 构建请求
            payload = {
                "model": getattr(settings, "VOLC_IMAGE_MODEL"),
                "prompt": prompt,
                "image": image_input,
                "sequential_image_generation": "auto",
                "sequential_image_generation_options": {
                    "max_images": count
                },
                "response_format": "url",
                "size": normalized_size,
                "stream": True,
                "watermark": False,
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            }
            
            timeout_s = int(getattr(settings, "VOLC_REQUEST_TIMEOUT_SECONDS", 180))
            
            logger.info(f"[ColorVariant] 发送套色请求, count={count}, size={size}")
            logger.debug(f"[ColorVariant] Prompt: {prompt}")
            
            # 发送流式请求
            resp = requests.post(
                getattr(settings, "VOLC_API_ENDPOINT"),
                headers=headers,
                data=json.dumps(payload, ensure_ascii=False),
                timeout=timeout_s,
                stream=True,
            )
            
            if resp.status_code != 200:
                error_text = resp.text
                logger.error(f"[ColorVariant] API错误: {resp.status_code}, {error_text}")
                raise RuntimeError(f"套色API调用失败: {resp.status_code}, {error_text}")
            
            # 解析流式响应
            urls = []
            for line in resp.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    logger.debug(f"[ColorVariant] 收到行: {line_str[:200]}...")
                    
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str.strip() == '[DONE]':
                            continue
                        try:
                            data = json.loads(data_str)
                            
                            # 检查顶层 url 字段 (sequential_image_generation 模式)
                            if 'url' in data and data['url']:
                                urls.append(data['url'])
                                logger.info(f"[ColorVariant] 获取到图片URL: {data['url'][:80]}...")
                            
                            # 也检查 data 数组 (普通模式)
                            elif 'data' in data and isinstance(data['data'], list):
                                for item in data['data']:
                                    if 'url' in item and item['url']:
                                        urls.append(item['url'])
                                        logger.info(f"[ColorVariant] 获取到图片URL: {item['url'][:80]}...")
                        except json.JSONDecodeError as e:
                            logger.warning(f"[ColorVariant] JSON解析失败: {e}")
                            continue
            
            logger.info(f"[ColorVariant] 套色完成, 生成 {len(urls)} 张图片")
            
            if not urls:
                raise RuntimeError("套色生成未返回任何图片")
            
            return urls
            
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


# 单例
color_variant_service = ColorVariantService()
