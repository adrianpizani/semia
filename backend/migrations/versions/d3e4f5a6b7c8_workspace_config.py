"""workspace_config singleton JSON document

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-09-07 16:40:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "document",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Seed vacío: el servicio completa con DEFAULTS al primer GET.
    # Si hay feed_socio_config, se migra en el servicio al primer acceso.
    op.execute("INSERT INTO workspace_config (id, document) VALUES (1, '{}'::jsonb)")


def downgrade() -> None:
    op.drop_table("workspace_config")
