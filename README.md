# WALICHO

Dashboard de análisis político sobre la Provincia de Buenos Aires. Carga datos electorales, socioeconómicos y de PBG, los cruza sobre un mapa interactivo (municipios y circuitos) y permite filtrar por partido, año, tipo de voto y rangos numéricos.

La app pide login. Roles: **admin** (carga y gestión) y **viewer** (solo lectura).

Otra documentación:

| Archivo | Para qué |
|---------|----------|
| [`AVANCE.md`](./AVANCE.md) | Bitácora, bugs, decisiones y roadmap |
| [`DEPLOY.md`](./DEPLOY.md) | Plan y runbook del deploy en AWS |

---

## Requisitos

- Docker + Docker Compose
- (Opcional) Node.js 18+ si corrés el frontend fuera de Docker

---

## Arranque local

```bash
cp .env.example .env          # los defaults alcanzan para desarrollo
docker compose up -d          # db, backend, frontend, redis, nginx
docker compose logs -f backend
```

Entrada recomendada: **http://localhost** (nginx, puerto 80). Subí CSVs grandes por acá, no por el puerto 3000.

URLs directas:

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| Backend / docs | http://localhost:8000/docs |

Al arrancar, el backend corre `alembic upgrade head` y crea las tablas. La primera vez hay que sembrar geografía y el admin:

```bash
docker compose exec -e PYTHONPATH=/ backend python -m app.scripts.import_geojson
docker compose exec -e PYTHONPATH=/ backend python -m app.scripts.import_circuitos
docker compose exec -e PYTHONPATH=/ backend python -m app.scripts.create_admin
```

Login: `admin@walicho.com` / `admin123` (cambiables con `ADMIN_EMAIL` / `ADMIN_PASSWORD` en `.env`).

Si el volumen de Postgres es viejo (tablas creadas con `create_all`, sin Alembic):

```bash
docker compose exec backend alembic stamp head
```

### Frontend en el host (sin Docker)

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

`BACKEND_URL` en `frontend/.env.local` debe apuntar a un backend alcanzable (default `http://localhost:8000`).

---

## Qué hay en el repo

```
walicho/
├── README.md                 # Esta guía
├── AVANCE.md                 # Bitácora y roadmap
├── DEPLOY.md                 # Deploy AWS
├── docker-compose.yml        # Desarrollo
├── docker-compose.prod.yml   # Producción
├── .env.example
├── backend/                  # FastAPI + Alembic + GeoJSON de seed
├── frontend/                 # Next.js (App Router)
├── nginx/
└── data/                     # CSVs fuente
```

Stack: Next.js 16, FastAPI, PostgreSQL 16 + PostGIS 3.4, Redis (reservado), Nginx.

Modelo (esquema estrella): `archivos` + `procesadores` + `metricas` + `dimension_geografica` → `hechos_datos`. Jerarquía geográfica: Partido → Circuito (`parent_id`). Auth: tabla `usuarios`, JWT en cookie httpOnly.

Los procesadores mapean columnas de un CSV a roles (`geography_identifier`, `value_identifier`, dimensiones extra) sin tocar código. Si los encabezados no matchean, el modal del frontend crea el mapeo.

---

## Estado (resumen)

| Área | Estado |
|------|--------|
| Mapa (municipios + circuitos) | Listo |
| Ingesta CSV + procesadores | Listo |
| Filtros cruzados (electoral + rango) | Listo |
| Auth (JWT, admin/viewer) | Listo |
| Schema con Alembic | Listo |
| Docker de producción | Listo en el repo |
| Deploy AWS | Pendiente — ver [`DEPLOY.md`](./DEPLOY.md) |
| Vista `/graficos` | Parcial (varios mocks) |
| CI/CD | Pendiente |

Detalle, bugs y roadmap: [`AVANCE.md`](./AVANCE.md).
