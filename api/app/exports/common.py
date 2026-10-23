from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SheetSource:
    """导出所需的项目快照（与数据库模型解耦，便于测试）"""

    name: str
    item_type: str
    width: int
    height: int
    cells: list[str]
    version: int = 1
    description: str = ""
    style_tags: list[str] = field(default_factory=list)
    difficulty: str | None = None
    feasibility_note: str | None = None
    wastage_rate: float = 0.1
    bought: dict[str, bool] = field(default_factory=dict)
    out_of_stock: dict[str, bool] = field(default_factory=dict)


ITEM_ZH = {"necklace": "项链", "bracelet": "手链", "earring": "耳饰", "pendant": "吊坠", "bookmark": "书签", "brooch": "胸针"}
DIFFICULTY_ZH = {"beginner": "初级", "intermediate": "中级", "advanced": "高级"}
STATUS_ZH = {"calculated": "已计算", "estimated": "估算", "needs-confirmation": "需确认"}


def legend_order(cells: list[str], catalog) -> list[str]:
    """图例顺序：按色卡顺序排列，编号从 1 开始"""
    pos = {c.id: i for i, c in enumerate(catalog.colors)}
    return sorted(set(cells), key=lambda c: pos.get(c, 10**9))
