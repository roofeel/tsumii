"""请求 / 响应模型。JSON 字段使用 camelCase，与前端 src/lib/types.ts 对齐。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

ItemType = Literal["necklace", "bracelet", "earring", "pendant", "bookmark", "brooch"]
Difficulty = Literal["beginner", "intermediate", "advanced"]
ConversionMode = Literal["faithful", "pixel", "cartoon", "outline", "low-color"]
ProjectStatus = Literal["draft", "editing", "exported", "purchasing"]

MAX_SIDE = 120


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


def camelize(d: dict[str, Any]) -> dict[str, Any]:
    return {to_camel(k): v for k, v in d.items()}


# ---------- AI ----------
class BriefOverrides(CamelModel):
    item_type: ItemType | None = None
    colors: list[str] | None = None
    style: str | None = None
    theme: str | None = None
    scene: str | None = None
    difficulty: Difficulty | None = None


class ParseRequest(CamelModel):
    prompt: str = Field(min_length=1, max_length=2000)


class IdeasRequest(CamelModel):
    prompt: str = Field(min_length=1, max_length=2000)
    count: int = Field(default=4, ge=4, le=8)
    brief: BriefOverrides | None = None


class RefineRequest(CamelModel):
    instruction: str = Field(min_length=1, max_length=500)
    parent_variant_id: str | None = None


class TaskOut(CamelModel):
    id: str
    kind: str
    status: str
    result: dict | None = None
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class VariantOut(CamelModel):
    id: str
    idea_id: str
    parent_variant_id: str | None
    refinement_prompt: str
    idea: dict
    notes: list[str] = []
    created_at: datetime


# ---------- 图片 ----------
class AssetOut(CamelModel):
    id: str
    content_type: str
    size: int
    width: int | None
    height: int | None


class PrepIn(CamelModel):
    rotate: Literal[0, 90, 180, 270] = 0
    zoom: float = Field(default=1.0, ge=1.0, le=3.0)
    square_crop: bool = False
    brightness: int = Field(default=0, ge=-50, le=50)
    contrast: int = Field(default=0, ge=-50, le=80)
    remove_background: bool = False
    auto_center: bool = False


class ConvertRequest(CamelModel):
    cols: int = Field(default=28, ge=4, le=MAX_SIDE)
    rows: int | None = Field(default=None, ge=4, le=MAX_SIDE)
    max_colors: int = Field(default=6, ge=2, le=24)
    mode: ConversionMode = "pixel"
    remove_isolated: bool = True
    symmetry: bool = False
    small_area_merge: bool = True
    background_id: str | None = None
    prep: PrepIn = PrepIn()
    # 填写则转换完成后直接创建项目
    create_project: "ProjectMeta | None" = None


class ProjectMeta(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    item_type: ItemType = "pendant"


# ---------- 项目 / 图纸 ----------
class ProjectCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    item_type: ItemType
    creation_mode: Literal["image", "ai"]
    width: int = Field(ge=1, le=MAX_SIDE)
    height: int = Field(ge=1, le=MAX_SIDE)
    cells: list[str]

    @model_validator(mode="after")
    def _dims(self):
        if len(self.cells) != self.width * self.height:
            raise ValueError("cells length must equal width × height")
        return self


class ProjectFromIdea(CamelModel):
    idea_id: str
    variant_id: str | None = None
    name: str | None = None


class ProjectPatch(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: ProjectStatus | None = None


class PatternOut(CamelModel):
    id: str
    bead_type: str
    layout_type: str
    width: int
    height: int
    cells: list[str]
    version: int
    revision: int
    validation_errors: list[str] = []


class ProjectOut(CamelModel):
    id: str
    name: str
    description: str
    creation_mode: str
    status: str
    item_type: str
    created_at: datetime
    updated_at: datetime
    exported_at: datetime | None
    idea: dict | None = None
    pattern: PatternOut | None = None


class ProjectSummaryOut(CamelModel):
    id: str
    name: str
    status: str
    item_type: str
    width: int
    height: int
    color_count: int
    updated_at: datetime
    exported_at: datetime | None


class PatternPut(CamelModel):
    width: int = Field(ge=1, le=MAX_SIDE)
    height: int = Field(ge=1, le=MAX_SIDE)
    cells: list[str]
    # 乐观并发：与服务器 revision 不一致时返回 409
    base_revision: int | None = None

    @model_validator(mode="after")
    def _dims(self):
        if len(self.cells) != self.width * self.height:
            raise ValueError("cells length must equal width × height")
        return self


class RectIn(CamelModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)


class LocalEditRequest(CamelModel):
    rect: RectIn
    instruction: str = Field(min_length=1, max_length=300)
    base_revision: int | None = None


class VersionCreate(CamelModel):
    note: str = Field(default="", max_length=200)


class VersionOut(CamelModel):
    version: int
    width: int
    height: int
    note: str
    created_at: datetime


# ---------- 材料 / 采购 ----------
class ShoppingToggle(CamelModel):
    kind: Literal["bought", "outOfStock", "confirmed"]
    item_id: str
    value: bool


class ShoppingPatch(CamelModel):
    wastage_rate: float | None = Field(default=None, ge=0, le=0.5)
    wear_length_cm: float | None = Field(default=None, gt=0, le=200)
    toggle: ShoppingToggle | None = None


class MergeRequest(CamelModel):
    project_ids: list[str] = Field(min_length=1, max_length=50)
    wastage_rate: float = Field(default=0.1, ge=0, le=0.5)


ConvertRequest.model_rebuild()
