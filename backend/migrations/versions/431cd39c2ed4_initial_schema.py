"""initial schema

Revision ID: 431cd39c2ed4
Revises:
Create Date: 2026-08-18 13:03:34.105452

Crea las 6 tablas de WALICHO. Las tablas de PostGIS (tiger.*, spatial_ref_sys)
vienen preinstaladas en la imagen postgis/postgis y no las administramos acá.

NOTA: este archivo fue reescrito a mano. La generación automática con
`alembic revision --autogenerate` arrastraba las tablas de PostGIS como
"a remover" porque no están en nuestros modelos. env.py ahora filtra
spatial_ref_sys / tiger / topology via include_object.
"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '431cd39c2ed4'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Crear las 6 tablas de WALICHO."""
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # ─── usuarios ───
    op.create_table(
        'usuarios',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('nombre', sa.String(), nullable=True),
        sa.Column('rol', sa.String(), nullable=False),
        sa.Column('activo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_usuarios_id'), 'usuarios', ['id'])
    op.create_index(op.f('ix_usuarios_email'), 'usuarios', ['email'], unique=True)

    # ─── archivos ───
    op.create_table(
        'archivos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre_visible', sa.String(), nullable=False),
        sa.Column('nombre_archivo_original', sa.String(), nullable=False),
        sa.Column('fecha_de_carga', sa.Date(), server_default=sa.text('now()'), nullable=True),
        sa.Column('descripcion', sa.String(), nullable=True),
        sa.Column(
            'estado',
            sa.Enum('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO', name='estadoprocesamiento'),
            nullable=False,
        ),
        sa.Column('log_procesamiento', sa.Text(), nullable=True),
        sa.Column('filas_procesadas', sa.Integer(), nullable=True),
        sa.Column('filas_fallidas', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_archivos_id'), 'archivos', ['id'])

    # ─── dimension_geografica ───
    op.create_table(
        'dimension_geografica',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(), nullable=False),
        sa.Column('nivel', sa.String(), nullable=False),
        sa.Column(
            'geometria',
            geoalchemy2.types.Geometry(
                geometry_type='MULTIPOLYGON', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'
            ),
            nullable=True,
        ),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['parent_id'], ['dimension_geografica.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_dimension_geografica_id'), 'dimension_geografica', ['id'])
    op.create_index(op.f('ix_dimension_geografica_nombre'), 'dimension_geografica', ['nombre'], unique=True)
    op.create_index(op.f('ix_dimension_geografica_nivel'), 'dimension_geografica', ['nivel'])
    # GeoAlchemy2 (spatial_index=True) crea este GiST al hacer create_all;
    # hay que replicarlo acá o las queries espaciales del mapa no lo usan.
    op.create_index(
        'idx_dimension_geografica_geometria',
        'dimension_geografica',
        ['geometria'],
        unique=False,
        postgresql_using='gist',
    )

    # ─── metricas ───
    op.create_table(
        'metricas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre_clave', sa.String(), nullable=False),
        sa.Column('nombre_amigable', sa.String(), nullable=True),
        sa.Column(
            'tipo',
            sa.Enum('ELECTORAL', 'DEMOGRAFICA', 'GEOGRAFICA', 'TEMPORAL', 'ECONOMICA', name='tipometrica'),
            nullable=False,
        ),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('archivo_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['archivo_id'], ['archivos.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_metricas_id'), 'metricas', ['id'])
    op.create_index(op.f('ix_metricas_nombre_clave'), 'metricas', ['nombre_clave'], unique=True)

    # ─── procesadores ───
    op.create_table(
        'procesadores',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(), nullable=False),
        sa.Column('tipo_archivo', sa.String(), nullable=False),
        sa.Column('nivel_geografico', sa.String(), nullable=False),
        sa.Column('metric_name', sa.String(), nullable=False),
        sa.Column('mapeo_columnas', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre'),
    )
    op.create_index(op.f('ix_procesadores_id'), 'procesadores', ['id'])

    # ─── hechos_datos ───
    op.create_table(
        'hechos_datos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('geografia_id', sa.Integer(), nullable=True),
        sa.Column('metrica_id', sa.Integer(), nullable=True),
        sa.Column('archivo_id', sa.Integer(), nullable=False),
        sa.Column('fecha_dato', sa.Date(), nullable=True),
        sa.Column('valor', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('dimension_extra', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['archivo_id'], ['archivos.id'], ),
        sa.ForeignKeyConstraint(['geografia_id'], ['dimension_geografica.id'], ),
        sa.ForeignKeyConstraint(['metrica_id'], ['metricas.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_hechos_datos_id'), 'hechos_datos', ['id'])
    op.create_index(op.f('ix_hechos_datos_geografia_id'), 'hechos_datos', ['geografia_id'])
    op.create_index(op.f('ix_hechos_datos_metrica_id'), 'hechos_datos', ['metrica_id'])
    op.create_index(op.f('ix_hechos_datos_archivo_id'), 'hechos_datos', ['archivo_id'])
    op.create_index(op.f('ix_hechos_datos_fecha_dato'), 'hechos_datos', ['fecha_dato'])


def downgrade() -> None:
    """Borrar las 6 tablas de WALICHO. Orden importa por las FKs."""
    op.drop_index(op.f('ix_hechos_datos_fecha_dato'), table_name='hechos_datos')
    op.drop_index(op.f('ix_hechos_datos_archivo_id'), table_name='hechos_datos')
    op.drop_index(op.f('ix_hechos_datos_metrica_id'), table_name='hechos_datos')
    op.drop_index(op.f('ix_hechos_datos_geografia_id'), table_name='hechos_datos')
    op.drop_index(op.f('ix_hechos_datos_id'), table_name='hechos_datos')
    op.drop_table('hechos_datos')

    op.drop_index(op.f('ix_procesadores_id'), table_name='procesadores')
    op.drop_table('procesadores')

    op.drop_index(op.f('ix_metricas_nombre_clave'), table_name='metricas')
    op.drop_index(op.f('ix_metricas_id'), table_name='metricas')
    op.drop_table('metricas')

    op.drop_index('idx_dimension_geografica_geometria', table_name='dimension_geografica')
    op.drop_index(op.f('ix_dimension_geografica_nivel'), table_name='dimension_geografica')
    op.drop_index(op.f('ix_dimension_geografica_nombre'), table_name='dimension_geografica')
    op.drop_index(op.f('ix_dimension_geografica_id'), table_name='dimension_geografica')
    op.drop_table('dimension_geografica')

    op.drop_index(op.f('ix_archivos_id'), table_name='archivos')
    op.drop_table('archivos')

    op.drop_index(op.f('ix_usuarios_email'), table_name='usuarios')
    op.drop_index(op.f('ix_usuarios_id'), table_name='usuarios')
    op.drop_table('usuarios')

    # Limpiar los tipos enum creados por SQLAlchemy.
    sa.Enum(name='tipometrica').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='estadoprocesamiento').drop(op.get_bind(), checkfirst=True)
