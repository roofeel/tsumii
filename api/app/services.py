"""业务逻辑：在数据库模型与引擎之间转换。路由层只做参数与权限处理。"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog_source import get_catalog
from .engines.ai.base import DesignIdea as IdeaDC
from .engines.materials import calculate_materials, estimate_accessories
from .engines.motifs import default_size, render_motif
from .engines.pattern import count_colors, validate_pattern
from .exports.common import SheetSource
from .models import DesignIdea, DesignVariant, Pattern, PatternVersion, Project, ShoppingList
from .schemas import PatternOut, ProjectOut, ProjectSummaryOut, camelize


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- 读取与权限 ----------
def get_project(db: Session, user_id: str, project_id: str) -> Project:
    p = db.get(Project, project_id)
    if not p or p.user_id != user_id:
        raise HTTPException(404, "项目不存在")
    return p


def get_idea(db: Session, user_id: str, idea_id: str) -> DesignIdea:
    i = db.get(DesignIdea, idea_id)
    if not i or i.user_id != user_id:
        raise HTTPException(404, "方案不存在")
    return i


def idea_to_api(row: DesignIdea) -> dict:
    return camelize(row.data) | {"id": row.id}


def save_idea(db: Session, user_id: str, idea: IdeaDC, task_id: str | None = None) -> DesignIdea:
    row = DesignIdea(
        id=idea.id,
        user_id=user_id,
        task_id=task_id,
        prompt=idea.prompt,
        name=idea.name,
        item_type=idea.item_type,
        style=idea.style,
        difficulty=idea.difficulty,
        feasibility_status=idea.feasibility_status,
        preview_image=idea.preview_image,
        data=idea.to_dict(),
    )
    db.add(row)
    return row


# ---------- 项目与图纸 ----------
def ensure_valid_cells(cells: list[str], width: int, height: int) -> None:
    errors = validate_pattern(cells, width, height, get_catalog())
    if errors:
        raise HTTPException(422, {"message": "图纸验证未通过", "errors": errors})


def create_project(
    db: Session,
    user_id: str,
    *,
    name: str,
    item_type: str,
    creation_mode: str,
    width: int,
    height: int,
    cells: list[str],
    description: str = "",
    idea_id: str | None = None,
    variant_id: str | None = None,
) -> Project:
    ensure_valid_cells(cells, width, height)
    p = Project(user_id=user_id, name=name, description=description, item_type=item_type, creation_mode=creation_mode, status="editing", idea_id=idea_id)
    p.pattern = Pattern(width=width, height=height, cells=list(cells), components=[{"id": "main", "x": 0, "y": 0, "width": width, "height": height}], variant_id=variant_id)
    p.pattern.versions.append(PatternVersion(version=1, width=width, height=height, cells=list(cells), note="v1 · 初始生成"))
    p.shopping_list = ShoppingList(wear_length_cm=42 if item_type == "necklace" else None)
    db.add(p)
    db.flush()
    return p


def create_project_from_idea(db: Session, user_id: str, idea_id: str, variant_id: str | None, name: str | None) -> Project:
    idea_row = get_idea(db, user_id, idea_id)
    data = idea_row.data
    if variant_id:
        v = db.get(DesignVariant, variant_id)
        if not v or v.idea_id != idea_row.id:
            raise HTTPException(404, "版本不存在")
        data = v.data
    idea = IdeaDC.from_dict(data)
    w, h = default_size(idea.item_type)
    cells = render_motif(idea.motif, idea.palette, w, h)
    from .exports.common import ITEM_ZH

    return create_project(
        db,
        user_id,
        name=name or f"{idea.name} {ITEM_ZH.get(idea.item_type, '')}".strip(),
        item_type=idea.item_type,
        creation_mode="ai",
        width=w,
        height=h,
        cells=cells,
        description=idea.description,
        idea_id=idea_row.id,
        variant_id=variant_id,
    )


def update_pattern(p: Project, width: int, height: int, cells: list[str], base_revision: int | None) -> Pattern:
    pat = p.pattern
    if base_revision is not None and base_revision != pat.revision:
        raise HTTPException(409, {"message": "图纸已在其他地方修改，请刷新后再试", "revision": pat.revision})
    ensure_valid_cells(cells, width, height)
    pat.width, pat.height, pat.cells = width, height, list(cells)
    pat.revision += 1
    p.updated_at = now()
    if p.status == "draft":
        p.status = "editing"
    return pat


def save_version(p: Project, note: str) -> PatternVersion:
    pat = p.pattern
    pat.version += 1
    v = PatternVersion(version=pat.version, width=pat.width, height=pat.height, cells=list(pat.cells), note=note or f"v{pat.version} · 手动保存")
    pat.versions.append(v)
    return v


def restore_version(p: Project, version: int) -> Pattern:
    v = next((x for x in p.pattern.versions if x.version == version), None)
    if not v:
        raise HTTPException(404, "版本不存在")
    pat = p.pattern
    pat.width, pat.height, pat.cells = v.width, v.height, list(v.cells)
    pat.revision += 1
    p.updated_at = now()
    return pat


def pattern_out(pat: Pattern) -> PatternOut:
    return PatternOut(
        id=pat.id, bead_type=pat.bead_type, layout_type=pat.layout_type, width=pat.width, height=pat.height, cells=list(pat.cells),
        version=pat.version, revision=pat.revision, validation_errors=validate_pattern(pat.cells, pat.width, pat.height, get_catalog(), pat.layout_type),
    )


def project_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id, name=p.name, description=p.description, creation_mode=p.creation_mode, status=p.status, item_type=p.item_type,
        created_at=p.created_at, updated_at=p.updated_at, exported_at=p.exported_at,
        idea=idea_to_api(p.idea) if p.idea else None, pattern=pattern_out(p.pattern) if p.pattern else None,
    )


def project_summary(p: Project) -> ProjectSummaryOut:
    return ProjectSummaryOut(
        id=p.id, name=p.name, status=p.status, item_type=p.item_type, width=p.pattern.width, height=p.pattern.height,
        color_count=len(count_colors(p.pattern.cells)), updated_at=p.updated_at, exported_at=p.exported_at,
    )


def list_projects(db: Session, user_id: str) -> list[Project]:
    return list(db.scalars(select(Project).where(Project.user_id == user_id).order_by(Project.updated_at.desc())).all())


# ---------- 材料 ----------
def materials_payload(p: Project, wastage: float | None = None) -> dict:
    sl = p.shopping_list
    rate = sl.wastage_rate if wastage is None else wastage
    catalog = get_catalog()
    summary = calculate_materials(p.pattern.cells, catalog, rate)
    acc = estimate_accessories(p.item_type, p.pattern.width, p.pattern.height, sl.wear_length_cm)
    lines = []
    for l in summary.lines:
        d = camelize(l.__dict__)
        d["bought"] = bool(sl.bought.get(l.color_id))
        d["outOfStock"] = bool(sl.out_of_stock.get(l.color_id))
        if d["outOfStock"]:
            d["alternatives"] = [{"colorId": c.id, "code": c.code, "deltaE": round(de, 2)} for c, de in catalog.alternatives(l.color_id, 2)]
        lines.append(d)
    accessories = [camelize(a.__dict__) | {"confirmed": bool(sl.confirmed.get(a.id))} for a in acc]
    pending = [a["name"] for a in accessories if a["status"] == "needs-confirmation" and not a["confirmed"]]
    return {
        "projectId": p.id,
        "patternRevision": p.pattern.revision,
        "wastageRate": rate,
        "catalogVerified": catalog.verified,
        "totalBeads": summary.total_beads,
        "colorCount": summary.color_count,
        "totalPackages": summary.total_packages,
        "needsConfirmation": summary.needs_confirmation + [f"{n}：需确认" for n in pending],
        "lines": lines,
        "accessories": accessories,
    }


def sheet_source(p: Project) -> SheetSource:
    idea = IdeaDC.from_dict(p.idea.data) if p.idea else None
    return SheetSource(
        name=p.name,
        item_type=p.item_type,
        width=p.pattern.width,
        height=p.pattern.height,
        cells=list(p.pattern.cells),
        version=p.pattern.version,
        description=p.description,
        style_tags=idea.style_tags if idea else [],
        difficulty=idea.difficulty if idea else None,
        feasibility_note=idea.feasibility_note if idea and idea.feasibility_status == "needs-review" else None,
        wastage_rate=p.shopping_list.wastage_rate,
        bought=dict(p.shopping_list.bought),
        out_of_stock=dict(p.shopping_list.out_of_stock),
    )
