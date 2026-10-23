from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..catalog_source import get_catalog
from ..config import get_settings
from ..db import get_db
from ..deps import current_user_id
from ..engines.ai.base import AIProviderError, get_provider
from ..engines.ai.base import DesignIdea as IdeaDC
from ..engines.ai.parse import parse_prompt
from ..models import DesignVariant, GenerationTask
from ..schemas import IdeasRequest, ParseRequest, RefineRequest, TaskOut, VariantOut, camelize
from ..services import get_idea, idea_to_api
from ..task_queue import enqueue
from ..workers.jobs import generate_ideas_job

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/parse")
def parse(req: ParseRequest):
    """自然语言 → 结构化需求（作品类型、主色调、风格、主题、场景、难度）"""
    return camelize(parse_prompt(req.prompt).to_dict())


@router.post("/ideas", response_model=TaskOut, status_code=202)
def generate(req: IdeasRequest, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """创建方案生成任务。QUEUE_MODE=inline 时返回的任务已完成并带结果；否则轮询 GET /tasks/{id}。"""
    brief = req.brief.model_dump(exclude_none=True) if req.brief else {}
    task = GenerationTask(user_id=user, kind="ideas", input={"prompt": req.prompt, "count": req.count, "brief": brief})
    db.add(task)
    db.commit()
    enqueue(generate_ideas_job, task.id)
    db.refresh(task)
    return task


@router.get("/ideas/{idea_id}")
def get_one(idea_id: str, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    row = get_idea(db, user, idea_id)
    return idea_to_api(row) | {
        "variants": [
            {"id": v.id, "parentVariantId": v.parent_variant_id, "refinementPrompt": v.refinement_prompt, "idea": camelize(v.data), "createdAt": v.created_at}
            for v in row.variants
        ]
    }


@router.post("/ideas/{idea_id}/refine", response_model=VariantOut)
def refine(idea_id: str, req: RefineRequest, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """AI 二次设计：在原方案（或指定版本）基础上细化，生成新的 DesignVariant"""
    row = get_idea(db, user, idea_id)
    base = row.data
    if req.parent_variant_id:
        parent = db.get(DesignVariant, req.parent_variant_id)
        if not parent or parent.idea_id != row.id:
            raise HTTPException(404, "版本不存在")
        base = parent.data
    try:
        ref = get_provider(get_settings().ai_provider, get_catalog()).refine(IdeaDC.from_dict(base), req.instruction)
    except AIProviderError as e:
        raise HTTPException(502, str(e)) from e
    for v in row.variants:
        v.selected = False
    var = DesignVariant(idea_id=row.id, parent_variant_id=req.parent_variant_id, refinement_prompt=req.instruction, data=ref.idea.to_dict(), selected=True)
    db.add(var)
    db.commit()
    return VariantOut(
        id=var.id, idea_id=row.id, parent_variant_id=var.parent_variant_id, refinement_prompt=var.refinement_prompt,
        idea=camelize(var.data), notes=ref.notes, created_at=var.created_at,
    )
