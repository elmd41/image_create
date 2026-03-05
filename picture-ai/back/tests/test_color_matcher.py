"""
颜色匹配模块验证脚本
====================

验证 color_matcher 模块的核心功能：
- 颜色解析（HEX / RGB字符串 / 元组）
- CIE Lab 最近邻匹配
- 提示词描述生成
"""

import sys
import os

# 确保可以导入 app 包
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.utils.color_matcher import (
    parse_color,
    match_color_name,
    describe_color,
    get_color_name,
    rgb_to_lab,
    delta_e,
)


def test_parse_color():
    """测试颜色解析"""
    print("=" * 50)
    print("测试颜色解析")
    print("=" * 50)

    cases = [
        ("#C1272D", (193, 39, 45)),
        ("C1272D", (193, 39, 45)),
        ("#000000", (0, 0, 0)),
        ("#FFFFFF", (255, 255, 255)),
        ("193,39,45", (193, 39, 45)),
        ("193, 39, 45", (193, 39, 45)),
        ((100, 200, 50), (100, 200, 50)),
    ]

    all_pass = True
    for inp, expected in cases:
        result = parse_color(inp)
        ok = result == expected
        status = "✓" if ok else "✗"
        print(f"  {status} parse_color({inp!r}) = {result}  (期望 {expected})")
        if not ok:
            all_pass = False

    return all_pass


def test_lab_conversion():
    """测试 Lab 转换合理性"""
    print("\n" + "=" * 50)
    print("测试 Lab 转换")
    print("=" * 50)

    # 纯黑 → L≈0, 纯白 → L≈100
    lab_black = rgb_to_lab(0, 0, 0)
    lab_white = rgb_to_lab(255, 255, 255)
    print(f"  黑色 Lab: L={lab_black[0]:.1f}, a={lab_black[1]:.1f}, b={lab_black[2]:.1f}")
    print(f"  白色 Lab: L={lab_white[0]:.1f}, a={lab_white[1]:.1f}, b={lab_white[2]:.1f}")

    ok1 = abs(lab_black[0]) < 1.0
    ok2 = abs(lab_white[0] - 100.0) < 1.0
    print(f"  {'✓' if ok1 else '✗'} 黑色 L ≈ 0")
    print(f"  {'✓' if ok2 else '✗'} 白色 L ≈ 100")

    # ΔE 自身应为 0
    de_self = delta_e(lab_black, lab_black)
    ok3 = de_self == 0.0
    print(f"  {'✓' if ok3 else '✗'} ΔE(黑,黑) = {de_self}")

    return ok1 and ok2 and ok3


def test_match_color():
    """测试颜色匹配"""
    print("\n" + "=" * 50)
    print("测试颜色匹配")
    print("=" * 50)

    cases = [
        # (输入HEX, 期望family, 合理的名称关键词列表)
        ("#C1272D", "red", ["樱桃红", "深红", "酒红", "砖红", "朱红"]),
        ("#1F2A44", "blue", ["海军蓝", "深蓝"]),
        ("#F2F2F2", "neutral", ["浅灰", "白", "银"]),
        ("#FF0000", "red", ["正红", "红"]),
        ("#00FF00", "green", ["草绿", "绿"]),
        ("#0000FF", "blue", ["蓝", "深蓝", "钴蓝"]),
        ("#FFD700", "yellow", ["金黄", "明黄", "金"]),
        ("#8B4513", "brown", ["鞍褐", "棕", "咖啡", "栗", "焦糖"]),
        ("#800080", "purple", ["紫", "葡萄"]),
        ("#FF8C00", "orange", ["橙", "橘"]),
        ("#556B2F", "green", ["橄榄绿"]),
        ("#B57EDC", "purple", ["薰衣草紫", "紫"]),
    ]

    all_pass = True
    for hex_val, expected_family, name_keywords in cases:
        result = match_color_name(parse_color(hex_val))
        family_ok = result.entry.family == expected_family
        name_ok = any(kw in result.entry.name_cn for kw in name_keywords)
        ok = family_ok and name_ok

        status = "✓" if ok else "✗"
        print(f"  {status} {hex_val} → {result.entry.name_cn} ({result.entry.family}) ΔE={result.delta_e:.1f}")
        if not family_ok:
            print(f"      ✗ family 不匹配: 期望 {expected_family}, 实际 {result.entry.family}")
        if not name_ok:
            print(f"      ✗ 名称不在期望列表: {name_keywords}")
        if not ok:
            all_pass = False

    return all_pass


def test_describe_color():
    """测试提示词描述生成"""
    print("\n" + "=" * 50)
    print("测试提示词描述")
    print("=" * 50)

    cases = [
        "#C1272D",
        "#1F2A44",
        "#F2F2F2",
        "#4B4F54",
        "#50C878",
        "#FF7518",
        "#D2A106",
        "#6E2C5B",
    ]

    for hex_val in cases:
        desc = describe_color(hex_val)
        print(f"  {hex_val} → {desc}")

    return True


def test_get_color_name():
    """测试颜色名称获取"""
    print("\n" + "=" * 50)
    print("测试颜色名称")
    print("=" * 50)

    cases = ["#C1272D", "#005F73", "#FFFFF0", "#222222"]
    for hex_val in cases:
        name = get_color_name(hex_val)
        print(f"  {hex_val} → {name}")

    return True


if __name__ == "__main__":
    results = []
    results.append(("颜色解析", test_parse_color()))
    results.append(("Lab 转换", test_lab_conversion()))
    results.append(("颜色匹配", test_match_color()))
    results.append(("提示词描述", test_describe_color()))
    results.append(("颜色名称", test_get_color_name()))

    print("\n" + "=" * 50)
    print("测试结果汇总")
    print("=" * 50)
    all_ok = True
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {status}  {name}")
        if not passed:
            all_ok = False

    print()
    if all_ok:
        print("全部测试通过！")
    else:
        print("存在失败的测试，请检查。")
        sys.exit(1)
