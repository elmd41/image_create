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

    # common colors
    color_map = {
        "红": "#E11D48",
        "蓝": "#2563EB",
        "绿": "#16A34A",
        "黑": "#111827",
        "白": "#F9FAFB",
        "灰": "#9CA3AF",
        "金": "#D4AF37",
        "银": "#C0C0C0",
        "米": "#D6C7B2",
        "棕": "#92400E",
        "粉": "#EC4899",
        "紫": "#7C3AED",
        "橙": "#F97316",
        "黄": "#F59E0B",
    }
    for k, v in color_map.items():
        if f"{k}色" in p or p == k or k in p:
            if any(w in p for w in ("改成", "换成", "变成", "调成", "改为")) or "颜色" in p:
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
