"""MockProvider：基于规则的确定性实现，与前端 src/lib/ai/mock.ts 行为一致。

所有数量均为估算，不可作为采购依据；色号只来自色卡。
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace

from ..catalog import Catalog, load_sample_catalog
from ..color import Lab
from ..motifs import default_size
from .base import DesignIdea, Refinement
from .parse import ParsedBrief


@dataclass
class Direction:
    name: str
    motif: str
    palette: list[str]
    description: str
    tags: list[str]
    dimensional: bool = False
    difficulty: str | None = None


DIRECTIONS: dict[str, list[Direction]] = {
    "green": [
        Direction("Matcha Garden", "leaf", ["s01", "s14", "s15", "s16", "s12"], "抹茶绿与象牙白搭配，植物叶片主题，风格清新。", ["清新", "植物", "日常"]),
        Direction("Ginza Emerald", "diamond", ["s01", "s17", "s13", "s16", "s12"], "祖母绿几何元素，精致、现代，适合日常佩戴。", ["精致", "几何", "现代"], difficulty="intermediate"),
        Direction("Tokyo Botanical", "flower", ["s18", "s13", "s14", "s11", "s08"], "浅绿色与透明珠子结合，采用日式植物与立体花卉元素。", ["植物", "花卉", "透明感"], True, "intermediate"),
        Direction("Forest Light", "gradient", ["s01", "s13", "s14", "s15", "s16"], "深浅绿色渐变，营造森林光影效果。", ["渐变", "光影", "自然"]),
    ],
    "pink": [
        Direction("Sakura Breeze", "flower", ["s01", "s07", "s08", "s11", "s12"], "浅樱粉花瓣与蜜黄花心，春日感的平面樱花。", ["樱花", "春天", "温柔"]),
        Direction("Ginza Blush", "diamond", ["s02", "s07", "s09", "s12", "s08"], "粉色几何菱形配金色点缀，精致利落。", ["精致", "几何"], difficulty="intermediate"),
        Direction("Ueno Spring", "leaf", ["s01", "s07", "s08", "s09", "s14"], "樱色叶片与嫩绿点缀，上野公园的春天。", ["自然", "花卉"]),
        Direction("Hanami Petals", "flower", ["s18", "s07", "s08", "s12", "s11"], "透明珠与层叠立体花瓣，适合耳坠与吊坠。", ["立体", "花卉", "透明感"], True, "intermediate"),
    ],
    "blue": [
        Direction("Tokyo Night", "night", ["s21", "s21", "s20", "s05", "s11"], "深蓝夜空与城市天际线，点点灯火。", ["夜景", "都市"]),
        Direction("Sumida Wave", "gradient", ["s01", "s19", "s20", "s21", "s21"], "天蓝到夜蓝的渐变，像隅田川的暮色。", ["渐变", "安静"]),
        Direction("Ginza Sapphire", "diamond", ["s02", "s20", "s19", "s21", "s12"], "蓝宝石几何切面，金色收边，适合通勤。", ["几何", "精致"], difficulty="intermediate"),
        Direction("Shibuya Grid", "geometric", ["s02", "s19", "s20", "s21", "s10"], "涩谷街头的斜纹几何，干净利落。", ["都市", "几何"]),
    ],
    "neutral": [
        Direction("Ginza Pearl", "diamond", ["s02", "s01", "s03", "s04", "s12"], "象牙白与暖灰的低调几何，极简精致。", ["极简", "精致"]),
        Direction("Shibuya Lines", "geometric", ["s02", "s04", "s05", "s06", "s10"], "黑白斜纹加一抹朱红，都市感。", ["几何", "都市"]),
        Direction("Asakusa Heart", "heart", ["s01", "s10", "s09", "s06", "s12"], "朱红爱心与复古金色，传统而温暖。", ["复古", "爱心"]),
        Direction("Paper Garden", "leaf", ["s02", "s03", "s23", "s05", "s12"], "米色与可可棕的纸艺叶片，安静质朴。", ["质朴", "植物"]),
    ],
}

FAMILY_OF = {"green": "green", "pink": "pink", "red": "pink", "purple": "pink", "blue": "blue", "black": "neutral", "white": "neutral", "gold": "neutral"}
THEME_MOTIF = {"樱花": "flower", "植物": "leaf", "花卉": "flower", "夜景": "night", "几何": "geometric", "爱心": "heart"}


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass
class MockProvider:
    catalog: Catalog = field(default_factory=load_sample_catalog)
    name: str = "mock"

    def _hex(self, cid: str) -> str:
        return self.catalog.get(cid).hex if cid in self.catalog else "#CCCCCC"

    def _strand(self, palette: list[str], motif: str) -> list[str]:
        bg, c1, c2, c3 = (palette + [palette[-1]] * 4)[:4]
        if motif == "gradient":
            seq = [c1, c1, c2, c2, c3, c3, c2, c2]
        elif motif == "night":
            seq = [c1, c1, c2, palette[4] if len(palette) > 4 else c2]
        else:
            seq = [bg, bg, c1, bg, bg, c2]
        return [self._hex(c) for c in seq]

    @staticmethod
    def _estimate(item_type: str, palette: list[str]) -> tuple[int, int]:
        w, h = default_size(item_type)
        strand = 260 if item_type == "necklace" else 0
        return len(set(palette)), round((w * h + strand) / 10) * 10

    def build_idea(self, d: Direction, prompt: str, item_type: str, difficulty: str, style: str) -> DesignIdea:
        colors, beads = self._estimate(item_type, d.palette)
        diff = "beginner" if difficulty == "beginner" and not d.difficulty else (d.difficulty or difficulty)
        return DesignIdea(
            id=_new_id("idea"),
            prompt=prompt,
            name=d.name,
            item_type=item_type,
            style=style,
            style_tags=list(d.tags),
            description=d.description,
            palette=list(d.palette),
            strand_sequence=self._strand(d.palette, d.motif),
            motif=d.motif,
            estimated_colors=colors,
            estimated_beads=beads,
            difficulty=diff,
            feasibility_status="needs-review" if d.dimensional else "flat-ok",
            feasibility_note="含立体花朵结构，MVP 只能转换平面部分，立体部分需人工确认" if d.dimensional else "平面方格结构，可直接转换为图纸",
        )

    def generate_ideas(self, prompt: str, brief: ParsedBrief, count: int = 4) -> list[DesignIdea]:
        count = max(4, min(8, count))
        family = FAMILY_OF.get(brief.colors[0], "green")
        dirs = list(DIRECTIONS[family])
        want = THEME_MOTIF.get(brief.theme)
        if want:
            dirs.sort(key=lambda d: d.motif != want)  # 稳定排序：匹配主题的方向排前
        others = [d for k, v in DIRECTIONS.items() if k != family for d in v]
        while len(dirs) < count and others:
            dirs.append(others.pop(0))
        return [self.build_idea(d, prompt, brief.item_type, brief.difficulty, brief.style) for d in dirs[:count]]

    def _shift(self, cid: str, delta: float) -> str:
        lab = self.catalog.get(cid).lab
        return self.catalog.nearest(Lab(max(0, min(100, lab.L + delta)), lab.a * 0.85, lab.b * 0.85)).id

    def refine(self, idea: DesignIdea, instruction: str) -> Refinement:
        t = instruction.lower()
        has = lambda *ws: any(w in t for w in ws)  # noqa: E731
        palette = list(idea.palette)
        tags = list(idea.style_tags)
        item_type, difficulty = idea.item_type, idea.difficulty
        notes: list[str] = []

        if has("浅", "lighter", "light", "明る"):
            palette = [c if i == 0 else self._shift(c, 12) for i, c in enumerate(palette)]
            notes.append("整体颜色提亮")
        if has("深", "darker", "暗"):
            palette = [c if i == 0 else self._shift(c, -12) for i, c in enumerate(palette)]
            notes.append("整体颜色加深")
        if has("更少", "fewer", "少な"):
            palette = palette[: max(3, len(palette) - 2)]
            notes.append("减少用色")
        if has("新手", "beginner", "初心"):
            difficulty = "beginner"
            palette = palette[: max(3, min(4, len(palette)))]
            notes.append("降低难度，减少颜色切换")
        if has("精致", "elegant", "上品"):
            if "精致" not in tags:
                tags.append("精致")
            notes.append("细节更精致")
        if has("樱", "sakura", "桜"):
            palette = [c for c in palette if c != "s08"] + ["s08"]
            if "樱花" not in tags:
                tags.append("樱花")
            notes.append("加入樱花粉点缀")
        if has("金属", "metal", "金色"):
            palette = [c for c in palette if self.catalog.get(c).finish != "metallic"] or ["s01"]
            if len(palette) < 2:
                palette.append("s01")
            notes.append("减少金属色与金属配件")
        if has("手链", "bracelet", "ブレスレット"):
            item_type = "bracelet"
            notes.append("改为手链")
        if has("短款", "short", "ショート"):
            item_type = "necklace"
            notes.append("改为短款项链（约 38 cm）")
        if not notes:
            notes.append(f"按要求细化：{instruction.strip()}")

        colors, beads = self._estimate(item_type, palette)
        new = replace(
            idea,
            id=_new_id("idea"),
            palette=palette,
            style_tags=tags,
            item_type=item_type,
            difficulty=difficulty,
            estimated_colors=colors,
            estimated_beads=beads,
            strand_sequence=self._strand(palette, idea.motif),
            description=f"{idea.description}（{'；'.join(notes)}）",
        )
        return Refinement(new, notes)
