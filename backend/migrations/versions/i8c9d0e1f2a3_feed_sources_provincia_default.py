"""feed_sources provincia_default + seed dict provincias

Revision ID: i8c9d0e1f2a3
Revises: h7b8c9d0e1f2
Create Date: 2026-09-22 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "h7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirror of feed_web_tagging.SEED_PROVINCIA_ENTRIES (texto, alias, tipo)
_PROVINCIA_SEED: list[tuple[str, str, str]] = [
    ("Buenos Aires", "buenos aires", "provincia"),
    ("Buenos Aires", "provincia de buenos aires", "provincia"),
    ("Ciudad Autónoma de Buenos Aires", "ciudad autonoma de buenos aires", "provincia"),
    ("Ciudad Autónoma de Buenos Aires", "caba", "provincia"),
    ("Ciudad Autónoma de Buenos Aires", "capital federal", "provincia"),
    ("Catamarca", "catamarca", "provincia"),
    ("Chaco", "chaco", "provincia"),
    ("Chubut", "chubut", "provincia"),
    ("Córdoba", "cordoba", "provincia"),
    ("Corrientes", "corrientes", "provincia"),
    ("Entre Ríos", "entre rios", "provincia"),
    ("Formosa", "formosa", "provincia"),
    ("Jujuy", "jujuy", "provincia"),
    ("La Pampa", "la pampa", "provincia"),
    ("La Rioja", "la rioja", "provincia"),
    ("Mendoza", "mendoza", "provincia"),
    ("Misiones", "misiones", "provincia"),
    ("Neuquén", "neuquen", "provincia"),
    ("Río Negro", "rio negro", "provincia"),
    ("Salta", "salta", "provincia"),
    ("San Juan", "san juan", "provincia"),
    ("San Luis", "san luis", "provincia"),
    ("Santa Cruz", "santa cruz", "provincia"),
    ("Santa Fe", "santa fe", "provincia"),
    ("Santiago del Estero", "santiago del estero", "provincia"),
    (
        "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
        "tierra del fuego",
        "provincia",
    ),
    (
        "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
        "tierra del fuego antartida",
        "provincia",
    ),
    ("Tucumán", "tucuman", "provincia"),
]


def upgrade() -> None:
    op.add_column(
        "feed_sources",
        sa.Column("provincia_default", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_feed_sources_provincia_default",
        "feed_sources",
        ["provincia_default"],
    )

    conn = op.get_bind()
    existing = {
        (r[0], r[1], r[2])
        for r in conn.execute(
            sa.text(
                "SELECT texto, alias, tipo FROM feed_web_dict_entries WHERE tipo = 'provincia'"
            )
        )
    }
    rows = [
        {
            "texto": texto,
            "alias": alias,
            "normalized_alias": alias,
            "tipo": tipo,
            "activa": True,
        }
        for texto, alias, tipo in _PROVINCIA_SEED
        if (texto, alias, tipo) not in existing
    ]
    if rows:
        op.bulk_insert(
            sa.table(
                "feed_web_dict_entries",
                sa.column("texto", sa.String),
                sa.column("alias", sa.String),
                sa.column("normalized_alias", sa.String),
                sa.column("tipo", sa.String),
                sa.column("activa", sa.Boolean),
            ),
            rows,
        )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM feed_web_dict_entries WHERE tipo = 'provincia'"))
    op.drop_index("ix_feed_sources_provincia_default", table_name="feed_sources")
    op.drop_column("feed_sources", "provincia_default")
