"""Tsumii API — FastAPI 应用入口：uvicorn app.main:app --reload"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import ai, catalog, images, projects, tasks
from .catalog_source import get_catalog
from .config import get_settings
from .db import Base, engine

logging.basicConfig(level=logging.INFO)
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.auto_create_tables:
        from . import models  # noqa: F401  注册模型

        Base.metadata.create_all(engine)
    if not get_catalog().verified:
        logging.getLogger("tsumii").warning("当前使用示例色卡（未核实）。上线前请导入已核实的 MIYUKI 色卡并设置 CATALOG_SOURCE=db。")
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Tsumii API",
    version="0.1.0",
    description="Tsumii つみー · 串米 — AI 串珠设计与 DIY 创作平台后端（MVP：Delica 11/0，平面方格排列）",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

API = "/api/v1"
for r in (catalog.router, ai.router, tasks.router, images.router, projects.router, projects.shopping_router):
    app.include_router(r, prefix=API)


@app.get("/health")
def health():
    return {"status": "ok", "catalogVerified": get_catalog().verified, "queueMode": settings.queue_mode}
