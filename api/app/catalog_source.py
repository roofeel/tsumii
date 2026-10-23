"""当前生效的色卡：内置示例或数据库中已核实的数据"""
from __future__ import annotations

import threading

from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal
from .engines.catalog import BeadColor, Catalog, load_sample_catalog

_lock = threading.Lock()
_cached: Catalog | None = None


def load_db_catalog() -> Catalog:
    from .models import BeadCatalogRow

    with SessionLocal() as db:
        rows = db.scalars(select(BeadCatalogRow).order_by(BeadCatalogRow.sort_order, BeadCatalogRow.code)).all()
    return Catalog(
        [
            BeadColor(
                id=r.id, code=r.code, name=r.name, name_zh=r.name_zh, name_ja=r.name_ja, hex=r.hex.upper(), finish=r.finish,
                discontinued=r.discontinued, verified=r.verified, pack_beads=r.pack_beads, grams_per_pack=r.grams_per_pack,
                beads_per_gram=r.beads_per_gram, brand=r.brand, series=r.series, size=r.size,
            )
            for r in rows
        ]
    )


def get_catalog() -> Catalog:
    global _cached
    with _lock:
        if _cached is None:
            _cached = load_db_catalog() if get_settings().catalog_source == "db" else load_sample_catalog()
        return _cached


def reset_catalog_cache() -> None:
    global _cached
    with _lock:
        _cached = None
