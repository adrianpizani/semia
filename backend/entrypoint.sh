#!/bin/sh
# Corre migraciones una sola vez (antes de que uvicorn forkee workers) y
# después arranca el CMD. En un volumen vacío (EC2 nuevo) esto crea las
# tablas. Si el schema ya existe pero alembic_version está vacío, hay que
# stampear antes: `alembic stamp head`.
set -e
echo "[entrypoint] alembic upgrade head"
alembic upgrade head
# Geografía seed (provincias + partidos PBA). Idempotente; en reinicios
# con seed completo es no-op. Necesario en prod para capa Nacional.
echo "[entrypoint] seed geografía (provincias + partidos, si faltan)"
python -c "import asyncio; from scripts.import_geojson import import_geojson_data; asyncio.run(import_geojson_data(verbose=False))" || \
  echo "[entrypoint] WARN: seed geojson no corrió (¿GeoJSON ausente en /app/static?)."
# Catálogo EPH (aglomerados + pesos) si la tabla está vacía — necesario en prod
# donde no se corre el seed a mano.
echo "[entrypoint] seed EPH reference (si vacío)"
python -c "import asyncio; from scripts.seed_eph_reference import main; asyncio.run(main())" || \
  echo "[entrypoint] WARN: seed EPH no corrió (¿CSV ausente?). Se reintentará al ingest."
echo "[entrypoint] starting: $*"
exec "$@"
