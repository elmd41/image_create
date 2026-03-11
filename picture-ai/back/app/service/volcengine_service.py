"""Volcengine image generation service."""

from __future__ import annotations

import base64
import io
import json
import logging
import math
import mimetypes
import os
import tempfile
import time
from typing import Any

import requests
from PIL import Image

from app.config.settings import settings


logger = logging.getLogger(__name__)


class VolcengineService:
    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        api_key = getattr(settings, "VOLC_API_KEY", None)
        if not api_key:
            raise RuntimeError("VOLC_API_KEY not configured")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        timeout_s = int(getattr(settings, "VOLC_REQUEST_TIMEOUT_SECONDS", 180))
        max_retries = int(getattr(settings, "VOLC_REQUEST_MAX_RETRIES", 2))
        backoff_s = float(getattr(settings, "VOLC_REQUEST_RETRY_BACKOFF_SECONDS", 1.0))

        last_exc: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                resp = requests.post(
                    getattr(settings, "VOLC_API_ENDPOINT"),
                    headers=headers,
                    data=json.dumps(payload, ensure_ascii=False),
                    timeout=timeout_s,
                )
                if resp.status_code == 200:
                    return resp.json()
                raise RuntimeError(f"volc request failed: {resp.status_code}, {resp.text}")
            except requests.Timeout as e:
                last_exc = e
                if attempt >= max_retries:
                    break
                time.sleep(backoff_s * (2**attempt))

        raise RuntimeError("volc request timeout") from last_exc

    @staticmethod
    def _parse_urls(result: dict[str, Any]) -> list[str]:
        data = result.get("data")
        if isinstance(data, list) and data:
            url = data[0].get("url")
            if isinstance(url, str) and url:
                return [url]
        raise RuntimeError(f"unexpected volc response: {result}")

    @staticmethod
    def _normalize_size(size: str) -> str:
        raw = (size or "").strip().lower().replace("*", "x")

        # keyword sizes
        if raw in ("1k", "1024"):
            w, h = 1024, 1024
        elif raw in ("2k", "2048"):
            w, h = 2048, 2048
        elif raw in ("4k", "4096"):
            w, h = 4096, 4096
        else:
            # WxH
            if "x" in raw:
                parts = raw.split("x")
                if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                    w, h = int(parts[0].strip()), int(parts[1].strip())
                else:
                    w, h = 1024, 1024
            else:
                w, h = 1024, 1024

        w = max(1, int(w))
        h = max(1, int(h))

        min_pixels = int(getattr(settings, "VOLC_MIN_IMAGE_PIXELS", 3686400))
        align = int(getattr(settings, "VOLC_SIZE_ALIGN", 64))
        align = max(1, align)

        area = w * h
        if area < min_pixels:
            scale = math.sqrt(min_pixels / float(area))
            w = int(math.ceil(w * scale))
            h = int(math.ceil(h * scale))

        if align > 1:
            w = int(math.ceil(w / align) * align)
            h = int(math.ceil(h / align) * align)

        return f"{w}x{h}"

    @staticmethod
    def _to_base64_data_url_with_limit(file_path: str, max_encoded_bytes: int = 980 * 1024) -> str:
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = "image/png"

        try:
            img = Image.open(file_path).convert("RGB")
        except Exception:
            with open(file_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return f"data:{mime_type};base64,{b64}"

        max_dim = max(img.size)
        if max_dim > 1600:
            scale = 1600 / max_dim
            img = img.resize((max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale))))

        prefix = "data:image/jpeg;base64,"
        for q in (88, 80, 72, 65, 58, 50):
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=q, optimize=True)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            if len(prefix) + len(b64) <= max_encoded_bytes:
                return f"{prefix}{b64}"

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=45)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"{prefix}{b64}"

    def text_to_image(
        self,
        prompt: str,
        size: str = "1024*1024",
        negative_prompt: str | None = None,
        seed: int | None = None,
    ) -> list[str]:
        payload: dict[str, Any] = {
            "model": getattr(settings, "VOLC_IMAGE_MODEL"),
            "prompt": prompt,
            "response_format": "url",
            "size": self._normalize_size(size),
            "stream": False,
            "watermark": False,
        }
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        if seed is not None:
            payload["seed"] = int(seed)
        result = self._post(payload)
        return self._parse_urls(result)

    def image_to_image(
        self,
        image_path_or_url: str,
        prompt: str,
        size: str = "1024*1024",
        negative_prompt: str | None = None,
        seed: int | None = None,
    ) -> list[str]:
        tmp_path: str | None = None
        try:
            if (image_path_or_url or "").startswith(("http://", "https://")):
                # Volc img2img expects base64 image payload; URL may be rejected.
                # Download then convert to data-url.
                timeout_s = min(60, int(getattr(settings, "VOLC_REQUEST_TIMEOUT_SECONDS", 180)))
                max_retries = int(getattr(settings, "VOLC_REQUEST_MAX_RETRIES", 2))
                backoff_s = float(getattr(settings, "VOLC_REQUEST_RETRY_BACKOFF_SECONDS", 1.0))

                last_exc: Exception | None = None
                resp = None
                for attempt in range(max_retries + 1):
                    try:
                        resp = requests.get(image_path_or_url, timeout=timeout_s, stream=True)
                        resp.raise_for_status()
                        last_exc = None
                        break
                    except Exception as e:
                        last_exc = e
                        if attempt >= max_retries:
                            break
                        time.sleep(backoff_s * (2**attempt))

                if resp is None or last_exc is not None:
                    raise RuntimeError(f"failed to download reference image url: {last_exc}")

                suffix = mimetypes.guess_extension(resp.headers.get("content-type") or "") or ".png"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp_path = tmp.name
                    for chunk in resp.iter_content(chunk_size=256 * 1024):
                        if chunk:
                            tmp.write(chunk)

                image_input = self._to_base64_data_url_with_limit(tmp_path)
            else:
                if not os.path.exists(image_path_or_url):
                    raise FileNotFoundError(image_path_or_url)
                image_input = self._to_base64_data_url_with_limit(image_path_or_url)

            payload: dict[str, Any] = {
                "model": getattr(settings, "VOLC_IMAGE_MODEL"),
                "prompt": prompt,
                "image": image_input,
                "response_format": "url",
                "size": self._normalize_size(size),
                "stream": False,
                "watermark": False,
            }
            if negative_prompt:
                payload["negative_prompt"] = negative_prompt
            if seed is not None:
                payload["seed"] = int(seed)
            result = self._post(payload)
            return self._parse_urls(result)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


volcengine_service = VolcengineService()


class VolcengineMultiImageService:
    """火山引擎单图生多图服务 - 用于套色功能"""
    
    def _post_stream(self, payload: dict[str, Any]) -> list[str]:
        """发送流式请求并收集所有图片URL"""
        api_key = getattr(settings, "VOLC_API_KEY", None)
        if not api_key:
            raise RuntimeError("VOLC_API_KEY not configured")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        timeout_s = int(getattr(settings, "VOLC_REQUEST_TIMEOUT_SECONDS", 180))
        
        try:
            resp = requests.post(
                getattr(settings, "VOLC_API_ENDPOINT"),
                headers=headers,
                data=json.dumps(payload, ensure_ascii=False),
                timeout=timeout_s,
                stream=True,
            )
            
            if resp.status_code != 200:
                raise RuntimeError(f"volc request failed: {resp.status_code}, {resp.text}")
            
            # 解析流式响应
            urls = []
            for line in resp.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        if data_str.strip() == '[DONE]':
                            continue
                        try:
                            data = json.loads(data_str)
                            # 解析图片URL
                            if 'data' in data and isinstance(data['data'], list):
                                for item in data['data']:
                                    if 'url' in item and item['url']:
                                        urls.append(item['url'])
                        except json.JSONDecodeError:
                            continue
            
            return urls
        except requests.Timeout as e:
            raise RuntimeError("volc request timeout") from e
    
    def generate_color_variants(
        self,
        image_path_or_url: str,
        count: int = 2,
        color_scheme: list[str] | None = None,
        size: str = "2K",
    ) -> list[str]:
        """
        单图生成多张套色图 - 通过多次调用图生图实现
        
        Args:
            image_path_or_url: 原图路径或URL
            count: 生成数量 (2-10)
            color_scheme: 色系列表，如 ["红色", "蓝色"]，为空则全色系
            size: 输出尺寸
        
        Returns:
            生成的图片URL列表
        """
        # 限制数量范围
        count = max(2, min(10, count))
        
        # 处理图片输入 - 转换为 base64
        tmp_path: str | None = None
        try:
            if (image_path_or_url or "").startswith(("http://", "https://")):
                timeout_s = min(60, int(getattr(settings, "VOLC_REQUEST_TIMEOUT_SECONDS", 180)))
                resp = requests.get(image_path_or_url, timeout=timeout_s)
                resp.raise_for_status()
                
                import mimetypes as mt
                import tempfile as tf
                suffix = mt.guess_extension(resp.headers.get("content-type") or "") or ".png"
                with tf.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    tmp_path = tmp.name
                    tmp.write(resp.content)
                
                image_input = VolcengineService._to_base64_data_url_with_limit(tmp_path)
            else:
                if not os.path.exists(image_path_or_url):
                    raise FileNotFoundError(image_path_or_url)
                image_input = VolcengineService._to_base64_data_url_with_limit(image_path_or_url)
            
            # 生成多张图 - 每次使用不同的提示词
            urls = []
            color_options = color_scheme if color_scheme and len(color_scheme) > 0 else [
                "红色", "蓝色", "绿色", "紫色", "橙色", "青色", "金色", "粉色", "棕色", "灰色"
            ]
            
            for i in range(count):
                # 为每张图生成不同的提示词
                color_idx = i % len(color_options)
                target_color = color_options[color_idx]
                
                prompt = f"将这个地毯图案的配色改为{target_color}系，保持图案、构图和结构完全一致，只改变颜色。平面设计风格，无立体感。"
                
                payload: dict[str, Any] = {
                    "model": getattr(settings, "VOLC_IMAGE_MODEL"),
                    "prompt": prompt,
                    "image": image_input,
                    "response_format": "url",
                    "size": VolcengineService._normalize_size(size),
                    "stream": False,
                    "watermark": False,
                }
                
                # 调用API
                result = volcengine_service._post(payload)
                result_urls = VolcengineService._parse_urls(result)
                if result_urls:
                    urls.extend(result_urls)
            
            return urls
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


volcengine_multi_image_service = VolcengineMultiImageService()
