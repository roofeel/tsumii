"""Engine B 基础操作：结构化图纸（Pattern）的编辑与验证。

cells 为行优先的色号 id 列表，长度 = width × height。所有操作都返回新列表，不修改输入。
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Callable, Sequence

from .catalog import DELICA_11_0_SIZE_MM, Catalog


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    w: int
    h: int


def check_dims(cells: Sequence[str], width: int, height: int) -> None:
    if width < 1 or height < 1:
        raise ValueError("width and height must be positive")
    if len(cells) != width * height:
        raise ValueError(f"cells length {len(cells)} != {width}x{height}")


def set_cell(cells: Sequence[str], index: int, color_id: str) -> list[str]:
    out = list(cells)
    out[index] = color_id
    return out


def flood_fill(cells: Sequence[str], width: int, height: int, index: int, color_id: str) -> list[str]:
    out = list(cells)
    src = out[index]
    if src == color_id:
        return out
    stack = [index]
    while stack:
        k = stack.pop()
        if out[k] != src:
            continue
        out[k] = color_id
        x, y = k % width, k // width
        if x > 0:
            stack.append(k - 1)
        if x < width - 1:
            stack.append(k + 1)
        if y > 0:
            stack.append(k - width)
        if y < height - 1:
            stack.append(k + width)
    return out


def replace_in_rect(cells: Sequence[str], width: int, rect: Rect, mapper: Callable[[str], str]) -> list[str]:
    out = list(cells)
    height = len(out) // width
    for y in range(max(0, rect.y), min(height, rect.y + rect.h)):
        for x in range(max(0, rect.x), min(width, rect.x + rect.w)):
            i = y * width + x
            out[i] = mapper(out[i])
    return out


def count_colors(cells: Sequence[str]) -> Counter[str]:
    return Counter(cells)


def row_runs(cells: Sequence[str], width: int, row: int) -> list[tuple[str, int]]:
    """按行生成制作步骤：从左到右的连续色段 [(color_id, length)]"""
    runs: list[list] = []
    for x in range(width):
        cid = cells[row * width + x]
        if runs and runs[-1][0] == cid:
            runs[-1][1] += 1
        else:
            runs.append([cid, 1])
    return [(c, n) for c, n in runs]


def remove_isolated(cells: Sequence[str], width: int, height: int) -> list[str]:
    """四邻都与自己不同、且邻居中有多数色（≥2）时，替换为多数色"""
    out = list(cells)
    for y in range(height):
        for x in range(width):
            i = y * width + x
            me = cells[i]
            ns = []
            if x > 0:
                ns.append(cells[i - 1])
            if x < width - 1:
                ns.append(cells[i + 1])
            if y > 0:
                ns.append(cells[i - width])
            if y < height - 1:
                ns.append(cells[i + width])
            if len(ns) < 2 or me in ns:
                continue
            best, n = Counter(ns).most_common(1)[0]
            if n >= 2:
                out[i] = best
    return out


def mirror_horizontal(cells: Sequence[str], width: int, height: int) -> list[str]:
    """左右对称修正：以左半为准镜像到右半"""
    out = list(cells)
    for y in range(height):
        for x in range(width // 2):
            out[y * width + (width - 1 - x)] = cells[y * width + x]
    return out


def merge_rare_colors(cells: Sequence[str], min_count: int, catalog: Catalog) -> list[str]:
    """小区域色彩优化：用量低于阈值的颜色并入 ΔE 最近的常用色"""
    counts = Counter(cells)
    common = [c for c, n in counts.items() if n >= min_count]
    if not common:
        return list(cells)
    remap = {c: min(common, key=lambda k: catalog.distance(c, k)) for c, n in counts.items() if n < min_count}
    return [remap.get(c, c) for c in cells]


def validate_pattern(cells: Sequence[str], width: int, height: int, catalog: Catalog, layout_type: str = "square") -> list[str]:
    """MVP 结构验证。不通过的图纸不能声明为“可制作”。"""
    errors: list[str] = []
    if layout_type != "square":
        errors.append(f"暂不支持的排列方式：{layout_type}")
    if width < 1 or height < 1:
        errors.append("图纸尺寸无效")
    if len(cells) != width * height:
        errors.append("珠子数量与行列数不一致")
    unknown = sorted({c for c in cells if c not in catalog})
    if unknown:
        errors.append("存在不在色卡中的色号：" + ", ".join(unknown))
    return errors


def product_size_cm(width: int, height: int) -> tuple[float, float]:
    bw, bh = DELICA_11_0_SIZE_MM
    return round(width * bw) / 10, round(height * bh) / 10
