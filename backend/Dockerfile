# Dockerfile de producción para el backend (FastAPI).
# - libpq-dev: requerido por psycopg2-binary en tiempo de build (algunos wheels).
# - libgeos-dev: requerido por shapely/GeoAlchemy2.
# - 4 workers uvicorn para un t3.micro; ajustar según RAM disponible en EC2.
#
# Estructura del código: backend/app/main.py (FastAPI). Los imports del proyecto
# son PLANOS (`from database import ...`, `from routers import ...`), asumiendo
# que cwd=/app y el código vive directamente ahí. Por eso copiamos el CONTENIDO
# de backend/app/ al /app del container, no la carpeta entera.
#
# Si en el futuro los imports se convierten a `from app.X import Y`, hay que
# revisar este COPY (probablemente volver a `COPY . .` y `CMD ["uvicorn",
# "app.main:app", ...]`).
#
# Variables de entorno que se esperan (pasadas vía docker-compose):
#   DATABASE_URL, SECRET_KEY, AUTH_SECRET, COOKIE_SECURE,
#   ACCESS_TOKEN_EXPIRE_MINUTES, ADMIN_EMAIL, ADMIN_PASSWORD

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencias del sistema.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    libgeos-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Instalar deps primero (aprovecha la cache de Docker).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar SOLO el contenido de backend/app/ al /app/. Esto deja:
#   /app/main.py, /app/database.py, /app/routers/, /app/services/, etc.
# que es exactamente lo que esperan los imports planos del código.
COPY app/ ./

# Alembic: config + migrations embebidos en la imagen. Sin esto, cada
# container nuevo arranca sin alembic.ini y falla con "No script_location".
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations

# GeoJSON de seed (partidos + circuitos). Los scripts import_geojson /
# import_circuitos leen /app/static/*.geojson. En prod no hay bind-mount,
# así que tienen que ir en la imagen. En dev, docker-compose.yml monta
# ./backend/static encima de este directorio.
COPY static ./static

# Entrypoint fuera de /app: en dev el bind-mount de ./backend/app tapa /app
# y si el script viviera ahí, `alembic upgrade` no correría.
COPY entrypoint.sh /entrypoint.sh

# Usuario no-root por seguridad.
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app \
    && chmod +x /entrypoint.sh
USER appuser

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
# En prod: uvicorn con --workers. En t3.micro (1GB RAM) con 4 workers y ~150MB por worker
# queda ~600MB para DB cache + sistema. Si hay OOM, bajar a 2.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
