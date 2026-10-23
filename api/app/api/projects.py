import json
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..catalog_source import get_catalog
from ..db import get_db
from ..deps import current_user_id
from ..engines.ai.local_edit import guess_background, plan_local_edit
from ..engines.materials import merge_shopping_lists
from ..engines.pattern import Rect, replace_in_rect
from ..exports.common import legend_order
from ..exports.image import pattern_png, pattern_svg
from ..exports.pdf import pattern_pdf
from ..exports.tables import shopping_csv, shopping_xlsx
from ..schemas import (
    LocalEditRequest, MergeRequest, PatternOut, PatternPut, ProjectCreate, ProjectFromIdea, ProjectOut, ProjectPatch,
    ProjectSummaryOut, ShoppingPatch, VersionCreate, VersionOut, camelize,
)
from .. import services as svc

router = APIRouter(prefix="/projects", tags=["projects"])
shopping_router = APIRouter(prefix="/shopping-lists", tags=["materials"])


@router.get("", response_model=list[ProjectSummaryOut])
def list_projects(db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    return [svc.project_summary(p) for p in svc.list_projects(db, user)]


@router.post("", response_model=ProjectOut, status_code=201)
def create(req: ProjectCreate, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    p = svc.create_project(db, user, **req.model_dump())
    db.commit()
    return svc.project_out(p)


@router.post("/from-idea", response_model=ProjectOut, status_code=201)
def create_from_idea(req: ProjectFromIdea, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """把选中的 AI 方案（或细化版本）转换为可制作的结构化图纸"""
    p = svc.create_project_from_idea(db, user, req.idea_id, req.variant_id, req.name)
    db.commit()
    return svc.project_out(p)


@router.get("/{project_id}", response_model=ProjectOut)
def get(project_id: str, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    return svc.project_out(svc.get_project(db, user, project_id))


@router.patch("/{project_id}", response_model=ProjectOut)
def patch(project_id: str, req: ProjectPatch, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    p = svc.get_project(db, user, project_id)
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.updated_at = svc.now()
    db.commit()
    return svc.project_out(p)


@router.delete("/{project_id}", status_code=204)
def delete(project_id: str, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    db.delete(svc.get_project(db, user, project_id))
    db.commit()
    return Response(status_code=204)


# ---------- 图纸 ----------
@router.get("/{project_id}/pattern", response_model=PatternOut)
def get_pattern(project_id: str, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    return svc.pattern_out(svc.get_project(db, user, project_id).pattern)


@router.put("/{project_id}/pattern", response_model=PatternOut)
def put_pattern(project_id: str, req: PatternPut, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """保存编辑后的图纸。提供 baseRevision 可防止覆盖其他设备的修改。"""
    p = svc.get_project(db, user, project_id)
    pat = svc.update_pattern(p, req.width, req.height, req.cells, req.base_revision)
    db.commit()
    return svc.pattern_out(pat)


@router.post("/{project_id}/pattern/local-edit")
def local_edit(project_id: str, req: LocalEditRequest, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """AI 局部修改：在选区内按指令改色"""
    p = svc.get_project(db, user, project_id)
    pat = p.pattern
    bg = guess_background(pat.cells, pat.width, pat.height)
    plan = plan_local_edit(req.instruction, get_catalog(), bg)
    if plan is None:
        raise HTTPException(422, "暂时无法理解这条指令，可以试试「改成金色」「浅一点」「清除」")
    cells = replace_in_rect(pat.cells, pat.width, Rect(req.rect.x, req.rect.y, req.rect.w, req.rect.h), plan.mapper)
    svc.update_pattern(p, pat.width, pat.height, cells, req.base_revision)
    db.commit()
    return {"summary": plan.summary, "pattern": svc.pattern_out(pat).model_dump(by_alias=True)}


@router.get("/{project_id}/versions", response_model=list[VersionOut])
def versions(project_id: str, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    return svc.get_project(db, user, project_id).pattern.versions


@router.post("/{project_id}/versions", response_model=VersionOut, status_code=201)
def save_version(project_id: str, req: VersionCreate, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    v = svc.save_version(svc.get_project(db, user, project_id), req.note)
    db.commit()
    return v


@router.post("/{project_id}/versions/{version}/restore", response_model=PatternOut)
def restore(project_id: str, version: int, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    pat = svc.restore_version(svc.get_project(db, user, project_id), version)
    db.commit()
    return svc.pattern_out(pat)


# ---------- 材料与采购 ----------
@router.get("/{project_id}/materials")
def materials(project_id: str, wastage: float | None = Query(default=None, ge=0, le=0.5), db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """由当前图纸实时计算，保证采购清单与最终 Pattern 一致"""
    return svc.materials_payload(svc.get_project(db, user, project_id), wastage)


@router.patch("/{project_id}/shopping-list")
def patch_shopping(project_id: str, req: ShoppingPatch, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    p = svc.get_project(db, user, project_id)
    sl = p.shopping_list
    if req.wastage_rate is not None:
        sl.wastage_rate = req.wastage_rate
    if req.wear_length_cm is not None:
        sl.wear_length_cm = req.wear_length_cm
    if req.toggle:
        attr = {"bought": "bought", "outOfStock": "out_of_stock", "confirmed": "confirmed"}[req.toggle.kind]
        # JSON 列需整体赋值才能被 SQLAlchemy 侦测到变化
        setattr(sl, attr, {**getattr(sl, attr), req.toggle.item_id: req.toggle.value})
        if req.toggle.kind == "bought" and req.toggle.value and p.status in ("editing", "draft"):
            p.status = "purchasing"
    db.commit()
    return svc.materials_payload(p)


@shopping_router.post("/merge")
def merge(req: MergeRequest, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """合并多个项目的采购需求：先累加用量，再统一计算损耗与包装"""
    projects = [svc.get_project(db, user, pid) for pid in dict.fromkeys(req.project_ids)]
    s = merge_shopping_lists([p.pattern.cells for p in projects], get_catalog(), req.wastage_rate)
    return {"projectIds": [p.id for p in projects], **camelize(s.to_dict()), "lines": [camelize(l) for l in s.to_dict()["lines"]]}


# ---------- 导出 ----------
EXPORTS = {
    "png": "image/png",
    "svg": "image/svg+xml",
    "pdf": "application/pdf",
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "json": "application/json",
}


@router.get("/{project_id}/export/{fmt}")
def export(project_id: str, fmt: str, codes: bool = True, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """导出：png / svg（图纸，codes=true 时格内显示图例编号）、pdf（制作图纸）、csv / xlsx（采购清单）、json（项目）"""
    if fmt not in EXPORTS:
        raise HTTPException(404, "不支持的导出格式")
    p = svc.get_project(db, user, project_id)
    catalog = get_catalog()
    pat = p.pattern
    code_index = {cid: i + 1 for i, cid in enumerate(legend_order(pat.cells, catalog))} if codes else None
    if fmt == "png":
        body: bytes | str = pattern_png(pat.cells, pat.width, pat.height, catalog, code_index)
    elif fmt == "svg":
        body = pattern_svg(pat.cells, pat.width, pat.height, catalog, code_index)
    elif fmt == "pdf":
        body = pattern_pdf(svc.sheet_source(p), catalog)
        p.status, p.exported_at = "exported", svc.now()
        db.commit()
    elif fmt == "csv":
        body = shopping_csv(svc.sheet_source(p), catalog)
    elif fmt == "xlsx":
        body = shopping_xlsx(svc.sheet_source(p), catalog)
    else:
        body = json.dumps({"format": "tsumii-project", "version": 1, "project": svc.project_out(p).model_dump(mode="json", by_alias=True)}, ensure_ascii=False, indent=2)
    filename = f"{p.name}.{fmt}"
    return Response(
        content=body,
        media_type=EXPORTS[fmt],
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
