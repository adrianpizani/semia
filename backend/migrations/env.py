"""Alembic environment — async (asyncpg).

Customizado para Semia:
  - Lee DATABASE_URL de database (mismo engine que el backend).
  - target_metadata apunta a Base.metadata de los modelos SQLAlchemy.
  - Soporta autogenerate: `alembic revision --autogenerate -m "..."`.

NOTA sobre estructura: el Dockerfile prod copia el contenido de backend/app/
directo al /app/ del container (porque el código usa imports planos como
`from database import ...`). Por eso los imports acá también son planos, no
`from app.database import ...`. Si el código se reorganiza a imports de
paquete, revisar este archivo.

Para correr migraciones contra la DB de prod, asegurarse de que
DATABASE_URL esté apuntando al servicio 'db' (igual que el backend).
"""
import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# El cwd esperado es /app (donde vive main.py). En el container el Dockerfile
# copia backend/app/* a /app, así que database.py está al lado de migrations/.
# En el host (cd backend && alembic ...) database.py vive en backend/app/.
_here = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_here)
for _p in (_root, os.path.join(_root, "app"), "/app"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from database import Base  # noqa: E402
import models  # noqa: F401, E402  -- importa modelos para que se registren en Base.metadata

# Alembic Config object.
config = context.config

# Si el alembic.ini tiene sqlalchemy.url seteado, lo pisamos con el de env.
# ConfigParser interpola `%`, así que hay que escaparlos.
db_url = os.getenv("DATABASE_URL") or ""
if not db_url:
    raise RuntimeError("DATABASE_URL no está definida; Alembic no puede conectar.")
config.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))

# Logging desde alembic.ini.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# target_metadata para autogenerate.
target_metadata = Base.metadata

# Autogenerate no debe tocar las tablas de PostGIS (spatial_ref_sys en public,
# más tiger.* / topology.*). Sin este filtro, `alembic revision --autogenerate`
# propone dropearlas.
_POSTGIS_TABLES = {"spatial_ref_sys"}
_POSTGIS_SCHEMAS = {"tiger", "tiger_data", "topology"}


def include_object(object_, name, type_, reflected, compare_to):
    if type_ == "table":
        schema = getattr(object_, "schema", None)
        if schema in _POSTGIS_SCHEMAS:
            return False
        if name in _POSTGIS_TABLES:
            return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emite SQL sin conectar a la DB."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Crea un engine async desde la config y corre las migraciones."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
