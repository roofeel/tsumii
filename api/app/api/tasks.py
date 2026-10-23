from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user_id
from ..models import GenerationTask
from ..schemas import TaskOut

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: str, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    t = db.get(GenerationTask, task_id)
    if not t or t.user_id != user:
        raise HTTPException(404, "任务不存在")
    return t
