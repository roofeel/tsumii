"""Engine A：AI Inspiration Engine

业务逻辑只依赖 AIProvider 协议；默认 MockProvider（确定性、离线可用），
生产使用 BedrockProvider（AI_PROVIDER=bedrock，Claude Haiku 5.5）。
接入真实模型：实现 AIProvider，在 get_provider() 中注册，并设置环境变量 AI_PROVIDER。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING, Protocol

from .parse import ParsedBrief

if TYPE_CHECKING:
    from ..catalog import Catalog


@dataclass
class DesignIdea:
    id: str
    prompt: str
    name: str
    item_type: str
    style: str
    style_tags: list[str]
    description: str
    palette: list[str]
    strand_sequence: list[str]
    motif: str
    estimated_colors: int
    estimated_beads: int
    difficulty: str
    feasibility_status: str  # "flat-ok" | "needs-review"
    feasibility_note: str
    recommended_bead: str = "delica-11-0"
    preview_image: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "DesignIdea":
        names = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in d.items() if k in names})


@dataclass
class Refinement:
    idea: DesignIdea
    notes: list[str] = field(default_factory=list)


class AIProvider(Protocol):
    name: str

    def generate_ideas(self, prompt: str, brief: ParsedBrief, count: int) -> list[DesignIdea]: ...

    def refine(self, idea: DesignIdea, instruction: str) -> Refinement: ...


class AIProviderError(RuntimeError):
    """模型调用失败或返回不可用的结果；消息可直接展示给用户。"""


def get_provider(name: str | None, catalog: "Catalog | None" = None) -> AIProvider:
    from .mock import MockProvider

    if name in (None, "", "mock"):
        return MockProvider()
    if name == "bedrock":
        from ...config import get_settings
        from ..catalog import load_sample_catalog
        from .bedrock import BedrockProvider

        s = get_settings()
        return BedrockProvider(catalog or load_sample_catalog(), model=s.bedrock_model_id, region=s.aws_region)
    raise ValueError(f"未知的 AI_PROVIDER：{name}。请在 app/engines/ai 中实现对应 Provider。")
