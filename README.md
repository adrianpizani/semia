# WALICHO — Plataforma de Análisis Político

Dashboard interactivo de análisis político con mapa geográfico, enfocado en la Provincia de Buenos Aires. Permite ingestar datos de elecciones, indicadores socioeconómicos y otras fuentes heterogéneas, cruzarlos sobre un mapa y producir reportes visuales dinámicos.

---

## 🎯 Objetivos

- **Cargar datos** de múltiples fuentes (elecciones oficiales, socioeconómicos, y a futuro feeds de redes georeferenciadas).
- **Cruzarlos** en una capa geográfica común (municipios / circuitos electorales de la PBA).
- **Visualizarlos** sobre un mapa interactivo con filtros combinables.
- **Generar reportes** gráficos comparativos (electoral vs. socioeconómico, etc.).
- **Escalar** a un sistema interno operativo para el equipo de WALICHO.

### Visión de producto

Una herramienta operativa interna que ofrezca:

- Vista principal: **mapa de la PBA** con municipios como elemento central.
- Panel de filtros: fechas, sección electoral, distrito, partido, indicador, fuente.
- Panel de visualización: gráficos que reaccionan a la interacción con el mapa.
- Métrica principal dinámica: un único selector que determina el coloreado del mapa.
- Métricas secundarias: se suman en cards comparativas (no afectan la coloración del mapa).
- Reporte "drill-down": al seleccionar un municipio, vista detallada con cruces.

---

## 🏗️ Arquitectura

### Stack

| Capa            | Tecnología                                                        |
|-----------------|-------------------------------------------------------------------|
| Frontend        | Next.js 16, React 18, TypeScript, Tailwind CSS, Radix UI          |
| Mapa            | Leaflet + react-leaflet                                           |
| Gráficos        | Recharts                                                          |
| Backend         | FastAPI (Python 3.11), SQLAlchemy async, asyncpg                  |
| GeoDB           | PostgreSQL 16 + PostGIS 3.4                                       |
| Cache (reserv.) | Redis 7                                                           |
| Infra           | Docker Compose (servicios: `db`, `backend`, `redis`)              |

### Modelo de datos (esquema estrella simplificado)

```
        ┌──────────────────┐
        │   archivos       │  ← archivos cargados (CSV/JSON/Excel)
        └────────┬─────────┘
                 │
                 │   ┌──────────────────┐
                 ├──▶│   procesadores   │  ← mapeo de columnas dinámico
                 │   └──────────────────┘
                 │
                 ▼
        ┌──────────────────┐         ┌──────────────────┐
        │     metricas     │         │ dimension_       │
        │                  │         │ geografica       │
        └────────┬─────────┘         └────────┬─────────┘
                 │                            │
                 └─────────────┬──────────────┘
                               ▼
                     ┌──────────────────┐
                     │  hechos_datos    │  ← núcleo (long/tidy)
                     │  - geografia_id  │
                     │  - metrica_id    │
                     │  - archivo_id    │
                     │  - valor         │
                     │  - fecha_dato    │
                     │  - dimension_extra (JSON)
                     └──────────────────┘
```

**Jerarquía geográfica:** Partido → Circuito (cada hijo tiene `parent_id`).
**Tipos de métrica:** `ELECTORAL`, `DEMOGRAFICA`, `GEOGRAFICA`, `TEMPORAL`, `ECONOMICA`.

### Sistema de procesadores

En lugar de un parser hardcodeado por tipo de archivo, existe una entidad `Procesador` configurable:

- Define el `mapeo_columnas` (columna origen → `geography_identifier` / `value_identifier` / dimensión extra).
- Define el `nivel_geografico` esperado.
- Define el `nombre de la métrica` que generará.
- Se selecciona desde el frontend al subir un archivo nuevo.
- Si los encabezados no matchean, se abre un modal que crea el procesador ad-hoc.

Esto habilita la **adaptación dinámica a nuevos formatos** sin tocar código (requisito identificado en noviembre de 2025).

---

## 📂 Estructura del repositorio

```
walicho/
├── README.md               # Este archivo
├── AVANCE.md               # Estado de avance, bugs conocidos, roadmap
├── docker-compose.yml      # Servicios: db (PostGIS), backend (FastAPI), redis
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # Entry point FastAPI
│       ├── models.py           # 5 modelos SQLAlchemy
│       ├── schemas.py          # Schemas Pydantic
│       ├── database.py         # Engine async + sesión
│       ├── routers/            # geografía, archivos, métricas, procesadores
│       ├── services/           # geografía, archivo, upload, metrica
│       │   └── processors/     # genérico, electoral, socioeconómico, PBG
│       └── scripts/            # import_geojson.py, import_circuitos.py
│
├── frontend/
│   ├── package.json            # Next.js 16, React 18, Radix, Leaflet, Recharts
│   ├── next.config.mjs         # Rewrites /api → backend
│   ├── .env.local              # BACKEND_URL=http://localhost:8000
│   ├── app/                    # App Router (dashboard, mapa-electoral, graficos)
│   ├── components/             # UI, sidebar, map-view-client, filter-bar, charts
│   ├── hooks/                  # use-map-view, use-processors
│   └── lib/                    # api.ts (cliente), types.ts, utils.ts
│
├── data/                       # CSVs fuente (electoral, socioeconomico, PBG, EPH)
└── generate_socioeconomico_csv.py  # Generador de dataset socioeconómico mock
```

---

## 🚀 Puesta en marcha

### Requisitos

- Docker + Docker Compose
- Node.js 18+ (para el frontend en desarrollo)

### Backend (Docker)

```bash
docker compose up -d                  # Levanta db + backend + redis
docker compose logs -f backend        # Ver logs

# Cargar geografía base (partidos de la PBA)
docker exec -it pba_backend bash -c "PYTHONPATH=/ python -m app.scripts.import_geojson"

# Cargar circuitos electorales (capa extra sobre municipios)
docker exec -it pba_backend bash -c "PYTHONPATH=/ python -m app.scripts.import_circuitos"
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

El frontend espera `BACKEND_URL=http://localhost:8000` (configurable vía `.env.local`).

---

## 📊 Estado actual (resumen)

| Componente                                  | Estado                          |
|--------------------------------------------|---------------------------------|
| Modelo de datos (estrella + PostGIS)        | ✅ Funcional                    |
| Importación de geografía (municipios)       | ✅ Funcional                    |
| Importación de circuitos electorales        | ✅ Funcional                    |
| Sistema de procesadores dinámicos           | ✅ Funcional (con modal UI)     |
| Carga de CSVs electorales                   | ✅ Funcional                    |
| Carga de CSVs socioeconómicos              | ✅ Funcional                    |
| Mapa interactivo (Leaflet, doble capa)      | ✅ Funcional                    |
| Filtros dinámicos (categoría + rango)       | ✅ Funcional                    |
| Métrica principal + métricas secundarias    | ✅ Funcional                    |
| Vista de reporte (`/graficos`)              | 🟡 Parcial (varios mocks)       |
| Gestión visual de archivos / métricas       | 🟡 Solo creación de procesador |
| Bug: `selectedMunicipio` undefined en mapa  | ❌ Pendiente                    |

Detalle completo de bugs, decisiones pendientes y roadmap en [`AVANCE.md`](./AVANCE.md).

---

## 📚 Documentación relacionada

- [`AVANCE.md`](./AVANCE.md) — Estado de avance, bugs conocidos, decisiones y roadmap.
- `data/` — Datasets fuente (elecciones 2017-2023, indicadores socioeconómicos, PBG, EPH).
- `resumen.rm` y `plan_de_accion.rm` — Documentos fundacionales previos (formato de texto plano heredado).