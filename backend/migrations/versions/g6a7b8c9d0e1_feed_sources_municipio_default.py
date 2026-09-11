"""feed_sources municipio_default

Revision ID: g6a7b8c9d0e1
Revises: f5a6b7c8d9e0
Create Date: 2026-09-09 21:50:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feed_sources",
        sa.Column("municipio_default", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_feed_sources_municipio_default",
        "feed_sources",
        ["municipio_default"],
    )


def downgrade() -> None:
    op.drop_index("ix_feed_sources_municipio_default", table_name="feed_sources")
    op.drop_column("feed_sources", "municipio_default")
