"""数据库模型（PRD 第七章）。MVP 不包含价格与库存表。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _id(prefix: str):
    return lambda: f"{prefix}_{uuid.uuid4().hex[:16]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=_id("prj"))
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    creation_mode: Mapped[str] = mapped_column(String(16))  # image | ai
    status: Mapped[str] = mapped_column(String(16), default="editing")  # draft | editing | exported | purchasing
    item_type: Mapped[str] = mapped_column(String(16))
    idea_id: Mapped[str | None] = mapped_column(ForeignKey("design_ideas.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    pattern: Mapped["Pattern"] = relationship(back_populates="project", uselist=False, cascade="all, delete-orphan")
    shopping_list: Mapped["ShoppingList"] = relationship(back_populates="project", uselist=False, cascade="all, delete-orphan")
    idea: Mapped["DesignIdea | None"] = relationship(foreign_keys=[idea_id])


class DesignIdea(Base):
    __tablename__ = "design_ideas"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("generation_tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    prompt: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(120))
    item_type: Mapped[str] = mapped_column(String(16))
    style: Mapped[str] = mapped_column(String(40))
    difficulty: Mapped[str] = mapped_column(String(16))
    feasibility_status: Mapped[str] = mapped_column(String(16))
    preview_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 完整方案（palette、motif、估算值等）
    data: Mapped[dict] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    variants: Mapped[list["DesignVariant"]] = relationship(back_populates="idea", cascade="all, delete-orphan", order_by="DesignVariant.created_at")


class DesignVariant(Base):
    __tablename__ = "design_variants"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=_id("var"))
    idea_id: Mapped[str] = mapped_column(ForeignKey("design_ideas.id", ondelete="CASCADE"), index=True)
    parent_variant_id: Mapped[str | None] = mapped_column(ForeignKey("design_variants.id", ondelete="SET NULL"), nullable=True)
    refinement_prompt: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    data: Mapped[dict] = mapped_column(JSONType)
    selected: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    idea: Mapped[DesignIdea] = relationship(back_populates="variants")


class Pattern(Base):
    """结构化图纸：cells 为行优先色号 id 数组，不保存为图片"""

    __tablename__ = "patterns"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=_id("pat"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    variant_id: Mapped[str | None] = mapped_column(ForeignKey("design_variants.id", ondelete="SET NULL"), nullable=True)
    bead_type: Mapped[str] = mapped_column(String(24), default="delica-11-0")
    layout_type: Mapped[str] = mapped_column(String(16), default="square")
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    cells: Mapped[list] = mapped_column(JSONType)
    components: Mapped[list] = mapped_column(JSONType, default=list)
    # 每次保存递增，用于乐观并发控制
    revision: Mapped[int] = mapped_column(Integer, default=1)
    # 用户“保存版本”时递增
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    project: Mapped[Project] = relationship(back_populates="pattern")
    versions: Mapped[list["PatternVersion"]] = relationship(back_populates="pattern", cascade="all, delete-orphan", order_by="PatternVersion.version")


class PatternVersion(Base):
    __tablename__ = "pattern_versions"
    __table_args__ = (UniqueConstraint("pattern_id", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pattern_id: Mapped[str] = mapped_column(ForeignKey("patterns.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    cells: Mapped[list] = mapped_column(JSONType)
    note: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    pattern: Mapped[Pattern] = relationship(back_populates="versions")


class ShoppingList(Base):
    """采购状态。数量始终由 Pattern 实时计算，保证与最终图纸一致。"""

    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    wastage_rate: Mapped[float] = mapped_column(Float, default=0.1)
    bought: Mapped[dict] = mapped_column(JSONType, default=dict)
    out_of_stock: Mapped[dict] = mapped_column(JSONType, default=dict)
    confirmed: Mapped[dict] = mapped_column(JSONType, default=dict)
    wear_length_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    project: Mapped[Project] = relationship(back_populates="shopping_list")


class GenerationTask(Base):
    """AI 生成与图片转换任务"""

    __tablename__ = "generation_tasks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=_id("task"))
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(24))  # ideas | image-convert
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued | running | succeeded | failed
    input: Mapped[dict] = mapped_column(JSONType)
    result: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Asset(Base):
    """上传的图片等文件（存于对象存储）"""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=_id("ast"))
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    key: Mapped[str] = mapped_column(String(300), unique=True)
    content_type: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class BeadCatalogRow(Base):
    """已核实的 MIYUKI 色卡（CATALOG_SOURCE=db 时使用）"""

    __tablename__ = "bead_catalog"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    brand: Mapped[str] = mapped_column(String(20), default="MIYUKI")
    series: Mapped[str] = mapped_column(String(40), default="Delica")
    size: Mapped[str] = mapped_column(String(10), default="11/0")
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    name_zh: Mapped[str] = mapped_column(String(120))
    name_ja: Mapped[str | None] = mapped_column(String(120), nullable=True)
    hex: Mapped[str] = mapped_column(String(7))
    finish: Mapped[str] = mapped_column(String(40), default="opaque")
    discontinued: Mapped[bool] = mapped_column(Boolean, default=False)
    pack_beads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grams_per_pack: Mapped[float | None] = mapped_column(Float, nullable=True)
    beads_per_gram: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
