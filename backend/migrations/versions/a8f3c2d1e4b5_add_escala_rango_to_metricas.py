"""add escala_rango to metricas

Revision ID: a8f3c2d1e4b5
Revises: 431cd39c2ed4
Create Date: 2026-08-25 19:45:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a8f3c2d1e4b5"
down_revision: Union[str, Sequence[str], None] = "431cd39c2ed4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("metricas", sa.Column("escala_rango", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("metricas", "escala_rango")
