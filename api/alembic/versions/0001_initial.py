"""initial schema

Revision ID: 0001
Revises:
"""
from alembic import op

from app import models  # noqa: F401
from app.db import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# MVP 初始版本直接按当前模型建表；之后的变更请用
#   alembic revision --autogenerate -m "..."
# 生成显式迁移脚本。


def upgrade() -> None:
    Base.metadata.create_all(op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(op.get_bind())
