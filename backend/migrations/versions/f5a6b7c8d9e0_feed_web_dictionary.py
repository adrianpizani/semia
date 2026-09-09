"""feed web dictionary table

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-09-08 09:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (texto, alias, tipo) — mirror of feed_web_tagging.SEED_DICT_ENTRIES
SEED = [
    ("La Libertad Avanza", "la libertad avanza", "partido"),
    ("La Libertad Avanza", "javier milei", "partido"),
    ("Juntos por el Cambio", "juntos por el cambio", "partido"),
    ("Unión por la Patria", "union por la patria", "partido"),
    ("Unión por la Patria", "peronismo", "partido"),
    ("Propuesta Republicana", "propuesta republicana", "partido"),
    ("Frente de Izquierda", "frente de izquierda", "partido"),
    ("Pobreza", "pobreza", "tema"),
    ("Inflación", "inflacion", "tema"),
    ("Seguridad", "seguridad", "tema"),
    ("Educación", "educacion", "tema"),
    ("Salud", "salud", "tema"),
    ("Empleo", "empleo", "tema"),
    ("Desempleo", "desempleo", "tema"),
    ("Vivienda", "vivienda", "tema"),
    ("Tarifas", "tarifas", "tema"),
    ("Dólar", "dolar", "tema"),
    ("Elecciones", "elecciones", "tema"),
    ("Congreso", "congreso", "tema"),
    ("Gobierno", "gobierno", "tema"),
    ("La Matanza", "la matanza", "municipio"),
    ("La Plata", "la plata", "municipio"),
    ("Mar del Plata", "mar del plata", "municipio"),
    ("Bahía Blanca", "bahia blanca", "municipio"),
    ("Quilmes", "quilmes", "municipio"),
    ("Lomas de Zamora", "lomas de zamora", "municipio"),
    ("Avellaneda", "avellaneda", "municipio"),
    ("Lanús", "lanus", "municipio"),
    ("Morón", "moron", "municipio"),
    ("Moreno", "moreno", "municipio"),
    ("Merlo", "merlo", "municipio"),
    ("Tigre", "tigre", "municipio"),
    ("San Isidro", "san isidro", "municipio"),
    ("General San Martín", "general san martin", "municipio"),
    ("Vicente López", "vicente lopez", "municipio"),
    ("Tres de Febrero", "tres de febrero", "municipio"),
    ("Florencio Varela", "florencio varela", "municipio"),
    ("Berazategui", "berazategui", "municipio"),
    ("Almirante Brown", "almirante brown", "municipio"),
    ("Esteban Echeverría", "esteban echeverria", "municipio"),
    ("Ezeiza", "ezeiza", "municipio"),
    ("Hurlingham", "hurlingham", "municipio"),
    ("Ituzaingó", "ituzaingo", "municipio"),
    ("José C. Paz", "jose c paz", "municipio"),
    ("José C. Paz", "jose c. paz", "municipio"),
    ("Malvinas Argentinas", "malvinas argentinas", "municipio"),
    ("San Miguel", "san miguel", "municipio"),
    ("San Fernando", "san fernando", "municipio"),
    ("San Vicente", "san vicente", "municipio"),
    ("Presidente Perón", "presidente peron", "municipio"),
    ("Escobar", "escobar", "municipio"),
    ("Pilar", "pilar", "municipio"),
    ("Campana", "campana", "municipio"),
    ("Zárate", "zarate", "municipio"),
    ("San Nicolás", "san nicolas", "municipio"),
]


def _norm(alias: str) -> str:
    import unicodedata

    text = alias.lower().strip()
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("utf-8")


def upgrade() -> None:
    op.create_table(
        "feed_web_dict_entries",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("texto", sa.String(), nullable=False),
        sa.Column("alias", sa.String(), nullable=False),
        sa.Column("normalized_alias", sa.String(), nullable=False),
        sa.Column("tipo", sa.String(), nullable=False),
        sa.Column("activa", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_alias"),
    )
    op.create_index("ix_feed_web_dict_entries_tipo", "feed_web_dict_entries", ["tipo"])
    op.create_index("ix_feed_web_dict_entries_activa", "feed_web_dict_entries", ["activa"])

    rows = []
    for texto, alias, tipo in SEED:
        rows.append(
            {
                "texto": texto,
                "alias": alias,
                "normalized_alias": _norm(alias),
                "tipo": tipo,
                "activa": True,
            }
        )
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
    op.drop_index("ix_feed_web_dict_entries_activa", table_name="feed_web_dict_entries")
    op.drop_index("ix_feed_web_dict_entries_tipo", table_name="feed_web_dict_entries")
    op.drop_table("feed_web_dict_entries")
