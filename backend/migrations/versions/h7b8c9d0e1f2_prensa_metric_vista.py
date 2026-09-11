"""Add PRENSA metric type and vista flags (cruce / hotspots)

Revision ID: h7b8c9d0e1f2
Revises: g6a7b8c9d0e1
Create Date: 2026-09-11 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "g6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nuevo valor de enum: commit inmediato para poder usarlo en el UPDATE.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE tipometrica ADD VALUE IF NOT EXISTS 'PRENSA'"))

    op.add_column(
        "metricas",
        sa.Column("mostrar_cruce", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "metricas",
        sa.Column("mostrar_hotspots", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute(
        sa.text(
            """
            UPDATE metricas
            SET tipo = 'PRENSA',
                mostrar_cruce = false,
                mostrar_hotspots = true
            WHERE nombre_clave LIKE 'prensa_%'
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE metricas
            SET tipo = 'DEMOGRAFICA'
            WHERE tipo = 'PRENSA'
            """
        )
    )
    op.drop_column("metricas", "mostrar_hotspots")
    op.drop_column("metricas", "mostrar_cruce")
    # No removemos el valor PRENSA del enum (PostgreSQL no lo permite fácilmente).
