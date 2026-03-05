from __future__ import annotations

import re


def translate_prompt_to_params(prompt: str, layer: str | None = None) -> dict:
    """Rule-based translator: Chinese editing instruction -> edit params.

    Output schema is consumed by `edit_layer`.
    Supported params:
    - mode: 'recolor' | 'brightness' | 'saturation' | 'contrast'
    - color_hex: '#RRGGBB'
    - delta: float (-1..1)
    """
    p = (prompt or "").strip()
    if not p:
        raise ValueError("prompt is empty")

    # color hex
    m = re.search(r"#(?P<hex>[0-9a-fA-F]{6})", p)
    if m:
        return {"mode": "recolor", "color_hex": f"#{m.group('hex').upper()}"}

    # common colors (expanded per MVP spec)
    color_map = {
        # 红色系
        "深红": "#8B0000",
        "酒红": "#722F37",
        "暗红": "#8B0000",
        "红": "#E11D48",
        "浅红": "#F87171",
        # 蓝色系
        "藏蓝": "#003153",
        "深蓝": "#1E3A5F",
        "蓝": "#2563EB",
        "浅蓝": "#93C5FD",
        "天蓝": "#87CEEB",
        # 绿色系
        "深绿": "#14532D",
        "绿": "#16A34A",
        "浅绿": "#86EFAC",
        # 黑白灰
        "黑": "#111827",
        "深灰": "#374151",
        "灰": "#9CA3AF",
        "浅灰": "#D1D5DB",
        "白": "#F9FAFB",
        "米白": "#FAF5EF",
        "象牙白": "#FFFFF0",
        # 棕色系
        "深棕": "#5D4037",
        "棕": "#92400E",
        "驼": "#C19A6B",
        "驼色": "#C19A6B",
        "米": "#D6C7B2",
        "米色": "#D6C7B2",
        "卡其": "#C3B091",
        # 其他
        "金": "#D4AF37",
        "银": "#C0C0C0",
        "粉": "#EC4899",
        "紫": "#7C3AED",
        "橙": "#F97316",
        "黄": "#F59E0B",
        "青": "#06B6D4",
        "靛": "#4F46E5",
    }
    # Match longer keys first to avoid partial matches
    for k in sorted(color_map.keys(), key=len, reverse=True):
        v = color_map[k]
        if f"{k}色" in p or p == k or k in p:
            if any(w in p for w in ("改成", "换成", "变成", "调成", "改为")) or "颜色" in p or k in p:
                return {"mode": "recolor", "color_hex": v}

    # brightness/saturation/contrast adjustments
    if any(w in p for w in ("变亮", "更亮", "提亮")):
        return {"mode": "brightness", "delta": 0.18}
    if any(w in p for w in ("变暗", "更暗", "压暗")):
        return {"mode": "brightness", "delta": -0.18}
    if any(w in p for w in ("更鲜艳", "饱和度", "更饱和")):
        return {"mode": "saturation", "delta": 0.2}
    if any(w in p for w in ("更灰", "去饱和", "更素")):
        return {"mode": "saturation", "delta": -0.2}
    if any(w in p for w in ("对比度", "更清晰", "更锐利")):
        return {"mode": "contrast", "delta": 0.12}

    # default: mild contrast
    return {"mode": "contrast", "delta": 0.08, "raw": p, "layer": layer}
