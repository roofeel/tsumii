"""运行配置（环境变量）。示例见 .env.example。"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


def _database_url(url: str) -> str:
    # Coolify 等平台给出的 postgres:// / postgresql:// 连接串统一使用 psycopg 3 驱动
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


@dataclass(frozen=True)
class Settings:
    env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    database_url: str = field(default_factory=lambda: _database_url(os.getenv("DATABASE_URL", "sqlite:///./tsumii.db")))
    # 开发环境自动建表；生产环境使用 Alembic 迁移
    auto_create_tables: bool = field(default_factory=lambda: _bool("AUTO_CREATE_TABLES", True))
    redis_url: str = field(default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    # inline：请求内同步执行（开发/测试）；rq：投递到 Redis 队列由 worker 执行
    queue_mode: str = field(default_factory=lambda: os.getenv("QUEUE_MODE", "inline"))
    queue_name: str = field(default_factory=lambda: os.getenv("QUEUE_NAME", "tsumii"))
    storage_backend: str = field(default_factory=lambda: os.getenv("STORAGE_BACKEND", "local"))
    local_storage_dir: str = field(default_factory=lambda: os.getenv("LOCAL_STORAGE_DIR", "./storage"))
    s3_endpoint_url: str | None = field(default_factory=lambda: os.getenv("S3_ENDPOINT_URL") or None)
    s3_bucket: str = field(default_factory=lambda: os.getenv("S3_BUCKET", "tsumii"))
    s3_region: str = field(default_factory=lambda: os.getenv("S3_REGION", "us-east-1"))
    s3_access_key: str | None = field(default_factory=lambda: os.getenv("S3_ACCESS_KEY") or None)
    s3_secret_key: str | None = field(default_factory=lambda: os.getenv("S3_SECRET_KEY") or None)
    # mock：规则生成，无需密钥；bedrock：Amazon Bedrock 上的 Claude（凭证走 AWS 标准链）
    ai_provider: str = field(default_factory=lambda: os.getenv("AI_PROVIDER", "mock"))
    # Bedrock Converse API（bedrock-runtime）的 global 推理配置文件 ID
    bedrock_model_id: str = field(default_factory=lambda: os.getenv("BEDROCK_MODEL_ID") or "global.anthropic.claude-haiku-5-5")
    aws_region: str = field(default_factory=lambda: os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1")
    # sample：内置示例色卡；db：数据库中已导入的核实色卡
    catalog_source: str = field(default_factory=lambda: os.getenv("CATALOG_SOURCE", "sample"))
    cors_origins: list[str] = field(default_factory=lambda: [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()])
    max_upload_mb: int = field(default_factory=lambda: int(os.getenv("MAX_UPLOAD_MB", "12")))


@lru_cache
def get_settings() -> Settings:
    return Settings()
