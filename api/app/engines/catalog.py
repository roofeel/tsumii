"""MIYUKI 色卡（BeadCatalog）

⚠️ PRD 要求：不允许虚构 MIYUKI 官方色号。
内置 data/sample-delica-11-0.json 仅为开发示例（SAMPLE-xx，verified=false）。
生产环境通过 `python -m app.cli import-catalog <csv>` 导入已核实数据到数据库，
并由 CATALOG_SOURCE=db 使用数据库中的色卡。
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Iterable

import numpy as np

from .color import Lab, delta_e2000_array, hex_to_lab

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Delica 11/0 近似物理尺寸（mm），用于估算成品尺寸
DELICA_11_0_SIZE_MM = (1.6, 1.3)


@dataclass(frozen=True)
class BeadColor:
    id: str
    code: str
    name: str
    name_zh: str
    hex: str
    finish: str = "opaque"
    discontinued: bool = False
    verified: bool = False
    name_ja: str | None = None
    brand: str = "MIYUKI"
    series: str = "Delica"
    size: str = "11/0"
    pack_beads: int | None = None
    grams_per_pack: float | None = None
    beads_per_gram: float | None = None

    @cached_property
    def lab(self) -> Lab:
        return hex_to_lab(self.hex)

    @classmethod
    def from_dict(cls, d: dict) -> "BeadColor":
        return cls(
            id=d["id"],
            code=d["code"],
            name=d["name"],
            name_zh=d.get("nameZh") or d.get("name_zh") or d["name"],
            name_ja=d.get("nameJa") or d.get("name_ja"),
            hex=d["hex"].upper(),
            finish=d.get("finish", "opaque"),
            discontinued=bool(d.get("discontinued", False)),
            verified=bool(d.get("verified", False)),
            pack_beads=d.get("packBeads", d.get("pack_beads")),
            grams_per_pack=d.get("gramsPerPack", d.get("grams_per_pack")),
            beads_per_gram=d.get("beadsPerGram", d.get("beads_per_gram")),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "brand": self.brand,
            "series": self.series,
            "size": self.size,
            "code": self.code,
            "name": self.name,
            "nameZh": self.name_zh,
            "nameJa": self.name_ja,
            "hex": self.hex,
            "finish": self.finish,
            "discontinued": self.discontinued,
            "packBeads": self.pack_beads,
            "gramsPerPack": self.grams_per_pack,
            "beadsPerGram": self.beads_per_gram,
            "verified": self.verified,
        }


@dataclass
class CatalogIssue:
    id: str
    problem: str


@dataclass
class Catalog:
    colors: list[BeadColor]
    _by_id: dict[str, BeadColor] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        if not self.colors:
            raise ValueError("Catalog is empty")
        self._by_id = {c.id: c for c in self.colors}

    def __contains__(self, color_id: str) -> bool:
        return color_id in self._by_id

    def __len__(self) -> int:
        return len(self.colors)

    def get(self, color_id: str) -> BeadColor:
        try:
            return self._by_id[color_id]
        except KeyError as e:
            raise KeyError(f"Unknown color id: {color_id}") from e

    @property
    def verified(self) -> bool:
        return all(c.verified for c in self.colors)

    @cached_property
    def lab_matrix(self) -> np.ndarray:
        return np.array([[c.lab.L, c.lab.a, c.lab.b] for c in self.colors])

    def _candidates(self, exclude: set[str] | None, allow_discontinued: bool) -> np.ndarray:
        mask = np.ones(len(self.colors), dtype=bool)
        for i, c in enumerate(self.colors):
            if (exclude and c.id in exclude) or (c.discontinued and not allow_discontinued):
                mask[i] = False
        if not mask.any():
            raise ValueError("No candidate colors left")
        return mask

    def nearest(self, lab: Lab, exclude: set[str] | None = None, allow_discontinued: bool = False) -> BeadColor:
        mask = self._candidates(exclude, allow_discontinued)
        d = delta_e2000_array(np.array([lab.L, lab.a, lab.b]), self.lab_matrix)
        d[~mask] = np.inf
        return self.colors[int(np.argmin(d))]

    def nearest_ids(self, labs: np.ndarray, allow_discontinued: bool = False) -> list[str]:
        """批量最近色：labs (N,3) → N 个色号 id"""
        mask = self._candidates(None, allow_discontinued)
        d = delta_e2000_array(labs[:, None, :], self.lab_matrix[None, :, :])
        d[:, ~mask] = np.inf
        idx = np.argmin(d, axis=1)
        return [self.colors[i].id for i in idx]

    def distance(self, a: str, b: str) -> float:
        la, lb = self.get(a).lab, self.get(b).lab
        return float(delta_e2000_array(np.array([la.L, la.a, la.b]), np.array([lb.L, lb.a, lb.b])))

    def alternatives(self, color_id: str, k: int = 3) -> list[tuple[BeadColor, float]]:
        base = self.get(color_id)
        out = [(c, self.distance(base.id, c.id)) for c in self.colors if c.id != color_id and not c.discontinued]
        out.sort(key=lambda x: x[1])
        return out[:k]


def validate_catalog(colors: Iterable[BeadColor]) -> list[CatalogIssue]:
    issues: list[CatalogIssue] = []
    ids: set[str] = set()
    codes: set[str] = set()
    for c in colors:
        if c.id in ids:
            issues.append(CatalogIssue(c.id, "duplicate id"))
        ids.add(c.id)
        if c.code in codes:
            issues.append(CatalogIssue(c.id, "duplicate code"))
        codes.add(c.code)
        try:
            hex_to_lab(c.hex)
        except ValueError:
            issues.append(CatalogIssue(c.id, "invalid hex"))
        if c.verified and c.code.startswith("SAMPLE"):
            issues.append(CatalogIssue(c.id, "sample code marked verified"))
        if c.pack_beads is None and not (c.grams_per_pack and c.beads_per_gram):
            issues.append(CatalogIssue(c.id, "no trusted packaging data"))
    return issues


def load_sample_catalog() -> Catalog:
    data = json.loads((DATA_DIR / "sample-delica-11-0.json").read_text("utf-8"))
    return Catalog([BeadColor.from_dict(d) for d in data])
