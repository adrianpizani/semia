#!/bin/sh
# Corre migraciones una sola vez (antes de que uvicorn forkee workers) y
# después arranca el CMD. En un volumen vacío (EC2 nuevo) esto crea las
# tablas. Si el schema ya existe pero alembic_version está vacío, hay que
# stampear antes: `alembic stamp head`.
set -e
echo "[entrypoint] alembic upgrade head"
alembic upgrade head
echo "[entrypoint] starting: $*"
exec "$@"
