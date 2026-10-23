import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from ..catalog_source import get_catalog
from ..config import get_settings
from ..db import get_db
from ..deps import current_user_id
from ..models import Asset, GenerationTask
from ..schemas import AssetOut, ConvertRequest, TaskOut
from ..storage import get_storage
from ..task_queue import enqueue
from ..workers.jobs import convert_image_job

router = APIRouter(prefix="/images", tags=["images"])

ALLOWED = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


@router.post("", response_model=AssetOut, status_code=201)
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """上传 JPG / PNG / WebP。以实际文件内容判断格式，不信任扩展名。"""
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"图片不能超过 {get_settings().max_upload_mb} MB")
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt, (w, h) = im.format, im.size
            im.verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "无法识别的图片文件")
    if fmt not in ALLOWED:
        raise HTTPException(415, "仅支持 JPG / PNG / WebP")
    key = f"uploads/{user}/{uuid.uuid4().hex}.{fmt.lower()}"
    get_storage().put(key, data, ALLOWED[fmt])
    asset = Asset(user_id=user, key=key, content_type=ALLOWED[fmt], size=len(data), width=w, height=h)
    db.add(asset)
    db.commit()
    return asset


@router.post("/{asset_id}/convert", response_model=TaskOut, status_code=202)
def convert(asset_id: str, req: ConvertRequest, db: Session = Depends(get_db), user: str = Depends(current_user_id)):
    """图片 → 串珠图纸（异步任务）。结果包含 width、height、cells；填写 createProject 时同时创建项目。"""
    asset = db.get(Asset, asset_id)
    if not asset or asset.user_id != user:
        raise HTTPException(404, "图片不存在")
    if req.background_id and req.background_id not in get_catalog():
        raise HTTPException(422, "backgroundId 不在色卡中")
    options = req.model_dump(exclude={"prep", "create_project"})
    task = GenerationTask(
        user_id=user,
        kind="image-convert",
        input={
            "assetId": asset.id,
            "options": options,
            "prep": req.prep.model_dump(),
            "createProject": req.create_project.model_dump(by_alias=True) if req.create_project else None,
        },
    )
    db.add(task)
    db.commit()
    enqueue(convert_image_job, task.id)
    db.refresh(task)
    return task
