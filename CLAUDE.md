# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

WALICHO is a political-analysis dashboard focused on the Provincia de Buenos Aires (PBA). It ingests election, socioeconomic and PBG data into a star-schema fact model, and renders them on an interactive Leaflet map with cross-metric filters (party / year / vote type / numeric range). The dashboard is a single Next.js page at `frontend/app/page.tsx`; the only other active route is `/graficos` (drill-down report). Sidebar links to `/filtros`, `/archivos`, `/metricas`, `/configuracion` exist but their pages are empty placeholders.

See `README.md` for the full product brief and `AVANCE.md` for the live changelog of in-flight work, bugs and roadmap.

## Commands

### Stack

- **Backend:** FastAPI on Python 3.11, SQLAlchemy async + asyncpg, GeoAlchemy2, PostgreSQL 16 + PostGIS 3.4, Redis 7 (reserved, unused).
- **Frontend:** Next.js 16 (App Router), React 18, TypeScript, Tailwind v4, Radix UI, Leaflet + react-leaflet, Recharts.
- **Infra:** Docker Compose with services `db`, `backend`, `frontend`, `redis`, `nginx`.

### Bring the stack up

```bash
docker compose up -d                 # db + backend + frontend + redis + nginx
docker compose logs -f backend       # tail backend logs
# Nginx is the recommended entry point: http://localhost (port 80)
# Direct service URLs if bypassing nginx:
#   Frontend: http://localhost:3000
#   Backend:  http://localhost:8000  (docs at /docs)
```

On first run, seed the geography:

```bash
docker exec -it pba_backend bash -c "PYTHONPATH=/ python -m app.scripts.import_geojson"
docker exec -it pba_backend bash -c "PYTHONPATH=/ python -m app.scripts.import_circuitos"
```

### Frontend dev (without Docker for the frontend)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run lint         # eslint
npm run build        # production build
```

`BACKEND_URL` in `frontend/.env.local` must point at a reachable backend (default `http://localhost:8000`).

### Backend dev (without Docker)

```bash
cd backend
pip install -r requirements.txt
PYTHONPATH=. uvicorn main:app --reload
# Point DATABASE_URL to your local PostGIS instance (see backend/app/database.py).
```

### Tests

There is no test suite yet (the project is pre-demo). `npm test` / `pytest` will not find anything.

### Useful one-shots

```bash
# Generate the mock socioeconomic CSV from
python generate_socioeconomico_csv.py
# Restart backend after code changes (volumes are mounted):
docker compose restart backend
```

## Architecture

### High-level shape

```
┌─────────────────┐   /api/v1/*   ┌──────────────────┐
│ Next.js frontend│──────────────▶│ FastAPI backend  │
│ app/page.tsx    │  rewrites via │  routers/services│
│  + map (Leaflet)│  next.config  │  + CSV processors│
└─────────────────┘               └────────┬─────────┘
                                           │ asyncpg
                                  ┌────────▼─────────┐
                                  │ PostgreSQL+PostGIS│
                                  │  (star schema)   │
                                  └──────────────────┘
```

`docker-compose.yml` exposes nginx on port 80 as the entry point. Nginx routes `/api/*` straight to the backend (so uploads bypass the 10 MB Next.js body limit) and `/` to the Next.js dev server. The frontend rewrites in `next.config.mjs` forward `/api/*` to `BACKEND_URL` for direct access; both paths are in play — see the in-flight note about API-client dual strategy in `AVANCE.md`.

### Backend layout (`backend/app/`)

- `main.py` — FastAPI app, CORS, `Base.metadata.create_all` on startup, mounts the four routers under `/api/v1`.
- `models.py` — Five SQLAlchemy entities (see "Data model" below).
- `schemas.py` — Pydantic schemas including `FiltroCategorico` / `FiltroRango` (the generic filter union used by the dashboard).
- `database.py` — async engine + `get_db()` dependency (DATABASE_URL points to `db` inside Docker).
- `routers/`
  - `geografia.py` — CRUD + GeoJSON FeatureCollection endpoints (`/geografia`, `/geografia/municipios/geojson`, `/geografia/circuitos/geojson`, `/geografia/data`).
  - `archivos.py` — `POST /archivos` (multipart upload, kicks off `BackgroundTasks`), `GET /archivos`, `DELETE /archivos/{id}`.
  - `metricas.py` — `GET /metricas`, `POST /metricas/{id}/toggle`, `POST /metricas/{id}/data` (electoral), `POST /metricas/{id}/datos-genericos`, `GET /metricas/{id}/opciones`.
  - `procesadores.py` — CRUD + `POST /procesadores/verificar-encabezados` (header-based matching).
- `services/`
  - `geografia_service.py` — wraps PostGIS geometry (`wkb.loads`) into GeoJSON `FeatureCollection`s.
  - `archivo_service.py`, `upload_service.py` — upload flow; `upload_service.process_file` is a dispatcher that **always** delegates to `process_generic_csv`.
  - `metrica_service.py` — **the core of the dashboard.** Two query paths:
    - `get_electoral_metric_data`: applies same-metric filters (year/vote-type/range) to the rows, then intersects geography_id sets from any cross-metric filters (e.g. a PBG range applied to an electoral metric). Returns `{geografia_id, nombre, resultados[], ganador}` per geography.
    - `get_all_generic_data_for_metric`: straight value-list for non-electoral metrics.
    - `get_metric_opciones`: distinct values of `dimension_extra` (`agrupacion_nombre`, `año`, `votos_tipo`) used to populate the filter dropdowns.
- `services/processors/`
  - `generic_csv_processor.py` — **The actual CSV loader.** Renames columns via `Procesador.mapeo_columnas`, batches inserts (`BATCH_SIZE = 5000`), and is used for every upload through `upload_service`. Files: `electoral_csv_processor.py`, `socioeconomic_csv_processor.py`, `pbg_csv_processor.py` are kept but are effectively dead code (see "In-flight work" below).
  - `normalizaciones.py` — central registry of canonical-value homologations (e.g. `BLANCO`/`BLANCOS` → `EN BLANCO`); extend when a new variant appears.
- `scripts/`
  - `import_geojson.py` — reads `frontend/public/partidos.geojson` (mounted into the container at `/app/static/partidos.geojson`) and inserts `Dimension_Geografica` rows with PostGIS geometry. Reads `nam`/`fna` and `gna` properties.
  - `import_circuitos.py` — same for circuits; uses `SYNONYM_MAP` to align names like "Nueve de Julio" vs "9 de Julio" and links each circuit to its parent `Partido` via `parent_id`.

### Frontend layout (`frontend/`)

- `app/page.tsx` — **the entire dashboard.** Owns every piece of top-level state (selected metric, filters, selected municipio/circuito, secondary-metric data, ranges) and orchestrates the map + side cards. New state usually belongs here unless it's clearly local to a child.
- `components/`
  - `map-view-client.tsx` — `react-leaflet` wrapper; renders `LayersControl` with two `GeoJSON` layers (municipios base + circuitos overlay). Owns nothing — pure view of `useMapView`'s outputs. Uses `bubblingMouseEvents={false}` and `DomEvent.stopPropagation` to keep circuito clicks from deselecting the parent municipio.
  - `filter-bar.tsx` — primary + secondary metric selectors, and the two filter widgets (`ElectoralFilter`, `RangeFilter`). `RangeFilter` is data-driven: the base min/max/scale is computed once per metric from unfiltered data, and the user's selected window is stored in absolute values (so it doesn't snap back on filter changes). The `Escala (Log/Lineal)` toggle and `Limpiar` button live here.
  - `dashboard-charts.tsx` — only the BarChart of vote distribution for the selected municipio (was larger; reduced on 2026-08-08).
  - `party-legend.tsx` — overlay in the bottom-right of the map; shares the colour palette with the map itself.
  - `create-processor-modal.tsx` — opens when no `Procesador` matches a new file's headers; builds the column→role mapping (`geography_identifier` / `value_identifier` / passthrough) and the metric name. **Inconsistency to know about:** its `NIVELES_GEOGRAFICOS` includes `"Seccion"` and `"Municipio"` while the backend uses `"Partido"` / `"Circuito"`.
- `hooks/`
  - `use-map-view.ts` — owns GeoJSON fetching and styling functions (`getStyleMunicipio`, `styleCircuito`); signature is 6 positional parameters — `MapViewClient` must pass them in the same order (a previous bug came from a positional-arg mismatch).
  - `use-processors.ts` — fetch / create / header-match processors (uses `NEXT_PUBLIC_API_BASE_URL` direct; the rest of the app uses the Next rewrite — see in-flight note).
- `lib/`
  - `api.ts` — `fetch` wrappers; `API_BASE_URL` is built from `getBaseUrl()` which is `''` client-side (relies on Next rewrites) and absolute on the server. This dual strategy is currently inconsistent with `use-processors.ts`.
  - `types.ts` — the single source of truth for shared types (`ElectoralData`, `Metrica`, `AnyFiltro`, …). Keep types here rather than redefining in components.
  - `party-color.ts` — palette for known parties + deterministic hash → HSL for the rest, so the legend and map agree on colour.
  - `range-utils.ts` — `decideScale`, `toNormPosition`, `fromNormPosition`, `formatCompact` (es-AR compact number formatting). Reused by the range filter and the data-driven range discovery in `page.tsx`.

### Data model (star schema)

```
archivos  ──┐
            ├──▶ hechos_datos ◀──── metricas
procesadores┘            ▲
                         │
               dimension_geografica  (Partido → Circuito, parent_id)
```

- `hechos_datos` is **long/tidy**: one row per `(geografia, metrica, archivo, fecha_dato, valor, dimension_extra JSON)`.
- `dimension_extra` is the catch-all for fields that don't justify their own column (`agrupacion_nombre`, `año`, `votos_tipo`, `circuito_id`, …). Filter queries in `metrica_service._apply_filtros` index into it via `Hechos_Datos.dimension_extra[campo].as_string()`.
- `procesadores` defines the column → role mapping used by `generic_csv_processor`. Every upload flows through this table; there is no special-case path.

### Cross-metric filter semantics

When a metric's data is requested with filters that belong to *other* metrics (e.g. an electoral query that includes a PBG range filter), the backend resolves each cross-metric filter via `_geos_for_filter` and **intersects** the geography sets. The map then colours only those geographies; the rest stay in the default grey. Same-metric filters either restrict the rows (changing the winner) or restrict the geographies (party filter). See `metrica_service.get_electoral_metric_data` for the partition (`count_filters` / `party_filters` / `cross_filters`).

Electoral filters (partido/año/votos_tipo) are intentionally dropped before secondary generic metric queries in `page.tsx` (the `ELECTORAL_DIMENSIONS` set), so that crossing electoral with PBG/socioeconómico does not empty the secondary cards.

### GeoJSON shape returned by the API

`/geografia/municipios/geojson` and `/geografia/circuitos/geojson` return FeatureCollections whose `feature.properties` contain exactly `nombre`, `nivel`, `parent_id`. **There is no `departamen` field** (despite `import_circuitos.py` reading it from the source GeoJSON). `use-map-view.ts` matches circuits to their parent municipality by `parent_id`, with a normalized-name fallback for safety.

## In-flight work (2026-08-08)

These are not bugs, just things the next agent should know are mid-flight:

- **Demo stabilisation** (pre-Tuesday): clean up `print("--- DEPURANDO ---")` in `generic_csv_processor.py`, remove `console.log` debug statements from `use-map-view.ts` and `app/page.tsx`, and load the real 95 MB election CSV via the existing processor.
- **Range filter is data-driven**, but the cross-metric generalisation still has steps pending (see "Plan para generalizar el cruce a TODAS las métricas" in `AVANCE.md`): unify `_geos_for_filter` for both map and cards, add temporal filters, and add generic categorical filters for non-electoral metrics.
- **API-client dual strategy**: `lib/api.ts` uses Next rewrites (relative `''`), `hooks/use-processors.ts` uses `NEXT_PUBLIC_API_BASE_URL` direct. Unify before adding new endpoints.
- **Geographical-level terminology mismatch**: backend uses `Partido`/`Circuito`; `create-processor-modal.tsx` lists `["Circuito", "Seccion", "Partido", "Municipio"]`. "Municipio" and "Partido" are synonyms (one row each) — collapse them.
- **`/graficos` still ships mocked datasets** (`participationTrendData`, `defaultPartyComparisonData`, etc.); replace with real queries once the corresponding endpoints exist.
- **No tests, no CI, no auth yet.** The roadmap in `AVANCE.md` orders: auth (JWT, simple admin/viewer) → AWS free-tier deploy → GitHub Actions CI/CD → analytics features → external sources → IA microservice (long horizon).

## Useful pointers

- Adding a new CSV source? Define a `Procesador` via the modal (no code change needed) and, if it introduces new variants of known fields, add them to `services/processors/normalizaciones.py`.
- Adding a new metric type? Extend `TipoMetrica` (backend enum + frontend `TipoMetricaEnum`) and decide whether `metrica_service` needs a new query path (mirroring `get_electoral_metric_data`).
- Adding a new geo level? Update `NIVELES_GEOGRAFICOS` in `create-processor-modal.tsx`, add a matching importer under `backend/app/scripts/`, and decide whether the new level needs its own GeoJSON endpoint and a new `LayersControl.Overlay`.
- For 5MB+ uploads, go through nginx (port 80), not the Next.js proxy — the rewrites route buffers in memory with the configured `experimental.proxyClientMaxBodySize` (250 MB) and nginx has `client_max_body_size 300m`.
