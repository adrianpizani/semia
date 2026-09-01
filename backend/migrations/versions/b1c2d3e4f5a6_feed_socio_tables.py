"""feed socioeconomico tables

Revision ID: b1c2d3e4f5a6
Revises: a8f3c2d1e4b5
Create Date: 2026-08-31 22:15:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a8f3c2d1e4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aglomerado_eph",
        sa.Column("codigo", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("region_macro", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("codigo"),
    )
    op.create_table(
        "aglomerado_partido_peso",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("aglomerado_cod", sa.Integer(), nullable=False),
        sa.Column("partido_nombre", sa.String(), nullable=False),
        sa.Column("peso", sa.Numeric(10, 6), nullable=False),
        sa.Column("fuente", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["aglomerado_cod"], ["aglomerado_eph.codigo"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_aglomerado_partido_peso_aglomerado_cod",
        "aglomerado_partido_peso",
        ["aglomerado_cod"],
    )
    op.create_table(
        "feed_socio_staging",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("aglomerado_cod", sa.Integer(), nullable=False),
        sa.Column("indicador_clave", sa.String(), nullable=False),
        sa.Column("fecha_dato", sa.Date(), nullable=False),
        sa.Column("valor", sa.Numeric(15, 4), nullable=False),
        sa.Column(
            "estado",
            sa.Enum("BORRADOR", "PUBLICADO", name="feedsocioestado"),
            nullable=False,
            server_default="BORRADOR",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["aglomerado_cod"], ["aglomerado_eph.codigo"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feed_socio_staging_estado", "feed_socio_staging", ["estado"])
    op.create_index(
        "ix_feed_socio_staging_aglomerado_indicador",
        "feed_socio_staging",
        ["aglomerado_cod", "indicador_clave"],
    )


def downgrade() -> None:
    op.drop_index("ix_feed_socio_staging_aglomerado_indicador", table_name="feed_socio_staging")
    op.drop_index("ix_feed_socio_staging_estado", table_name="feed_socio_staging")
    op.drop_table("feed_socio_staging")
    op.drop_index("ix_aglomerado_partido_peso_aglomerado_cod", table_name="aglomerado_partido_peso")
    op.drop_table("aglomerado_partido_peso")
    op.drop_table("aglomerado_eph")
    op.execute("DROP TYPE IF EXISTS feedsocioestado")
