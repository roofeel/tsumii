"""自然语言需求解析（中 / 英 / 日关键词规则）。接入 LLM 后可替换为结构化抽取，输出结构不变。"""
from __future__ import annotations

from dataclasses import asdict, dataclass

ITEM_WORDS = [
    ("bracelet", ["手链", "手环", "bracelet", "ブレスレット"]),
    ("earring", ["耳饰", "耳环", "耳坠", "耳钉", "earring", "ピアス", "イヤリング"]),
    ("bookmark", ["书签", "bookmark", "しおり"]),
    ("brooch", ["胸针", "brooch", "ブローチ"]),
    ("pendant", ["吊坠", "挂饰", "pendant", "charm", "チャーム", "ペンダント"]),
    ("necklace", ["项链", "necklace", "ネックレス"]),
]

COLOR_WORDS: dict[str, list[str]] = {
    "green": ["绿", "抹茶", "green", "matcha", "緑", "グリーン"],
    "pink": ["粉", "樱", "pink", "sakura", "ピンク", "桜"],
    "blue": ["蓝", "夜", "blue", "navy", "night", "青", "ブルー"],
    "white": ["白", "white", "ホワイト"],
    "gold": ["金", "gold", "ゴールド"],
    "red": ["红", "red", "赤", "レッド"],
    "black": ["黑", "black", "黒", "ブラック"],
    "purple": ["紫", "purple", "lavender", "ラベンダー"],
}

STYLE_WORDS = [
    ("日系极简", ["极简", "简约", "minimal", "ミニマル", "シンプル"]),
    ("复古", ["复古", "retro", "vintage", "レトロ"]),
    ("可爱", ["可爱", "cute", "かわいい"]),
    ("几何", ["几何", "geometric", "幾何"]),
    ("精致", ["精致", "elegant", "上品"]),
]

THEME_WORDS = [
    ("樱花", ["樱花", "sakura", "cherry", "桜"]),
    ("植物", ["植物", "叶", "leaf", "plant", "botanical", "葉", "ボタニカル"]),
    ("花卉", ["花", "flower", "floral", "フラワー"]),
    ("夜景", ["夜景", "night", "夜"]),
    ("几何", ["几何", "geometric", "幾何"]),
    ("爱心", ["爱心", "heart", "ハート"]),
]

SCENE_WORDS = [
    ("夏季日常", ["夏", "summer"]),
    ("春季日常", ["春", "spring"]),
    ("通勤", ["通勤", "上班", "office", "work"]),
    ("送礼", ["礼物", "送", "gift", "プレゼント"]),
]

BEGINNER = ["不要太高", "不太难", "简单", "新手", "入门", "easy", "beginner", "初心者", "かんたん"]
ADVANCED = ["复杂", "高难", "advanced", "上級"]


@dataclass
class ParsedBrief:
    item_type: str
    colors: list[str]
    style: str
    theme: str
    scene: str
    difficulty: str
    free_text: str

    def to_dict(self) -> dict:
        return asdict(self)


def _has(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def parse_prompt(raw: str) -> ParsedBrief:
    text = raw.lower()
    item = next((k for k, ws in ITEM_WORDS if _has(text, ws)), "necklace")
    colors = [k for k, ws in COLOR_WORDS.items() if _has(text, ws)] or ["green"]
    style = next((k for k, ws in STYLE_WORDS if _has(text, ws)), "日系极简")
    theme = next((k for k, ws in THEME_WORDS if _has(text, ws)), "")
    scene = next((k for k, ws in SCENE_WORDS if _has(text, ws)), "日常")
    difficulty = "beginner" if _has(text, BEGINNER) else "advanced" if _has(text, ADVANCED) else "intermediate"
    return ParsedBrief(item, colors, style, theme, scene, difficulty, raw.strip())
