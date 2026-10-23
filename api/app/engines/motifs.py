"""AI 方案 → 可制作结构：把确定的平面主题（motif）栅格化为方格图纸。

palette[0] 为底色，其余依次为主色、辅色、深色、点缀色；不足时复用最后一个。
与前端 src/lib/pattern/motifs.ts 保持同一算法，保证两端结果一致。
"""
from __future__ import annotations

import math
from typing import Literal

Motif = Literal["leaf", "flower", "diamond", "gradient", "night", "geometric", "heart"]
ItemType = Literal["necklace", "bracelet", "earring", "pendant", "bookmark", "brooch"]

MOTIFS: tuple[str, ...] = ("leaf", "flower", "diamond", "gradient", "night", "geometric", "heart")


def default_size(item_type: str) -> tuple[int, int]:
    if item_type == "bracelet":
        return 12, 60
    if item_type == "bookmark":
        return 16, 48
    if item_type in ("earring", "brooch"):
        return 14, 14
    return 20, 24


def _js_mod(a: int, b: int) -> int:
    """JavaScript 的 % 语义（结果符号随被除数），保证与前端一致"""
    return int(math.fmod(a, b))


def render_motif(motif: str, palette: list[str], width: int, height: int) -> list[str]:
    if motif not in MOTIFS:
        raise ValueError(f"Unknown motif: {motif}")
    if not palette:
        raise ValueError("palette is empty")
    W, H = width, height

    def p(i: int) -> str:
        return palette[min(i, len(palette) - 1)]

    cells = [p(0)] * (W * H)
    cx, cy = (W - 1) / 2, (H - 1) / 2
    s = min(W, H)

    for y in range(H):
        for x in range(W):
            i = y * W + x
            nx = (x - cx) / (s / 2)
            ny = (y - cy) / (s / 2)
            if motif == "leaf":
                t = (y + 0.5) / H
                half = math.sin(math.pi * min(1, max(0, (t - 0.12) / 0.8))) * 0.62 * (W / 2)
                dx = abs(x - cx)
                if t < 0.1 and dx < 1:
                    cells[i] = p(4)
                elif dx < half:
                    edge = dx > half - 1.2
                    vein = dx < 0.6 or (abs(dx - (t - 0.2) * W * 0.5) < 0.6 and 0.3 < t < 0.85)
                    cells[i] = p(3) if edge else p(2) if vein else p(1)
                elif t > 0.9 and dx < 0.6:
                    cells[i] = p(3)
            elif motif == "flower":
                r = math.hypot(nx, ny)
                th = math.atan2(ny, nx) + math.pi / 2
                petal = 0.55 + 0.32 * abs(math.cos(2.5 * th))
                if r < 0.18:
                    cells[i] = p(4)
                elif r < 0.3:
                    cells[i] = p(3)
                elif r < petal - 0.1:
                    cells[i] = p(1)
                elif r < petal:
                    cells[i] = p(2)
            elif motif == "diamond":
                d = abs(nx) + abs(ny)
                if d < 0.25:
                    cells[i] = p(4)
                elif d < 0.5:
                    cells[i] = p(1)
                elif d < 0.62:
                    cells[i] = p(3)
                elif d < 0.86:
                    cells[i] = p(2)
                elif d < 0.95:
                    cells[i] = p(1)
            elif motif == "gradient":
                bands = max(1, len(palette) - 1)
                t = y / H
                k = min(bands, 1 + math.floor(t * bands))
                jitter = ((x * 7 + y * 3) % 5) / 5 / bands
                k2 = min(bands, 1 + math.floor((t + jitter - 0.1 / bands) * bands))
                cells[i] = p(max(1, k if (x + y) % 2 == 0 else k2))
            elif motif == "night":
                t = y / H
                cells[i] = p(1) if t < 0.6 else p(2)
                if (x * 37 + y * 17) % 23 == 0 and t < 0.55:
                    cells[i] = p(4)
                bh = [0.62, 0.7, 0.55, 0.66, 0.5, 0.72, 0.6][x % 7]
                if t > bh:
                    cells[i] = p(3)
                if t > bh + 0.05 and (x + y) % 4 == 0 and t < 0.95:
                    cells[i] = p(4)
            elif motif == "geometric":
                m = (_js_mod(x - y, 6) + 6) % 6
                cells[i] = p(3) if m < 2 else p(4) if m == 2 else p(0)
            elif motif == "heart":
                X = nx * 1.2
                Y = -ny * 1.2 + 0.25
                v = (X * X + Y * Y - 0.6) ** 3 - X * X * Y * Y * Y
                if v < 0:
                    cells[i] = p(1)
    return cells
