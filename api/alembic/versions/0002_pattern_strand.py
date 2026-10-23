"""项链串链：patterns.strand、pattern_versions.strand

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(JSONB(), "postgresql")
TABLES = ("patterns", "pattern_versions")


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # 0001 按当前模型建表：新库已经带有 strand 列，只给旧库补列
    for table in TABLES:
        if not _has_column(table, "strand"):
            op.add_column(table, sa.Column("strand", JSONType, nullable=True))


def downgrade() -> None:
    for table in TABLES:
        if _has_column(table, "strand"):
            op.drop_column(table, "strand")
