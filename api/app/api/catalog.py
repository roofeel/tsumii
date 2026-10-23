from fastapi import APIRouter, HTTPException

from ..catalog_source import get_catalog

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("")
def list_colors():
    """当前色卡。verified=false 时界面需提示“示例数据，不能用于采购”。"""
    c = get_catalog()
    return {"verified": c.verified, "colors": [x.to_dict() for x in c.colors]}


@router.get("/{color_id}/alternatives")
def alternatives(color_id: str, k: int = 3):
    c = get_catalog()
    if color_id not in c:
        raise HTTPException(404, "色号不存在")
    return [{"color": x.to_dict(), "deltaE": round(d, 2)} for x, d in c.alternatives(color_id, max(1, min(10, k)))]
