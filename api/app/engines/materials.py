"""Engine C：Material Planning Engine（MVP：不接入价格与库存数据）

Required       = Pattern 中某色号的珠子总数（方格图纸 + 项链串链，调用方传入展开后的全部珠子）
Reserve        = ceil(Required × 损耗比例)
PurchaseNeeded = Required + Reserve
Packages       = ceil(PurchaseNeeded / 单包装可用颗数)
按克销售时：单包装可用颗数 = floor(克数 × 可信颗数/克)；缺参数时返回 None 并提示确认。
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Literal, Sequence

from .catalog import BeadColor, Catalog
from .strand import strand_bead_count

DEFAULT_WASTAGE = 0.10


def reserve_for(required: int, wastage_rate: float) -> int:
    if required <= 0:
        return 0
    # 先舍入到 1e-9，避免 0.1*30=3.0000000000000004 被 ceil 成 4
    return math.ceil(round(required * wastage_rate, 9))


def beads_per_package(color: BeadColor) -> int | None:
    if color.pack_beads and color.pack_beads > 0:
        return int(color.pack_beads)
    if color.grams_per_pack and color.beads_per_gram and color.grams_per_pack > 0 and color.beads_per_gram > 0:
        return math.floor(color.grams_per_pack * color.beads_per_gram)
    return None


@dataclass
class MaterialLine:
    color_id: str
    code: str
    name: str
    name_zh: str
    hex: str
    verified: bool
    required: int
    reserve: int
    purchase_needed: int
    packages: int | None
    beads_per_package: int | None
    discontinued: bool


@dataclass
class MaterialSummary:
    lines: list[MaterialLine]
    total_beads: int
    color_count: int
    total_packages: int | None
    needs_confirmation: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def calculate_materials(cells: Sequence[str], catalog: Catalog, wastage_rate: float = DEFAULT_WASTAGE) -> MaterialSummary:
    if not 0 <= wastage_rate <= 0.5:
        raise ValueError("wastage_rate must be between 0 and 0.5")
    counts = Counter(cells)
    lines: list[MaterialLine] = []
    notes: list[str] = []
    total_packages: int | None = 0
    for color_id, required in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        if color_id not in catalog:
            raise KeyError(f"Pattern 引用了不存在的色号：{color_id}")
        c = catalog.get(color_id)
        reserve = reserve_for(required, wastage_rate)
        purchase = required + reserve
        per = beads_per_package(c)
        packages = math.ceil(purchase / per) if per else (0 if purchase == 0 else None)
        if packages is None:
            notes.append(f"{c.code}：缺少可信包装或颗数/克参数")
        if c.discontinued:
            notes.append(f"{c.code}：已停产，请选择替代色号")
        total_packages = None if total_packages is None or packages is None else total_packages + packages
        lines.append(
            MaterialLine(
                color_id=color_id,
                code=c.code,
                name=c.name,
                name_zh=c.name_zh,
                hex=c.hex,
                verified=c.verified,
                required=required,
                reserve=reserve,
                purchase_needed=purchase,
                packages=packages,
                beads_per_package=per,
                discontinued=c.discontinued,
            )
        )
    return MaterialSummary(lines, len(cells), len(counts), total_packages, notes)


def merge_shopping_lists(patterns: Sequence[Sequence[str]], catalog: Catalog, wastage_rate: float = DEFAULT_WASTAGE) -> MaterialSummary:
    """合并多个图纸：先累加用量，再统一计算损耗与包装"""
    merged: list[str] = []
    for cells in patterns:
        merged.extend(cells)
    return calculate_materials(merged, catalog, wastage_rate)


AccessoryStatus = Literal["calculated", "estimated", "needs-confirmation"]


@dataclass
class AccessoryLine:
    id: str
    name: str
    quantity: str
    reason: str
    status: AccessoryStatus


def estimate_accessories(
    item_type: str, width: int, height: int, wear_length_cm: float | None = None, strand: dict | None = None
) -> list[AccessoryLine]:
    """只有能由结构确定的项目标为 calculated；依赖长度或连接方式的项目标为 needs-confirmation。"""
    row_cm = width * 0.16
    thread_m = math.ceil(((height * row_cm * 3 + 60) / 100) * 10) / 10
    base = [
        AccessoryLine("thread", "串珠线", f"约 {thread_m} m", f"按 {height} 行方格平织往返穿线 + 收尾估算", "estimated"),
        AccessoryLine("needle", "串珠针 #12", "1 根", "适配 Delica 11/0 孔径", "calculated"),
    ]
    if strand:
        # 串链单股穿线，两端各留 15 cm 收尾
        length = strand["lengthCm"]
        strand_m = math.ceil(((length + 30) / 100) * 10) / 10
        base.append(
            AccessoryLine("strand-thread", "串链用线", f"约 {strand_m} m", f"串链 {length:g} cm（约 {strand_bead_count(length)} 颗）单股穿线 + 两端收尾", "estimated")
        )
        wear_length_cm = wear_length_cm or length
    if item_type in ("necklace", "pendant"):
        return base + [
            AccessoryLine("clasp", "龙虾扣", "1 个", "项链开合需要", "calculated"),
            AccessoryLine("jumpring", "金属连接环 4 mm", "3 个", "吊坠挂环 ×1 · 串链两端 ×2" if strand else "吊坠挂环 ×1 · 链条两端 ×2", "calculated"),
            AccessoryLine(
                "extender",
                "延长链",
                "5 cm × 1" if wear_length_cm else "待定",
                f"佩戴长度 {wear_length_cm:g} cm，是否需要延长请确认" if wear_length_cm else "取决于最终佩戴长度",
                "needs-confirmation",
            ),
            AccessoryLine("bail", "吊坠连接方式", "—", "珠环 / 金属扣头二选一，结构需人工确认", "needs-confirmation"),
        ]
    if item_type == "bracelet":
        return base + [
            AccessoryLine("clasp", "扣件", "1 套", "手链开合需要", "calculated"),
            AccessoryLine("endcap", "包扣 / 收尾夹", "2 个", f"按 {width} 列宽度选择尺寸", "needs-confirmation"),
        ]
    if item_type == "earring":
        return base + [
            AccessoryLine("hook", "耳钩或耳针", "1 对", "按两只耳饰计算", "calculated"),
            AccessoryLine("jumpring", "金属连接环 4 mm", "2 个", "每只 1 个", "calculated"),
        ]
    return base
