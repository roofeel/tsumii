"""项链串链：主链是一条单股珠串，不属于方格图纸，单独存为 {"sequence": [...], "lengthCm": n}。

与前端 src/lib/pattern/strand.ts 保持同一算法。
"""
from __future__ import annotations

from .catalog import DELICA_11_0_SIZE_MM, Catalog
from .color import hex_to_lab

DEFAULT_STRAND_LENGTH_CM = 40
MIN_STRAND_LENGTH_CM = 10
MAX_STRAND_LENGTH_CM = 120


def has_strand(item_type: str) -> bool:
    """只有项链带串链；吊坠为单独挂件，手链的方格图纸本身就是整条手链"""
    return item_type == "necklace"


def strand_bead_count(length_cm: float) -> int:
    """串链颗数：Delica 11/0 沿穿线方向约 1.3 mm/颗（估算值）。与 JS Math.round 一致（.5 向上）"""
    return max(0, int(length_cm * 10 / DELICA_11_0_SIZE_MM[1] + 0.5))


def expand_strand(strand: dict | None) -> list[str]:
    if not strand or not strand.get("sequence"):
        return []
    seq = strand["sequence"]
    return [seq[i % len(seq)] for i in range(strand_bead_count(strand["lengthCm"]))]


def strand_repeats(strand: dict) -> tuple[int, int, int]:
    """(总颗数, 循环单元重复次数, 最后再串单元的前几颗)"""
    total = strand_bead_count(strand["lengthCm"])
    k = len(strand["sequence"])
    return (total, total // k, total % k) if k else (total, 0, 0)


def strand_sequence_ids(sequence: list[str], catalog: Catalog) -> list[str]:
    """方案中的串链色序转为色卡 id；兼容旧数据中的 hex（取最接近的色号）"""
    out: list[str] = []
    for v in sequence:
        if v in catalog:
            out.append(v)
        elif v.startswith("#"):
            out.append(catalog.nearest(hex_to_lab(v)).id)
    return out


def strand_for_item(item_type: str, sequence: list[str], catalog: Catalog) -> dict | None:
    if not has_strand(item_type):
        return None
    ids = strand_sequence_ids(sequence, catalog)
    return {"sequence": ids, "lengthCm": DEFAULT_STRAND_LENGTH_CM} if ids else None


def validate_strand(strand: dict | None, catalog: Catalog) -> list[str]:
    if not strand:
        return []
    errors: list[str] = []
    seq = strand.get("sequence") or []
    if not seq:
        errors.append("串链循环单元为空")
    unknown = sorted({c for c in seq if c not in catalog})
    if unknown:
        errors.append(f"串链存在不在色卡中的色号：{', '.join(unknown)}")
    length = strand.get("lengthCm")
    if not isinstance(length, (int, float)) or not MIN_STRAND_LENGTH_CM <= length <= MAX_STRAND_LENGTH_CM:
        errors.append(f"串链长度需在 {MIN_STRAND_LENGTH_CM}～{MAX_STRAND_LENGTH_CM} cm 之间")
    return errors
