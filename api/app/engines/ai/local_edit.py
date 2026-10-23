"""AI 局部修改（MVP 规则版）：在选区内按自然语言指令改色。"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Callable, Sequence

from ..catalog import Catalog
from ..color import Lab, hex_to_lab
from .parse import COLOR_WORDS

TARGET_HEX = {
    "green": "#789477",
    "pink": "#E59AAE",
    "blue": "#26324F",
    "white": "#F2EEE6",
    "gold": "#C99A3A",
    "red": "#C9473F",
    "black": "#1E1E1E",
    "purple": "#B7A6CC",
}


@dataclass
class LocalEditPlan:
    mapper: Callable[[str], str]
    summary: str


def guess_background(cells: Sequence[str], width: int, height: int) -> str | None:
    border = [cells[x] for x in range(width)] + [cells[(height - 1) * width + x] for x in range(width)]
    return Counter(border).most_common(1)[0][0] if border else None


def plan_local_edit(instruction: str, catalog: Catalog, background: str | None) -> LocalEditPlan | None:
    t = instruction.lower()
    keep = lambda c: c == background  # noqa: E731

    def shift(delta: float) -> Callable[[str], str]:
        exclude = {background} if background else None

        def f(c: str) -> str:
            if keep(c):
                return c
            lab = catalog.get(c).lab
            return catalog.nearest(Lab(max(0, min(100, lab.L + delta)), lab.a, lab.b), exclude=exclude).id

        return f

    if re.search(r"浅|亮|lighter|明る", t):
        return LocalEditPlan(shift(14), "选区颜色提亮")
    if re.search(r"深|暗|darker", t):
        return LocalEditPlan(shift(-14), "选区颜色加深")
    for key, words in COLOR_WORDS.items():
        if any(w in t for w in words):
            target = catalog.nearest(hex_to_lab(TARGET_HEX[key])).id
            return LocalEditPlan(lambda c, _t=target: c if keep(c) else _t, f"选区改为 {catalog.get(target).name_zh}")
    if re.search(r"删除|清除|去掉|remove|clear|消", t) and background:
        return LocalEditPlan(lambda c: background, "清空选区")
    return None
