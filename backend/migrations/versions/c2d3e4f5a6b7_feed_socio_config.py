"""feed socio config trimestre

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-09-01 20:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feed_socio_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "borrar_trimestre_anterior_al_publicar",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("trimestre_referencia", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        "INSERT INTO feed_socio_config (id, borrar_trimestre_anterior_al_publicar) VALUES (1, false)"
    )


def downgrade() -> None:
    op.drop_table("feed_socio_config")
