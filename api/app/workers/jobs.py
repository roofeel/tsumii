"""后台任务。QUEUE_MODE=rq 时由 worker 进程执行（python -m app.workers.worker）。"""
from __future__ import annotations

import io
import logging
import traceback

from PIL import Image

from ..catalog_source import get_catalog
from ..config import get_settings
from ..db import SessionLocal
from ..engines.ai.base import get_provider
from ..engines.ai.parse import ParsedBrief, parse_prompt
from ..engines.convert import ConvertOptions, PrepOptions, convert_image
from ..models import Asset, GenerationTask
from ..schemas import camelize
from ..services import create_project, now, save_idea
from ..storage import get_storage

log = logging.getLogger(__name__)


def _run(task_id: str, work) -> None:
    with SessionLocal() as db:
        task = db.get(GenerationTask, task_id)
        if task is None:
            log.error("task %s not found", task_id)
            return
        task.status = "running"
        db.commit()
        try:
            task.result = work(db, task)
            task.status = "succeeded"
        except Exception as e:  # noqa: BLE001
            db.rollback()
            task = db.get(GenerationTask, task_id)
            task.status = "failed"
            task.error = str(e) or e.__class__.__name__
            log.error("task %s failed: %s", task_id, traceback.format_exc())
        task.finished_at = now()
        db.commit()


def generate_ideas_job(task_id: str) -> None:
    def work(db, task: GenerationTask) -> dict:
        inp = task.input
        brief = parse_prompt(inp["prompt"])
        overrides = {k: v for k, v in (inp.get("brief") or {}).items() if v is not None}
        brief = ParsedBrief(**{**brief.to_dict(), **overrides})
        ideas = get_provider(get_settings().ai_provider, get_catalog()).generate_ideas(inp["prompt"], brief, inp.get("count", 4))
        rows = [save_idea(db, task.user_id, i, task.id) for i in ideas]
        db.flush()
        return {"brief": camelize(brief.to_dict()), "ideas": [camelize(r.data) | {"id": r.id} for r in rows]}

    _run(task_id, work)


def convert_image_job(task_id: str) -> None:
    def work(db, task: GenerationTask) -> dict:
        inp = task.input
        asset = db.get(Asset, inp["assetId"])
        if asset is None or asset.user_id != task.user_id:
            raise ValueError("图片不存在")
        img = Image.open(io.BytesIO(get_storage().get(asset.key)))
        prep = PrepOptions(**inp.get("prep", {}))
        opts = ConvertOptions(**{k: v for k, v in inp["options"].items() if k != "prep"}, prep=prep)
        cells, cols, rows = convert_image(img, opts, get_catalog())
        result: dict = {"width": cols, "height": rows, "cells": cells, "colorCount": len(set(cells))}
        meta = inp.get("createProject")
        if meta:
            p = create_project(db, task.user_id, name=meta["name"], item_type=meta["itemType"], creation_mode="image", width=cols, height=rows, cells=cells)
            result["projectId"] = p.id
        return result

    _run(task_id, work)
