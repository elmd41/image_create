"""
颜色匹配模块
============

将用户选择的 HEX/RGB 颜色映射为专业的自然语言颜色名称，
用于提示词中提高模型对颜色的理解稳定性。

算法：sRGB → linear RGB → XYZ(D65) → CIE Lab，使用 ΔE CIE76 最近邻匹配。
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Union


# ==================== 数据结构 ====================

@dataclass(frozen=True)
class ColorEntry:
    name_cn: str
    name_en: str
    family: str  # red/orange/yellow/green/blue/purple/brown/neutral
    hex: str  # "#RRGGBB"
    tags: tuple[str, ...] = field(default_factory=tuple)


# ==================== 颜色词库 ====================

COLOR_LIBRARY: list[ColorEntry] = [
    # ── RED ──
    ColorEntry("樱桃红", "Cherry Red", "red", "#C1272D", ("vivid", "warm")),
    ColorEntry("朱红", "Vermilion", "red", "#D9381E", ("vivid", "warm")),
    ColorEntry("绛红", "Crimson", "red", "#8B1E3F", ("deep", "cool")),
    ColorEntry("酒红", "Burgundy", "red", "#6D0F1F", ("deep", "muted")),
    ColorEntry("玫瑰红", "Rose", "red", "#D64B7F", ("vivid", "warm")),
    ColorEntry("砖红", "Brick Red", "red", "#B23A48", ("muted", "warm")),
    ColorEntry("珊瑚红", "Coral Red", "red", "#FF5A5F", ("vivid", "warm")),
    ColorEntry("暗红", "Oxblood", "red", "#4A0D0D", ("deep", "muted")),
    ColorEntry("正红", "Pure Red", "red", "#FF0000", ("vivid", "warm")),
    ColorEntry("胭脂红", "Carmine", "red", "#960018", ("deep", "cool")),
    ColorEntry("\u6930\u7ea2", "Crimson Red", "red", "#DC143C", ("vivid", "warm")),
    ColorEntry("西瓜红", "Watermelon", "red", "#FC6C85", ("vivid", "warm")),

    # ── ORANGE ──
    ColorEntry("珊瑚橙", "Coral Orange", "orange", "#FF6F61", ("vivid", "warm")),
    ColorEntry("南瓜橙", "Pumpkin", "orange", "#FF7518", ("vivid", "warm")),
    ColorEntry("琥珀橙", "Amber", "orange", "#FFBF00", ("vivid", "warm")),
    ColorEntry("焦糖橙", "Caramel Orange", "orange", "#C96A2C", ("muted", "warm")),
    ColorEntry("杏橙", "Apricot", "orange", "#FBCEB1", ("light", "warm")),
    ColorEntry("橘橙", "Tangerine", "orange", "#F28500", ("vivid", "warm")),
    ColorEntry("赤陶", "Terracotta", "orange", "#E2725B", ("muted", "warm")),
    ColorEntry("橙色", "Orange", "orange", "#FF8C00", ("vivid", "warm")),
    ColorEntry("柿子橙", "Persimmon", "orange", "#EC5800", ("vivid", "warm")),
    ColorEntry("蜜橙", "Honey Orange", "orange", "#EB9605", ("vivid", "warm")),

    # ── YELLOW ──
    ColorEntry("柠檬黄", "Lemon", "yellow", "#FFF44F", ("vivid", "cool")),
    ColorEntry("姜黄", "Mustard", "yellow", "#D2A106", ("muted", "warm")),
    ColorEntry("香槟金", "Champagne", "yellow", "#F7E7CE", ("light", "warm")),
    ColorEntry("金黄", "Gold", "yellow", "#D4AF37", ("vivid", "warm")),
    ColorEntry("淡奶黄", "Cream", "yellow", "#FFFDD0", ("light", "warm")),
    ColorEntry("向日葵黄", "Sunflower", "yellow", "#FFC512", ("vivid", "warm")),
    ColorEntry("明黄", "Bright Yellow", "yellow", "#FFD700", ("vivid", "warm")),
    ColorEntry("鹅黄", "Gosling Yellow", "yellow", "#FFF176", ("light", "warm")),
    ColorEntry("土黄", "Ochre", "yellow", "#CC7722", ("muted", "warm")),
    ColorEntry("橄榄黄", "Olive Yellow", "yellow", "#B5A642", ("muted", "warm")),

    # ── GREEN ──
    ColorEntry("橄榄绿", "Olive", "green", "#556B2F", ("muted", "warm")),
    ColorEntry("苔藓绿", "Moss", "green", "#6B8E23", ("muted", "warm")),
    ColorEntry("翡翠绿", "Emerald", "green", "#50C878", ("vivid", "cool")),
    ColorEntry("薄荷绿", "Mint", "green", "#98FF98", ("light", "cool")),
    ColorEntry("松柏绿", "Pine", "green", "#01796F", ("deep", "cool")),
    ColorEntry("孔雀绿", "Peacock Green", "green", "#006D5B", ("deep", "cool")),
    ColorEntry("草绿", "Grass", "green", "#7CFC00", ("vivid", "warm")),
    ColorEntry("墨绿", "Dark Green", "green", "#013220", ("deep", "cool")),
    ColorEntry("豆绿", "Pea Green", "green", "#8DB600", ("muted", "warm")),
    ColorEntry("青绿", "Teal", "green", "#008080", ("muted", "cool")),
    ColorEntry("森林绿", "Forest Green", "green", "#228B22", ("deep", "cool")),
    ColorEntry("浅草绿", "Light Green", "green", "#90EE90", ("light", "cool")),

    # ── BLUE ──
    ColorEntry("天蓝", "Sky Blue", "blue", "#87CEEB", ("light", "cool")),
    ColorEntry("湖蓝", "Lake Blue", "blue", "#4AA3DF", ("vivid", "cool")),
    ColorEntry("孔雀蓝", "Peacock Blue", "blue", "#005F73", ("deep", "cool")),
    ColorEntry("宝石蓝", "Sapphire", "blue", "#0F52BA", ("vivid", "cool")),
    ColorEntry("海军蓝", "Navy", "blue", "#1F2A44", ("deep", "cool")),
    ColorEntry("钴蓝", "Cobalt", "blue", "#0047AB", ("vivid", "cool")),
    ColorEntry("冰蓝", "Ice Blue", "blue", "#D6F0FF", ("light", "cool")),
    ColorEntry("灰蓝", "Slate Blue", "blue", "#5B7C99", ("muted", "cool")),
    ColorEntry("深蓝", "Dark Blue", "blue", "#00008B", ("deep", "cool")),
    ColorEntry("蔚蓝", "Azure", "blue", "#007FFF", ("vivid", "cool")),
    ColorEntry("靛蓝", "Indigo", "blue", "#4B0082", ("deep", "cool")),
    ColorEntry("婴儿蓝", "Baby Blue", "blue", "#89CFF0", ("light", "cool")),
    ColorEntry("正蓝", "Pure Blue", "blue", "#0000FF", ("vivid", "cool")),
    ColorEntry("皇家蓝", "Royal Blue", "blue", "#4169E1", ("vivid", "cool")),
    ColorEntry("中蓝", "Medium Blue", "blue", "#0000CD", ("deep", "cool")),

    # ── PURPLE ──
    ColorEntry("薰衣草紫", "Lavender", "purple", "#B57EDC", ("light", "cool")),
    ColorEntry("紫罗兰", "Violet", "purple", "#7F00FF", ("vivid", "cool")),
    ColorEntry("梅子紫", "Plum", "purple", "#6E2C5B", ("deep", "warm")),
    ColorEntry("葡萄紫", "Grape", "purple", "#6F2DA8", ("vivid", "cool")),
    ColorEntry("灰紫", "Mauve", "purple", "#915F6D", ("muted", "warm")),
    ColorEntry("深紫", "Eggplant", "purple", "#3D2B56", ("deep", "cool")),
    ColorEntry("丁香紫", "Lilac", "purple", "#C8A2C8", ("light", "cool")),
    ColorEntry("品红", "Magenta", "purple", "#FF00FF", ("vivid", "warm")),
    ColorEntry("紫红", "Purple Red", "purple", "#C71585", ("vivid", "warm")),
    ColorEntry("藕荷", "Lotus Pink", "purple", "#D8BFD8", ("light", "cool")),

    # ── BROWN ──
    ColorEntry("驼色", "Camel", "brown", "#C19A6B", ("muted", "warm")),
    ColorEntry("焦糖棕", "Caramel Brown", "brown", "#8B5A2B", ("muted", "warm")),
    ColorEntry("栗棕", "Chestnut", "brown", "#954535", ("deep", "warm")),
    ColorEntry("咖啡棕", "Coffee", "brown", "#6F4E37", ("deep", "warm")),
    ColorEntry("巧克力棕", "Chocolate", "brown", "#4E2A1E", ("deep", "warm")),
    ColorEntry("胡桃棕", "Walnut", "brown", "#5C4033", ("deep", "warm")),
    ColorEntry("沙褐", "Sand", "brown", "#C2B280", ("muted", "warm")),
    ColorEntry("卡其", "Khaki", "brown", "#BDB76B", ("muted", "warm")),
    ColorEntry("黄棕", "Tan", "brown", "#D2B48C", ("muted", "warm")),
    ColorEntry("深褐", "Dark Brown", "brown", "#3B2F2F", ("deep", "warm")),
    ColorEntry("鞍褐", "Saddle Brown", "brown", "#8B4513", ("deep", "warm")),
    ColorEntry("赭石", "Raw Sienna", "brown", "#A0522D", ("muted", "warm")),
    ColorEntry("肉桂棕", "Cinnamon", "brown", "#7B3F00", ("deep", "warm")),

    # ── NEUTRAL ──
    ColorEntry("象牙白", "Ivory", "neutral", "#FFFFF0", ("light",)),
    ColorEntry("米白", "Off-white", "neutral", "#F5F5DC", ("light", "warm")),
    ColorEntry("浅灰", "Light Gray", "neutral", "#D9D9D9", ("light",)),
    ColorEntry("中灰", "Medium Gray", "neutral", "#A6A6A6", ()),
    ColorEntry("石墨灰", "Graphite", "neutral", "#4B4F54", ("deep",)),
    ColorEntry("炭黑", "Charcoal", "neutral", "#222222", ("deep",)),
    ColorEntry("纯黑", "Black", "neutral", "#000000", ("deep",)),
    ColorEntry("纯白", "White", "neutral", "#FFFFFF", ("light",)),
    ColorEntry("银灰", "Silver", "neutral", "#C0C0C0", ("light",)),
    ColorEntry("烟灰", "Smoke Gray", "neutral", "#6E6E6E", ("muted",)),
    ColorEntry("珍珠白", "Pearl White", "neutral", "#F0EAD6", ("light", "warm")),
    ColorEntry("暖灰", "Warm Gray", "neutral", "#8B8680", ("muted", "warm")),
]


# ==================== 颜色解析 ====================

def parse_color(color: Union[str, tuple[int, int, int]]) -> tuple[int, int, int]:
    """解析颜色输入，支持 '#RRGGBB' / 'R,G,B' / (r,g,b)。"""
    if isinstance(color, (tuple, list)):
        r, g, b = int(color[0]), int(color[1]), int(color[2])
        return (_clamp(r), _clamp(g), _clamp(b))

    s = str(color).strip()

    # "#RRGGBB" 或 "RRGGBB"
    hex_str = s.lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{6}", hex_str):
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        return (r, g, b)

    # "R,G,B"
    m = re.fullmatch(r"(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})", s)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return (_clamp(r), _clamp(g), _clamp(b))

    raise ValueError(f"无法解析颜色值: {color!r}")


def _clamp(v: int) -> int:
    return max(0, min(255, v))


# ==================== sRGB → XYZ → Lab ====================

def _srgb_to_linear(c: float) -> float:
    """sRGB 分量 [0,1] → 线性 RGB [0,1]。"""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def _rgb_to_xyz(r: int, g: int, b: int) -> tuple[float, float, float]:
    """sRGB [0-255] → XYZ (D65 白点)。"""
    rl = _srgb_to_linear(r / 255.0)
    gl = _srgb_to_linear(g / 255.0)
    bl = _srgb_to_linear(b / 255.0)

    # sRGB → XYZ 矩阵 (D65)
    x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375
    y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750
    z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041
    return (x, y, z)


# D65 白点
_XN = 0.95047
_YN = 1.00000
_ZN = 1.08883


def _lab_f(t: float) -> float:
    """Lab 转换中的 f(t) 函数。"""
    delta = 6.0 / 29.0
    if t > delta ** 3:
        return t ** (1.0 / 3.0)
    return t / (3.0 * delta * delta) + 4.0 / 29.0


def _xyz_to_lab(x: float, y: float, z: float) -> tuple[float, float, float]:
    """XYZ → CIE Lab。"""
    fx = _lab_f(x / _XN)
    fy = _lab_f(y / _YN)
    fz = _lab_f(z / _ZN)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return (L, a, b)


def rgb_to_lab(r: int, g: int, b: int) -> tuple[float, float, float]:
    """sRGB [0-255] → CIE Lab。"""
    x, y, z = _rgb_to_xyz(r, g, b)
    return _xyz_to_lab(x, y, z)


def delta_e(lab1: tuple[float, float, float], lab2: tuple[float, float, float]) -> float:
    """ΔE CIE76 距离。"""
    dL = lab1[0] - lab2[0]
    da = lab1[1] - lab2[1]
    db = lab1[2] - lab2[2]
    return math.sqrt(dL * dL + da * da + db * db)


# ==================== 预计算词库 Lab 值 ====================

def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# 启动时预计算所有词库条目的 Lab 值
_LIBRARY_LAB_CACHE: list[tuple[ColorEntry, tuple[float, float, float]]] = []


def _ensure_lab_cache() -> None:
    global _LIBRARY_LAB_CACHE
    if _LIBRARY_LAB_CACHE:
        return
    for entry in COLOR_LIBRARY:
        r, g, b = _hex_to_rgb(entry.hex)
        lab = rgb_to_lab(r, g, b)
        _LIBRARY_LAB_CACHE.append((entry, lab))


# ==================== 最近邻匹配 ====================

@dataclass
class MatchResult:
    entry: ColorEntry
    delta_e: float
    input_hex: str


def match_color_name(rgb: tuple[int, int, int]) -> MatchResult:
    """在词库中找到 ΔE 最小的颜色条目。"""
    _ensure_lab_cache()

    r, g, b = rgb
    input_lab = rgb_to_lab(r, g, b)
    input_hex = f"#{r:02X}{g:02X}{b:02X}"

    best_entry = _LIBRARY_LAB_CACHE[0][0]
    best_de = float("inf")

    for entry, entry_lab in _LIBRARY_LAB_CACHE:
        de = delta_e(input_lab, entry_lab)
        if de < best_de:
            best_de = de
            best_entry = entry

    return MatchResult(entry=best_entry, delta_e=best_de, input_hex=input_hex)


# ==================== 提示词描述 ====================

def describe_color(color: Union[str, tuple[int, int, int]]) -> str:
    """
    输入颜色值，返回可直接拼入提示词的自然语言描述。

    示例输出：
      - "主体颜色：樱桃红（接近 #C1272D）"
      - "中性色：石墨灰（接近 #4B4F54）"
    """
    rgb = parse_color(color)
    result = match_color_name(rgb)
    entry = result.entry

    prefix = "中性色" if entry.family == "neutral" else "主体颜色"
    return f"{prefix}：{entry.name_cn}（接近 {entry.hex}）"


def get_color_name(color: Union[str, tuple[int, int, int]]) -> str:
    """仅返回中文颜色名称。"""
    rgb = parse_color(color)
    result = match_color_name(rgb)
    return result.entry.name_cn
