from __future__ import annotations

import base64
import time
from io import BytesIO
from typing import Any

import httpx
import numpy as np
from PIL import Image

from app.config.settings import settings


def pil_to_data_url(pil_img: Image.Image, fmt: str = "PNG", quality: int = 95) -> str:
    buf = BytesIO()
    if fmt.upper() == "JPEG":
        pil_img.save(buf, format="JPEG", quality=quality)
    else:
        pil_img.save(buf, format=fmt)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    mime = "image/png" if fmt.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{b64}"


def _auth_headers() -> dict[str, str]:
    if not settings.QWEN_IMAGE_LAYERED_API_KEY:
        raise ValueError("QWEN_IMAGE_LAYERED_API_KEY 未配置")
    return {
        "Authorization": f"Bearer {settings.QWEN_IMAGE_LAYERED_API_KEY}",
        "Content-Type": "application/json",
    }


def _build_url(endpoint: str) -> str:
    base = settings.QWEN_IMAGE_LAYERED_API_BASE.rstrip("/")
    path = endpoint if endpoint.startswith("/") else f"/{endpoint}"
    return f"{base}{path}"


def _extract_urls(payload: Any) -> list[str]:
    urls: list[str] = []

    def _walk(v: Any) -> None:
        if isinstance(v, str):
            if v.startswith("http://") or v.startswith("https://"):
                urls.append(v)
            return
        if isinstance(v, dict):
            url_val = v.get("url")
            if isinstance(url_val, str) and (url_val.startswith("http://") or url_val.startswith("https://")):
                urls.append(url_val)
            for item in v.values():
                _walk(item)
            return
        if isinstance(v, list):
            for item in v:
                _walk(item)

    _walk(payload.get("output") if isinstance(payload, dict) else payload)
    if not urls:
        _walk(payload)
    return list(dict.fromkeys(urls))


async def submit_and_poll_layered(image_url: str, num_layers: int) -> tuple[dict[str, Any], list[str]]:
    submit_url = _build_url(settings.QWEN_IMAGE_LAYERED_SUBMIT_ENDPOINT)
    result_url = _build_url(settings.QWEN_IMAGE_LAYERED_RESULT_ENDPOINT)

    payload = {
        "image_url": image_url,
        "prompt": "",
        "num_layers": int(num_layers),
        "enable_safety_checker": settings.QWEN_IMAGE_LAYERED_ENABLE_SAFETY_CHECKER,
        "output_format": settings.QWEN_IMAGE_LAYERED_OUTPUT_FORMAT,
    }

    timeout = settings.QWEN_IMAGE_LAYERED_REQUEST_TIMEOUT_SECONDS
    headers = _auth_headers()

    async with httpx.AsyncClient(timeout=timeout) as client:
        submit_resp = await client.post(submit_url, json=payload, headers=headers)
        submit_resp.raise_for_status()
        submit_data = submit_resp.json()

        request_id = submit_data.get("request_id")
        if not request_id:
            raise ValueError("302.ai 返回缺少 request_id")

        deadline = time.time() + settings.QWEN_IMAGE_LAYERED_POLL_MAX_SECONDS
        final_data: dict[str, Any] = submit_data
        while time.time() < deadline:
            await _sleep_async(settings.QWEN_IMAGE_LAYERED_POLL_INTERVAL_SECONDS)
            poll_resp = await client.post(result_url, json={"request_id": request_id}, headers=headers)
            poll_resp.raise_for_status()
            text = poll_resp.text.strip()
            if not text:
                continue
            poll_data = poll_resp.json()
            final_data = poll_data
            status = str(poll_data.get("status", "")).upper()
            if status in {"COMPLETED", "SUCCEEDED", "SUCCESS", "FINISHED"}:
                urls = _extract_urls(poll_data)
                return final_data, urls
            if status in {"FAILED", "ERROR", "CANCELLED"}:
                raise ValueError(f"分层任务失败: {poll_data}")

    raise TimeoutError("Qwen-Image-Layered 轮询超时")


async def _sleep_async(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)


async def load_layer_masks(layer_urls: list[str], target_size: tuple[int, int]) -> dict[str, np.ndarray]:
    if not layer_urls:
        raise ValueError("未获取到分层结果 URL")

    w, h = target_size
    masks: dict[str, np.ndarray] = {}

    async with httpx.AsyncClient(timeout=settings.QWEN_IMAGE_LAYERED_REQUEST_TIMEOUT_SECONDS) as client:
        for idx, url in enumerate(layer_urls, start=1):
            resp = await client.get(url)
            resp.raise_for_status()
            pil = Image.open(BytesIO(resp.content)).convert("RGBA")
            if pil.size != (w, h):
                pil = pil.resize((w, h), Image.LANCZOS)
            arr = np.asarray(pil, dtype=np.uint8)
            alpha = arr[:, :, 3]
            mask = (alpha > 0).astype(np.uint8) * 255
            if int(mask.sum()) == 0:
                rgb = arr[:, :, :3]
                non_white = np.any(rgb < 250, axis=2)
                mask = non_white.astype(np.uint8) * 255
            masks[f"layer_{idx}_mask"] = mask

    union = np.zeros((h, w), dtype=np.uint8)
    for m in masks.values():
        union = np.maximum(union, m)
    masks["background_mask"] = (union == 0).astype(np.uint8) * 255

    return masks
