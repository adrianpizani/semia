"""feed web rss tables

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-07 17:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_SOURCES = [
    (1, "Clarín Política", "https://www.clarin.com/rss/politica/", True),
    (2, "La Nación", "https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml", True),
    (3, "El Cronista", "https://www.cronista.com/files/rss/news.xml", True),
    (4, "Perfil", "https://www.perfil.com/feed", True),
    (5, "Ámbito", "https://www.ambito.com/rss/pages/news.xml", True),
]


def upgrade() -> None:
    op.create_table(
        "feed_sources",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("nombre", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ultimo_fetch_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url"),
    )
    op.create_index("ix_feed_sources_activa", "feed_sources", ["activa"])

    op.create_table(
        "feed_web_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("resumen", sa.Text(), nullable=True),
        sa.Column("publicado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("guid", sa.String(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["feed_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("guid"),
    )
    op.create_index("ix_feed_web_items_source_id", "feed_web_items", ["source_id"])
    op.create_index("ix_feed_web_items_publicado_at", "feed_web_items", ["publicado_at"])

    op.create_table(
        "feed_web_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("texto", sa.String(), nullable=False),
        sa.Column("tipo", sa.String(), nullable=True),
        sa.Column("normalized", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized"),
    )
    op.create_index("ix_feed_web_tags_tipo", "feed_web_tags", ["tipo"])

    op.create_table(
        "feed_web_item_tags",
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["feed_web_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["feed_web_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("item_id", "tag_id"),
    )

    sources = sa.table(
        "feed_sources",
        sa.column("nombre", sa.String),
        sa.column("url", sa.String),
        sa.column("activa", sa.Boolean),
    )
    op.bulk_insert(
        sources,
        [
            {"nombre": n, "url": u, "activa": a}
            for _, n, u, a in SEED_SOURCES
        ],
    )

def downgrade() -> None:
    op.drop_table("feed_web_item_tags")
    op.drop_index("ix_feed_web_tags_tipo", table_name="feed_web_tags")
    op.drop_table("feed_web_tags")
    op.drop_index("ix_feed_web_items_publicado_at", table_name="feed_web_items")
    op.drop_index("ix_feed_web_items_source_id", table_name="feed_web_items")
    op.drop_table("feed_web_items")
    op.drop_index("ix_feed_sources_activa", table_name="feed_sources")
    op.drop_table("feed_sources")
