import json

import numpy as np
import pytest
from PIL import Image

from app.engines.ai.base import get_provider
from app.engines.ai.local_edit import guess_background, plan_local_edit
from app.engines.ai.mock import MockProvider
from app.engines.ai.parse import parse_prompt
from app.engines.catalog import BeadColor, Catalog, load_sample_catalog, validate_catalog
from app.engines.color import Lab, delta_e2000, hex_to_lab, hex_to_rgb, rgb_to_hex
from app.engines.convert import ConvertOptions, PrepOptions, auto_rows, convert_array, convert_image, limit_colors
from app.engines.materials import beads_per_package, calculate_materials, estimate_accessories, merge_shopping_lists, reserve_for
from app.engines.motifs import MOTIFS, default_size, render_motif
from app.engines.pattern import (
    Rect, count_colors, flood_fill, mirror_horizontal, product_size_cm, remove_isolated, replace_in_rect, row_runs, validate_pattern,
)

CAT = load_sample_catalog()
EXAMPLE = "我想做一个绿色的 MIYUKI 串珠项链，日系极简风格，有植物元素，适合夏天佩戴，制作难度不要太高。"

# ---------- color ----------
SHARMA = [
    ((50, 2.6772, -79.7751), (50, 0, -82.7485), 2.0425),
    ((50, 3.1571, -77.2803), (50, 0, -82.7485), 2.8615),
    ((50, 2.8361, -74.02), (50, 0, -82.7485), 3.4412),
    ((50, -1.3802, -84.2814), (50, 0, -82.7485), 1.0),
    ((50, 0, 0), (50, -1, 2), 2.3669),
    ((50, 2.5, 0), (73, 25, -18), 27.1492),
    ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
    ((2.0776, 0.0795, -1.135), (0.9033, -0.0636, -0.5514), 0.9082),
]


@pytest.mark.parametrize("a,b,expected", SHARMA)
def test_ciede2000_sharma(a, b, expected):
    assert delta_e2000(Lab(*a), Lab(*b)) == pytest.approx(expected, abs=1e-4)


def test_lab_and_hex():
    assert hex_to_lab("#FFFFFF").L == pytest.approx(100, abs=0.01)
    assert hex_to_lab("#000000").L == pytest.approx(0, abs=1e-6)
    assert rgb_to_hex(hex_to_rgb("#789477")) == "#789477"
    assert hex_to_rgb("#abc") == (170, 187, 204)
    with pytest.raises(ValueError):
        hex_to_rgb("#12")


# ---------- catalog ----------
def test_sample_catalog_is_consistent_and_unverified():
    assert validate_catalog(CAT.colors) == []
    assert not CAT.verified
    assert all(c.code.startswith("SAMPLE-") for c in CAT.colors)


def test_nearest_and_alternatives():
    assert CAT.nearest(hex_to_lab("#789477")).id == "s15"
    alts = CAT.alternatives("s15", 3)
    assert len(alts) == 3 and all(c.id != "s15" for c, _ in alts)
    assert alts[0][1] <= alts[1][1]


# ---------- pattern ----------
def test_pattern_ops():
    assert flood_fill(list("aabababaa"), 3, 3, 0, "x") == list("xxbxbabaa")
    assert row_runs(list("aababbbc"), 4, 1) == [("b", 3), ("c", 1)]
    assert remove_isolated(list("aaaaxaaaa"), 3, 3)[4] == "a"
    assert mirror_horizontal(list("abcd"), 4, 1) == list("abba")
    assert replace_in_rect(list("aaaa"), 2, Rect(1, 0, 1, 2), lambda c: "z") == list("azaz")
    assert product_size_cm(20, 24) == (3.2, 3.1)


def test_validate_pattern():
    assert validate_pattern(["s01", "nope"], 1, 2, CAT) and validate_pattern(["s01", "s02"], 1, 2, CAT) == []
    assert validate_pattern(["s01"], 2, 2, CAT)


# ---------- motifs ----------
def test_motifs_render_with_palette_only():
    palette = ["s01", "s14", "s15", "s16", "s12"]
    for m in MOTIFS:
        w, h = default_size("necklace")
        cells = render_motif(m, palette, w, h)
        assert len(cells) == w * h
        assert set(cells) <= set(palette)
        assert len(set(cells)) > 1
    with pytest.raises(ValueError):
        render_motif("unknown", palette, 4, 4)


# ---------- convert ----------
def _img(w, h, fn):
    a = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            a[y, x] = fn(x, y)
    return a


BASE: dict = dict(remove_isolated=False, symmetry=False, small_area_merge=False, mode="faithful")


def test_convert_matches_catalog_colors():
    arr = _img(40, 40, lambda x, y: (0x78, 0x94, 0x77, 255) if x < 20 else (0xF3, 0xC9, 0xD3, 255))
    cells, cols, rows = convert_array(arr, ConvertOptions(cols=10, rows=10, max_colors=8, **BASE), CAT)
    assert (cols, rows, len(cells)) == (10, 10, 100)
    assert cells[0] == "s15" and cells[9] == "s07"


def test_convert_respects_max_colors_and_catalog():
    arr = _img(60, 60, lambda x, y: (x * 4, y * 4, 128, 255))
    for m in (2, 4, 6):
        cells, *_ = convert_array(arr, ConvertOptions(cols=20, rows=20, max_colors=m, **BASE), CAT)
        assert len(set(cells)) <= m and all(c in CAT for c in cells)
    low, *_ = convert_array(arr, ConvertOptions(cols=20, rows=20, max_colors=10, **{**BASE, "mode": "low-color"}), CAT)
    assert len(set(low)) <= 4


def test_convert_transparent_and_symmetry():
    arr = _img(10, 10, lambda x, y: (0, 0, 0, 0))
    cells, *_ = convert_array(arr, ConvertOptions(cols=5, rows=5, background_id="s01", **BASE), CAT)
    assert set(cells) == {"s01"}
    arr = _img(20, 20, lambda x, y: (x * 12, y * 12, 60, 255))
    cells, *_ = convert_array(arr, ConvertOptions(cols=10, rows=10, max_colors=6, **{**BASE, "symmetry": True}), CAT)
    for y in range(10):
        for x in range(5):
            assert cells[y * 10 + x] == cells[y * 10 + 9 - x]


def test_convert_all_modes_and_preprocess():
    img = Image.new("RGB", (200, 160), (250, 249, 246))
    img.paste((229, 154, 174), (60, 40, 140, 120))
    for mode in ("faithful", "pixel", "cartoon", "outline", "low-color"):
        prep = PrepOptions(rotate=90, zoom=1.2, brightness=10, contrast=10, remove_background=True, auto_center=True)
        cells, cols, rows = convert_image(img, ConvertOptions(cols=16, max_colors=5, mode=mode, prep=prep), CAT)
        assert len(cells) == cols * rows and all(c in CAT for c in cells)
    assert auto_rows(400, 400, 28) == 34


def test_limit_colors():
    assert len(set(limit_colors(["s14", "s14", "s14", "s15", "s15", "s13"], 2, CAT))) == 2


# ---------- materials ----------
def _color(cid, **kw):
    return BeadColor(id=cid, code=f"T-{cid}", name=cid, name_zh=cid, hex="#808080", pack_beads=100, **kw)


TCAT = Catalog([
    _color("a"),
    BeadColor(id="b", code="T-b", name="b", name_zh="b", hex="#808080", grams_per_pack=5, beads_per_gram=20),
    BeadColor(id="c", code="T-c", name="c", name_zh="c", hex="#808080"),
    _color("d", discontinued=True),
])


def test_reserve_and_packaging():
    assert [reserve_for(n, 0.1) for n in (30, 31, 1, 0, 70)] == [3, 4, 1, 0, 7]
    assert beads_per_package(TCAT.get("a")) == 100
    assert beads_per_package(TCAT.get("b")) == 100
    assert beads_per_package(TCAT.get("c")) is None


def test_calculate_materials_formulas():
    s = calculate_materials(["a"] * 95 + ["b"] * 30, TCAT, 0.1)
    a = next(l for l in s.lines if l.color_id == "a")
    b = next(l for l in s.lines if l.color_id == "b")
    assert (a.required, a.reserve, a.purchase_needed, a.packages) == (95, 10, 105, 2)
    assert (b.required, b.reserve, b.purchase_needed, b.packages) == (30, 3, 33, 1)
    assert (s.total_beads, s.color_count, s.total_packages, s.needs_confirmation) == (125, 2, 3, [])


def test_materials_sync_and_confirmation():
    before = calculate_materials(["a"] * 50, TCAT)
    after = calculate_materials(["b"] + ["a"] * 49, TCAT)
    assert before.lines[0].required == 50
    assert {l.color_id: l.required for l in after.lines} == {"a": 49, "b": 1}
    s = calculate_materials(["c", "d"], TCAT)
    assert s.total_packages is None and len(s.needs_confirmation) == 2
    with pytest.raises(KeyError):
        calculate_materials(["zzz"], TCAT)
    with pytest.raises(ValueError):
        calculate_materials(["a"], TCAT, 0.9)


def test_merge_and_accessories():
    m = merge_shopping_lists([["a"] * 15, ["a"] * 15], TCAT)
    assert (m.lines[0].required, m.lines[0].reserve, m.lines[0].purchase_needed) == (30, 3, 33)
    acc = {a.id: a.status for a in estimate_accessories("necklace", 20, 24, 42)}
    assert acc["extender"] == "needs-confirmation" and acc["clasp"] == "calculated"


# ---------- AI ----------
def test_parse_prompt():
    b = parse_prompt(EXAMPLE)
    assert (b.item_type, b.colors, b.style, b.theme, b.scene, b.difficulty) == ("necklace", ["green"], "日系极简", "植物", "夏季日常", "beginner")
    assert parse_prompt("a pink sakura bracelet").item_type == "bracelet"
    assert parse_prompt("青いピアス").item_type == "earring"


def test_mock_ideas_and_refine():
    p = MockProvider(CAT)
    ideas = p.generate_ideas(EXAMPLE, parse_prompt(EXAMPLE), 4)
    assert len(ideas) == 4 and len({i.name for i in ideas}) == 4
    assert ideas[0].motif == "leaf"
    assert any(i.feasibility_status == "needs-review" for i in ideas)
    assert all(c in CAT for i in ideas for c in i.palette)
    assert len(p.generate_ideas("x", parse_prompt("blue"), 8)) == 8
    idea = ideas[0]
    assert p.refine(idea, "改成手链").idea.item_type == "bracelet"
    assert p.refine(idea, "改成手链").idea.motif == idea.motif
    assert len(p.refine(idea, "使用更少的珠子颜色").idea.palette) < len(idea.palette)
    assert "s08" in p.refine(idea, "增加樱花元素").idea.palette
    assert get_provider("mock").name == "mock"
    with pytest.raises(ValueError):
        get_provider("nope")


class _FakeBedrockRuntime:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        text = "```json\n" + json.dumps(self.payloads.pop(0), ensure_ascii=False) + "\n```"
        return {"stopReason": "end_turn", "output": {"message": {"role": "assistant", "content": [{"text": text}]}}}


def _bedrock(payloads):
    from app.engines.ai.bedrock import BedrockProvider

    p = BedrockProvider(CAT)
    p._client = _FakeBedrockRuntime(payloads)
    return p


def test_bedrock_provider():
    from app.engines.ai.base import AIProviderError

    row = {"name": "Matcha", "description": "抹茶绿", "style_tags": ["清新"], "motif": "leaf", "palette": ["s01", "s14", "nope", "s15"], "dimensional": False, "difficulty": "beginner"}
    p = _bedrock([{"ideas": [row, row | {"motif": "flower", "dimensional": True}, row, row]}])
    ideas = p.generate_ideas(EXAMPLE, parse_prompt(EXAMPLE), 4)
    assert len(ideas) == 4 and ideas[0].palette == ["s01", "s14", "s15"]
    assert ideas[1].feasibility_status == "needs-review" and ideas[0].estimated_beads > 0
    call = p.client.calls[0]
    assert call["modelId"] == "global.anthropic.claude-haiku-5-5" and "JSON Schema" in call["messages"][0]["content"][0]["text"]

    p = _bedrock([{"palette": ["s01", "s07", "s08"], "style_tags": ["樱花"], "item_type": "bracelet", "difficulty": "beginner", "description": "改为手链", "notes": ["改为手链"]}])
    ref = p.refine(ideas[0], "改成手链")
    assert ref.idea.item_type == "bracelet" and ref.idea.motif == "leaf" and ref.notes == ["改为手链"]
    assert ref.idea.id != ideas[0].id

    with pytest.raises(AIProviderError):
        _bedrock([{"ideas": [row | {"palette": ["nope"]}] * 4}]).generate_ideas(EXAMPLE, parse_prompt(EXAMPLE), 4)
    assert get_provider("bedrock", CAT).name == "bedrock"
    from app.engines.ai.bedrock import BedrockProvider

    assert BedrockProvider(CAT, model="anthropic.claude-haiku-5-5").model == "global.anthropic.claude-haiku-5-5"
    assert BedrockProvider(CAT, model="us.anthropic.claude-haiku-5-5").model == "us.anthropic.claude-haiku-5-5"


def test_bedrock_credentials(monkeypatch):
    from app.engines.ai.base import AIProviderError
    from app.engines.ai.bedrock import resolve_aws_credentials

    for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    assert resolve_aws_credentials(False) == {}
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAX")
    with pytest.raises(AIProviderError):
        resolve_aws_credentials(False)
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret")
    assert resolve_aws_credentials(False) == {"aws_access_key_id": "AKIAX", "aws_secret_access_key": "secret"}
    assert resolve_aws_credentials(True) == {}
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "ASIAX")
    with pytest.raises(AIProviderError):
        resolve_aws_credentials(False)


def test_local_edit():
    plan = plan_local_edit("改成金色", CAT, "s01")
    assert plan is not None
    assert plan.mapper("s15") == "s12" and plan.mapper("s01") == "s01"
    lighter_plan = plan_local_edit("浅一点", CAT, "s01")
    assert lighter_plan is not None
    lighter = lighter_plan.mapper("s16")
    assert CAT.get(lighter).lab.L > CAT.get("s16").lab.L
    assert plan_local_edit("做成立体的", CAT, "s01") is None
    assert guess_background(list("aaaaxaaaa"), 3, 3) == "a"


# ---------- 前后端一致性：motif 栅格化结果与前端 TS 实现逐格一致 ----------
def test_motifs_match_frontend_fixtures():
    import json
    from pathlib import Path

    data = json.loads((Path(__file__).parent / "fixtures" / "motifs_from_frontend.json").read_text("utf-8"))
    for key, case in data["cases"].items():
        motif = key.split(":")[0]
        assert render_motif(motif, data["palette"], case["width"], case["height"]) == case["cells"], key


def test_strand_engine_matches_frontend():
    from app.engines.strand import expand_strand, strand_bead_count, strand_for_item, strand_repeats, strand_sequence_ids, validate_strand

    # 与 web/src/lib/__tests__/strand.test.ts 相同的用例
    assert strand_bead_count(40) == 308 and strand_bead_count(13) == 100
    s = {"sequence": ["s01", "s01", "s14"], "lengthCm": 13}
    assert len(expand_strand(s)) == 100 and expand_strand(s)[:4] == ["s01", "s01", "s14", "s01"]
    assert strand_repeats(s) == (100, 33, 1)
    assert strand_for_item("bracelet", ["s01"], CAT) is None
    assert strand_for_item("necklace", ["s01", "s14"], CAT) == {"sequence": ["s01", "s14"], "lengthCm": 40}
    assert strand_sequence_ids([CAT.get("s01").hex, "s14", "nope"], CAT) == ["s01", "s14"]
    assert validate_strand(s, CAT) == [] and validate_strand({"sequence": [], "lengthCm": 5}, CAT)

    c = calculate_materials(["s14", "s14"] + expand_strand(s), CAT, 0)
    assert c.total_beads == 102 and {l.color_id: l.required for l in c.lines} == {"s01": 67, "s14": 35}
    acc = estimate_accessories("necklace", 20, 24, None, {"sequence": ["s01"], "lengthCm": 40})
    assert next(a for a in acc if a.id == "strand-thread").quantity == "约 0.7 m"
    assert "40 cm" in next(a for a in acc if a.id == "extender").reason

    idea = MockProvider(CAT).generate_ideas(EXAMPLE, parse_prompt(EXAMPLE), 4)[0]
    assert all(c in CAT for c in idea.strand_sequence)
    assert idea.estimated_beads == round((20 * 24 + 308) / 10) * 10
