# AVANCE — Estado del proyecto WALICHO

Documento vivo que unifica el estado actual, los bugs conocidos, las decisiones tomadas y las proyecciones de las próximas etapas. Reemplaza y consolida los siguientes archivos previos:

- `avance.md` (definición de visión, 7-nov-2025 y 11-nov-2025)
- `todo.md` (sesión del 13-nov-2025)
- `resumen.rm` (plan fundacional)
- `plan_de_accion.rm` (plan detallado por fases)

**Sesión de planificación actual (6 de agosto de 2026):** se reactiva el proyecto. Orientación consolidada: demo electoral martes → auth + deploy AWS + CI/CD → visualización analítica → fuentes externas → microservicio IA en horizonte largo.

**Sesión del 8 de agosto de 2026:** se elimina la ruta `/mapa-electoral` por duplicación con `/` (lógica replicada de mapa, hooks y handlers que generaba regresiones con cada fix). `DashboardCharts` se reduce a su BarChart dinámico de distribución de votos y se integra en `app/page.tsx`. La ruta `/` queda como única superficie del dashboard.

**Sesión del 8 de agosto de 2026 (tarde):** foco en **data pesada + filtros electorales + leyenda**.
- **Uploads grandes y procesado:** se agrega `nginx` como reverse proxy de entrada (`/api/*` → backend directo, `client_max_body_size 300m`; `nginx/nginx.conf`) para no pasar los 95 MB por el buffer/`10MB` de Next. Se detectó que `electoral_csv_processor.py` (y el socioeconómico/PBG) son **código muerto**: la carga real pasa SIEMPRE por `generic_csv_processor` (una métrica por `metric_name` del `Procesador`). Se creó `normalizaciones.py` (registro central de **homologaciones** por columna: `cargo_nombre`, `votos_tipo`; extensible para futuros archivos) y se agregó **batching** al `generic_csv_processor`. Carga del CSV completo (95 MB / ~944 mil filas) OK, aunque lenta → pendiente de optimización (ya anotado más abajo).
- **Filtros electorales (año + tipo + partido):** `FiltroCategorico` ahora lleva `dimension` (default `agrupacion_nombre`). Backend aplica filtros en la agregación (el ganador del mapa recalculado según año/tipo); `GET /metricas/{id}/opciones` devuelve partidos/años/tipos disponibles. Default de tipo = `POSITIVO` (votos válidos; corrige que el ganador sumaba nulos/en blanco). Los filtros electorales **no se aplican a métricas genéricas** secundarias (cruce con PBG sano).
- **Leyenda de partidos:** overlay de React (`components/party-legend.tsx`) con swatches + paleta determinística por hash en `lib/party-color.ts` (compartida con el mapa, evita que la elección completa de 21 partidos quede toda en gris).
- Aún pendiente de decisiones: semántica del color por partido (hoy = ganador; alternativa mapa de presencia/intensidad) y limpiar `experimental.proxyClientMaxBodySize` de `next.config.mjs` (quedó como fallback).

**Sesión del 8 de agosto de 2026 (última parte):** foco en **filtro de rango económico + cruce entre métricas**.
- **Filtro de rango económico reescrito** (PBG y futuras métricas económicas), ahora **data-driven**. Nuevo `lib/range-utils.ts` con `decideScale` (si `max/min ≥ 100` → escala **log**, si no **lineal**), `formatCompact` (es-AR), y mapeo posición↔valor. El `RangeFilter` usa la escala detectada, guarda la **ventana del usuario en valores absolutos** (no se resetea al filtrar), muestra `min/max` + rango elegido debajo del slider, más toggle de **Escala (Log/Lineal)** y botón **Limpiar**. `metricRanges` se calcula de la data **SIN filtrar** (una vez por métrica) para tener base fija.
- **Cruce entre métricas (intersección de geografías):** en `metrica_service.py`, el endpoint electoral separa los filtros por `metrica_id`. Los del propio métrico se aplican a los votos (año/tipo/partido); los de **otros métricos** (p.j. rango de PBG) van a `_geos_for_filter` y restringen los municipios del mapa a quienes cumplen en **su propia métrica** (el resto en gris). Ej: filtrar rango de PBG restringe el mapa electoral a los municipios en ese rango económico.
- **Plan para generalizar el cruce a TODAS las métricas (pendiente):**
  1. **Unificar el "geo set por filtro"** en una función compartida y usarla también al restringir las cards secundarias (misma lógica de cruce en todo).
  2. **Soportar filtros temporales** (`fecha_dato`) además de `valor`/`dimension_extra`.
  3. **Filtros categóricos genéricos** (UI + backend) para métricas no electorales (ya existe el campo `dimension`).
  4. **Jerarquía geográfica / roll-up** (circuito → partido) si alguna métrica es de otro nivel, para que el cruce siga válido.
- **Para probar en vivo:** el cruce PBG→mapa necesita reiniciar el backend (`docker compose restart backend`). Pendiente de valorar si los municipios excluidos se **atenúan** o **desaparecen** del mapa.

**Sesión del 9 de agosto de 2026:** foco en **demo stabilisation + UX/UI del dashboard**.
- **"Limpiar filtros" resetea sliders visuales:** el `RangeFilter` mantiene la ventana del usuario (`win`) en estado local, así que limpiar el array de filtros en el padre no reseteaba la posición visual del slider. Se agregó prop `resetSignal?: number` al `RangeFilter` y un contador `rangeResetSignal` en el `FilterBar` que se incrementa en cada "Limpiar filtros" → la `win` vuelve a `[min, max]` mientras que la elección de `scaleMode` se preserva (decisión de diseño: la escala es del usuario, no del reset).
- **Card "Reportar Municipio" eliminada:** no se usa y llevaba a `/graficos` con mocks. Se quitaron `handleReportClick`, `useRouter`, `Button`, y `FileText` del import; no quedan referencias huérfanas.
- **Card "Indicadores seleccionados" siempre visible cuando hay municipio:** antes se ocultaba si el filtro de rango vaciaba las secundarias (el usuario perdía el feedback de qué municipio tenía seleccionado). Ahora aparece siempre que hay `selectedMunicipio`, con texto guía amigable si no hay secundarias cargadas.
- **Layout de la columna derecha:** Resultados + Indicadores seleccionados pasan a un `grid grid-cols-2 gap-4` lado a lado (antes apilados). Las cards se compactan con tipografía de etiqueta (`text-sm uppercase tracking-wide`) y padding reducido (`pb-2 pt-4`) para que la densidad visual sea pareja.
- **Transición de color en el mapa:** cuando cambian los filtros, los municipios ya no "saltan" de color. `path.walicho-municipio` transiciona `fill` y `fill-opacity` en 250ms; la variante `--instant` (hover/selección) corta la transición para feedback inmediato. Costo: 4 líneas en `globals.css` + `className` en `getStyleMunicipio`.
- **Sparkline evaluada y retirada:** se implementó `GET /metricas/{id}/serie-historica/{geo_id}` en backend y un componente `Sparkline` en frontend que mostraba la tendencia 2017-2023 del partido más votado por municipio. Se decidió retirarla por **lectura ambigua**: la subida podía ser crecimiento del padrón electoral, no performance política, y el cliente la encontró ruidosa. El endpoint queda en backend por si lo queremos reutilizar para otra vista (tooltip del mapa, `/graficos`, export).
- **`generate_socioeconomico_realista.py`:** script que genera un CSV socioeconómico con 4 arquetipos (AMBA_POPULAR, INTERIOR_RICO, CIUDAD_GRANDE, INTERIOR_POBRE) y correlaciones internas para que los filtros socioeconómicos produzcan cambios visibles al cruzarse con el mapa electoral. Reemplaza al mock plano anterior.

**Sesión del 13 de agosto de 2026 — Etapa 3.1 (Autenticación) arrancada (~funcionando):**
- **Backend** (`backend/app/`): `security.py` (hashing bcrypt + PyJWT HS256; `SECRET_KEY`, `COOKIE_SECURE`, `ACCESS_TOKEN_EXPIRE_MINUTES` por env), `dependencies.py` (`get_current_user` / `require_admin`), tabla `usuarios` (`models.Usuario`, se crea sola en startup), `routers/auth.py` (`POST /auth/login` → cookie httpOnly JWT, `POST /auth/logout`, `GET /auth/me`, `POST /auth/register` solo admin), `scripts/create_admin.py`.
- **Rutas protegidas:** lecturas → `get_current_user`; escrituras (subir/borrar archivo, procesadores, toggle de métricas, crear geografía) → `require_admin`. **Nada queda público.**
- **Frontend** (`frontend/`): `proxy.ts` (Next 16 renombró `middleware.ts` → `proxy.ts`) valida el JWT con `node:crypto` y **redirige a `/login` sin sesión** (excluye `/api/*`, lo protege el backend); `app/login/page.tsx`, `components/auth-shell.tsx` (oculta sidebar en `/login`), `hooks/use-session.ts`, `login`/`getMe`/`logout` en `lib/api.ts`, `app-sidebar.tsx` con email/rol/logout y gating de admin para `viewer`. `use-processors.ts` suma `credentials:"include"`.
- **Infra:** `.env.example`, `database.py` lee `DATABASE_URL` por env, `docker-compose.yml` inyecta `SECRET_KEY`/`AUTH_SECRET` (fallback común), `requirements.txt` agrega `PyJWT` + `bcrypt`.
- **Nota / pendiente (a cargo del usuario):** `EmailStr` rechaza dominios `*.local`; se definió en `schemas.py` un tipo local `Email` (permite `.local`) pero aún no reemplaza `EmailStr` en `UsuarioCreate`/`Usuario`/`LoginRequest`. Usar dominio real para el admin (`admin@walicho.com`). Validación restante: flujo login → dashboard → logout completo.

---

## 📌 Resumen ejecutivo

WALICHO es un dashboard de análisis político sobre la PBA con mapa interactivo. **La base técnica está consolidada** (modelo estrella, PostGIS, sistema de procesadores dinámico), pero la integración con fuentes externas y la finalización de la UI son las próximas prioridades.

| Área                       | Estado actual                                                |
|----------------------------|--------------------------------------------------------------|
| Modelo de datos            | Estable, con buena extensibilidad                             |
| Ingesta CSV                | 4 tipos cubiertos (electoral, socioeconómico, PBG, genérico) |
| Mapa interactivo           | Funcional, con doble capa (municipios + circuitos)            |
| Filtros cruzados           | Categoría (partidos) + rango (PBG)                            |
| Reportes gráficos          | Parcial — `/graficos` tiene componentes dinámicos y mocks     |
| Ingesta de redes (Listen)  | Diseñado, no implementado                                    |
| API Meta Business          | Priorizado para próximas etapas                               |
| Bug crítico abierto        | `selectedMunicipio` undefined en cadena de props del mapa     |
| Próxima sesión             | Plan pre-demo martes (estabilidad + pulido)                   |
| Autenticación             | Etapa 3.1 implementada (~funcionando) — JWT + cookie httpOnly         |
| Orientación confirmada     | Auth → Deploy AWS → CI/CD → Visualización → Fuentes → IA      |

---

## 🧱 Arquitectura implementada

### Stack final

- **Frontend:** Next.js 16 + React 18 + TypeScript + Tailwind + Radix UI + Leaflet + Recharts
- **Backend:** FastAPI + SQLAlchemy async + asyncpg + GeoAlchemy2
- **DB:** PostgreSQL 16 + PostGIS 3.4
- **Infra:** Docker Compose (db, backend, redis)

### Servicios disponibles (rutas FastAPI)

| Método | Ruta                                                  | Descripción                                |
|--------|-------------------------------------------------------|--------------------------------------------|
| GET    | `/api/v1/geografia/municipios/geojson`                | Municipios como FeatureCollection          |
| GET    | `/api/v1/geografia/circuitos/geojson`                 | Circuitos como FeatureCollection           |
| GET    | `/api/v1/geografia`                                   | Lista plana de geografías                  |
| POST   | `/api/v1/geografia`                                   | Crear geografía                            |
| POST   | `/api/v1/geografia/data`                              | GeoJSON + métricas agregadas               |
| GET    | `/api/v1/archivos`                                    | Listar archivos cargados                   |
| POST   | `/api/v1/archivos`                                    | Subir archivo (multipart, background task) |
| DELETE | `/api/v1/archivos/{id}`                               | Borrar archivo                             |
| GET    | `/api/v1/metricas`                                    | Listar métricas                            |
| POST   | `/api/v1/metricas/{id}/toggle`                        | Activar/desactivar métrica                 |
| POST   | `/api/v1/metricas/{id}/data`                          | Datos electorales (con filtros)            |
| POST   | `/api/v1/metricas/{id}/datos-genericos`               | Datos genéricos (con filtros)              |
| GET    | `/api/v1/procesadores/`                               | Listar procesadores                        |
| POST   | `/api/v1/procesadores/`                               | Crear procesador                           |
| POST   | `/api/v1/procesadores/verificar-encabezados`          | Matchear encabezados contra procesadores   |

### Modelo de datos (5 entidades)

```
Archivo ─┐
         ├──▶ Hechos_Datos ◀─── Dimension_Geografica
Metricas ┘           ▲
                     │
                Procesador
```

- **`archivos`**: registro de cada archivo subido (nombre visible, original, fecha de carga, estado de procesamiento, log, filas procesadas/fallidas).
- **`dimension_geografica`**: jerarquía Partido → Circuito, con geometría PostGIS (MULTIPOLYGON, SRID 4326).
- **`metricas`**: definición de cada métrica (nombre clave, nombre amigable, tipo: ELECTORAL/DEMOGRAFICA/GEOGRAFICA/TEMPORAL/ECONOMICA, is_active, archivo origen).
- **`hechos_datos`**: tabla de hechos (long/tidy) con geografía + métrica + archivo + valor numérico + fecha + dimensión extra JSON.
- **`procesadores`**: mapeos configurables de columnas, nivel geográfico y nombre de métrica por formato de archivo.

---

## ✅ Funcionalidad operativa

- [x] **Carga de geografía base**: 135+ partidos de la PBA desde GeoJSON con normalización de nombres.
- [x] **Carga de circuitos electorales**: capa adicional con `parent_id` apuntando al municipio, normalización de nombres y diccionario de sinónimos para casos como "9 de Julio" vs "Nueve de Julio".
- [x] **Subida de archivos CSV**: pipeline async con estado (`PENDIENTE → PROCESANDO → COMPLETADO/FALLIDO`), log y conteo de filas.
- [x] **4 tipos de procesador**:
  - Genérico (mapeo libre, configurable por modal).
  - Electoral (formato "long" con votos por agrupación).
  - Socioeconómico (5 indicadores apilados en filas).
  - PBG (una métrica por partido).
- [x] **Mapa interactivo**: doble capa (municipios como base, circuitos como overlay activable), coloreado por partido ganador, popups con resultados, hover con highlight.
- [x] **Filtros dinámicos**:
  - Categóricos por `dimension` (configurable): partido (`agrupacion_nombre`), `año` y `votos_tipo` para métricas ELECTORAL (default tipo = `POSITIVO`).
  - Rango (slider para métricas ECONOMICA).
  - Endpoint `GET /metricas/{id}/opciones` para poblar los selectores.
  - Los filtros electorales NO se aplican a métricas genéricas secundarias (cruce con PBG/socio sano).
- [x] **Métrica principal + métricas secundarias**: la principal colorea el mapa, las secundarias aparecen en cards.
- [x] **Vista de reporte** (`/graficos`): cruce electoral + métrica genérica en `ComposedChart`.
- [x] **Auto-creación de procesador**: modal que detecta encabezados no matcheados y permite definir el mapeo.

---

## 🐛 Bugs y problemas conocidos

### 🔴 Crítico: `selectedMunicipio` undefined en cadena de props del mapa

**Origen:** Sesión del 13-nov-2025 (`todo.md`).
**Síntoma:** El estado `selectedMunicipio` se actualiza correctamente en `mapa-electoral/page.tsx`, pero llega como `undefined` a `MapView` → `MapViewClient` → `useMapView`. La interactividad condicional de circuitos (tooltip solo en municipio seleccionado) no funciona.
**Intentos de depuración ya realizados:**
- `console.log` en cada nivel de la cadena de props.
- Forzar re-renderizado con `key` prop.
- Pasar nueva referencia de objeto (`{ ...selectedMunicipio }`).
- Centralización de tipos en `lib/types.ts`.

**✅ Resuelto (7-ago-2026):** se revisó y completó la cadena completa de props del mapa (ver sección de sesión más abajo). El problema real era la desalineación de la firma de `useMapView` con su llamador `MapViewClient` y el burbujeo de eventos de Leaflet.

### 🟡 Acoplamiento en API client

`lib/api.ts` usa `API_BASE_URL` relativo (`''`) + rewrites de Next.js, mientras que `hooks/use-processors.ts` usa `NEXT_PUBLIC_API_BASE_URL` directo a `http://localhost:8000/api/v1`. Dos estrategias conviven — unificar.

### 🟡 Inconsistencia de niveles geográficos

- Backend: `"Partido"`, `"Circuito"` (español).
- Frontend (`create-processor-modal.tsx`): `["Circuito", "Seccion", "Partido", "Municipio"]` mezcla español e inglés y duplica conceptos (Partido y Municipio deberían ser sinónimos, no niveles distintos).

### 🟡 Datos mock en `/graficos`

Cuatro conjuntos de datos hardcodeados marcados como "Ejemplo" en gris:
- `participationTrendData`, `defaultPartyComparisonData`, `regionPerformanceData`, `demographicDetailData`, `hourlyVotingData`.
- `Regiones Activas: 24/32` y "+5.8%" también hardcodeados.
- Reemplazar por datos reales cuando existan las APIs correspondientes.

### 🟡 Falta de UI para gestión

- Rutas en sidebar sin página: `/filtros`, `/archivos`, `/metricas`, `/configuracion`.
- Solo existe UI de creación de procesador — falta listado/edición/borrado.
- Falta pantalla para ver archivos cargados con su estado y log de procesamiento.

### 🟢 Menores

- `graficos/page.tsx` consulta datos para todos los municipios en cada visita (no cachea ni pagina).
- ~~`mapa-electoral/page.tsx` tiene `selectedMetric` inicial hardcodeado en `1` ("Temporalmente en 1 para pruebas").~~ **Resuelto (8-ago-2026):** ruta `/mapa-electoral` eliminada por duplicación con `/`.
- Logs de depuración (`print("--- DEPURANDO INCOMPATIBILIDAD GEOGRÁFICA ---")`) dentro de `generic_csv_processor.py` — limpiar para producción.
- `useMapView`: tooltip de municipio usa `feature.properties.nombre`, pero el partido del circuito se matchea con `feature.properties.departamen` — depende de cómo vienen los GeoJSON de origen.
- `useMapView` aún conserva `console.log` de depuración en handlers de click (líneas 174 y 230).

---

## 🧵 Sesión 7 de agosto de 2026 — Selección de circuitos electorales (jerarquía Partido → Circuito)

**Objetivo:** al seleccionar un municipio, sus circuitos electorales debían volverse seleccionables **independientemente de si la métrica tiene datos para ellos**. Previo a esta sesión, cada intento de fix dejaba los circuitos invisibles o rompía la selección del municipio.

### Problemas de raíz encontrados y resueltos

1. **Firma de `useMapView` desalineada con su llamador.** Se amplió el hook a 7 parámetros (agregando `onCircuitoClick` y `selectedCircuito`), pero `MapViewClient` seguía invocándolo con 5. Al ser posicionales, `isCircuitosOverlayActive` quedaba `undefined` → `styleCircuito` devolvía opacidad 0 → **circuitos invisibles**. Se re-cablearon los 7 argumentos y las props nuevas.
2. **Matching circuito→municipio con campo inexistente.** El código usaba `feature.properties.departamen`, pero la API NO devuelve ese campo (solo `nombre`, `nivel`, `parent_id`). Se cambió a matchear por **`parent_id`** (el `id` del municipio padre, ya presente en el backend) con fallback por nombre normalizado (sin acentos/mayúsculas).
3. **El click sobre un circuito des-seleccionaba el municipio** (burbujeo de eventos de Leaflet hacia la capa de municipios de abajo). Se frenó con `DomEvent.stopPropagation(e.originalEvent)` en el handler y `bubblingMouseEvents={false}` en la capa.
4. **Sincronización frágil por el checkbox de circuitos.** La visibilidad/interactividad dependía de un estado espejo `isCircuitosOverlayActive` alimentado por los eventos `overlayadd`/`overlayremove` del `LayersControl`, lo que se desincronizaba de forma intermitente al tocar el checkbox. **Se eliminó** ese estado y el componente `MapEvents`: ahora el propio `LayersControl` de react-leaflet es la única fuente de verdad para mostrar/ocultar la capa.

### Cambios por archivo

- `frontend/hooks/use-map-view.ts`: firma ampliada, matching por `parent_id`, handlers de hover/click de circuitos (`selectedCircuito`), `stopPropagation`, y eliminación del estado `isCircuitosOverlayActive`. Quedan `console.log` de depuración (a limpiar).
- `frontend/components/map-view-client.tsx`: re-cableado de props al hook, `bubblingMouseEvents={false}`, y remoción de `MapEvents`. El `key` dinámico de la capa de circuitos se eliminó en la sesión del 8-ago-2026 porque forzaba el `checked` del `LayersControl` cada vez que cambiaba el municipio (la capa se "activaba sola" al hacer click).
- `frontend/app/mapa-electoral/page.tsx` y `frontend/app/page.tsx`: estado y handlers de `selectedCircuito`; se resetea el circuito al cambiar de municipio. **Nota (8-ago-2026):** `mapa-electoral` fue eliminada por duplicación con `/`.
- `frontend/components/dashboard-charts.tsx` y `frontend/app/page.tsx`: **card indicadora** del circuito seleccionado (muestra el nombre + municipio). **Nota (8-ago-2026):** `DashboardCharts` se redujo al BarChart dinámico de distribución de votos y se integró en `/`; la card indicadora del circuito vive ahora solo en `app/page.tsx`.

### Decisión de diseño (Opción B)

El **municipio queda como ancla de datos persistente**: al seleccionar un circuito no se des-selecciona el municipio ni se pierden sus métricas. El circuito se trata como **un nivel jerárquico inferior** (capa de contexto) que se resalta sobre su municipio. Por ahora solo se muestra el nombre del circuito; **a futuro**, cuando existan datos a nivel circuito, conectar el pipeline para que las métricas muestren el circuito con fallback al municipio.

### Pendientes propuestos

- Sacar los `console.log` de depuración de `page.tsx`, `mapa-electoral/page.tsx` y `use-map-view.ts`.
- (Opcional) Fly-to/zoom automático hacia el circuito seleccionado.
- Llevar el mismo patrón de card de circuito a `app/page.tsx` (ya hecho) y decidir si se replica el panel de datos a nivel circuito.

---

## 📜 Decisiones de diseño tomadas

### 7 de noviembre de 2025 — Visión de métricas

1. **Métrica principal:** un único `select box` en el dashboard; determina el coloreado del mapa.
2. **Métricas secundarias:** otro selector, se agregan como cards comparativas (no afectan color del mapa).
3. **Cards dinámicas:** cada métrica genera una card con diseño según su `tipo` (Electoral/Demográfica/Geográfica/Temporal).
4. **Interacción:** `click` y `hover` sobre el mapa actualizan las cards con datos del municipio.

### 11 de noviembre de 2025 — Procesadores dinámicos

- El sistema debe evolucionar deparsers hardcodeados a un **ABM de procesadores** con definición dinámica de columnas/variables/reglas de mapeo.
- Adaptar a nuevos formatos **sin tocar código fuente**.
- Si se eligen varias métricas del mismo tipo, deben consolidarse en una misma card en lugar de generar una card por métrica.

### 13 de noviembre de 2025 — Sesión de circuitos

- ~~Los circuitos solo muestran tooltip si pertenecen al municipio seleccionado (interactividad condicional).~~ **Superado por Opción B (7-ago-2026):** los circuitos son interactuables independientemente como capa de contexto; el municipio queda como ancla persistente.
- Se adopta el patrón **"Lifting State Up"**: el `page.tsx` dueño del estado, componentes hijos sin estado.
- Centralización de tipos en `frontend/lib/types.ts` para evitar divergencias.

### 8 de agosto de 2026 — Consolidación del dashboard

- Se elimina `/mapa-electoral` por duplicación con `/`. La lógica replicada obligaba a re-verificar cada fix en dos superficies.
- `DashboardCharts` se reduce a su BarChart dinámico y se integra en `app/page.tsx`. La card indicadora del circuito seleccionado, el botón "Reportar Municipio" y el fallback `metrica_2 = "2"` que vivían duplicados en `DashboardCharts` se consolidan en `app/page.tsx`.
- Bug del `LayersControl` ("la capa de circuitos se activa sola al clickear un municipio") se corrige eliminando el `key` dinámico y el `checked` hardcodeado en `map-view-client.tsx`. El `styleCircuito` reactivo del hook se encarga del re-styling.

---

## 🗺️ Roadmap por etapas

### ✅ Etapa 1 — Cimientos (completada)

- Definición de estrategia y objetivos.
- Stack tecnológico decidido.
- Modelo de datos estrella implementado.
- Sistema de procesadores dinámico.
- Ingesta de geografía y circuitos electorales.
- Carga de CSVs electorales/socioeconómicos/PBG.
- Mapa interactivo base con doble capa.
- Filtros cruzados categóricos + rango.
- Métrica principal + secundarias con cards.

### 🔄 Etapa 2 — Estabilidad pre-demo (próxima sesión, lunes previo al martes)

**Objetivo:** demo end-to-end del flujo electoral el martes + Kick Off del proyecto (que se reactiva formalmente).

#### Día 1 — Estabilidad

1. **Resolver bug crítico de `selectedMunicipio`** (caminos en orden: A → B → C).
   - A: eliminar `map-view.tsx` intermedio, montar `MapViewClient` directo desde `page.tsx`.
   - B: revisar `next.config.mjs` y `<SidebarProvider>` por interferencia con client components.
   - C: ejemplo mínimo reproducible aislado.
2. **Cargar datasets reales** para que la demo se vea con datos:
   - `resultados-electorales-diputados-2017_2023.csv` (95MB) vía procesador electoral existente.
   - `pbg_homologado.csv` y `pbg_por_partido_2023.csv` vía procesador PBG.
   - `indicador_socioeconomico_municipios.csv` (es mock — queda cargado pero marcado).
   - **Decisión en caliente:** si los 95MB tardan demasiado, generar subset acotado (ej: solo 2023).
3. **Limpiar hacks visibles en demo:**
   - `selectedMetric = 1` hardcodeado en `mapa-electoral/page.tsx` → null + flujo limpio.
   - `metrica_2 = 2` fallback en `graficos/page.tsx` → usar la métrica secundaria realmente seleccionada.
   - Quitar `print("--- DEPURANDO ---")` de `generic_csv_processor.py`.

#### Día 2 — Pulido visual

4. **Mocks de `/graficos`:** quitar gris/molesto "Ejemplo" de los datos hardcodeados, asegurar cruce electoral + socioeconómico funcione con datos reales.
5. **Mejoras puntuales de interacción:**
   - Tooltip del mapa con valor de la métrica principal (no solo el nombre).
   - Municipio seleccionado más visible (borde + color destacado).
   - Loading states con nombre de la métrica que se está cargando.
   - Toast de carga con link al log de procesamiento.

**Backlog si sobra tiempo:** unificar cliente API (rewrites vs. directo).

### 🛡️ Etapa 3 — Operación y producto (lo que sigue después de la demo)

**Motivación:** pasar de un prototipo local a una plataforma con identidad propia, accesible por el cliente y por nosotros, desplegada en cloud, con despliegues continuos para mostrar mejoras instantáneas.

#### 3.1 — Autenticación

- **JWT propio** (sin dependencia externa): email + password hasheado, login/logout, middleware de FastAPI.
- Roles simples: `admin` y `viewer` (alcanza para el caso actual: yo + mi cliente).
- Tabla nueva `usuarios` + endpoint `POST /api/v1/auth/login`, `POST /api/v1/auth/register`.
- Guard en rutas protegidas del backend y guard de páginas en frontend (redirect a `/login` si no hay token).
- **No en esta etapa:** login social (Google), recuperación de password, MFA. Para más adelante.

#### 3.2 — Deploy en AWS (free tier)

- Instancia EC2 (t2.micro o t3.micro dentro del free tier) corriendo Docker.
- RDS PostgreSQL+PostGIS free tier para no administrar la DB dentro del EC2 (más resiliente).
- Subdominio propio (Cloudflare free o Route 53 — a evaluar) — **no es prioridad**, podemos usar la IP pública o un dominio temporal.
- Variables de entorno gestionadas con `.env` o AWS Secrets Manager (básico al principio).
- **Objetivo de aprendizaje:** entender el ciclo deploy en AWS antes de automatizarlo.

#### 3.3 — CI/CD con GitHub Actions

- Pipeline en cada push a `main`:
  1. Backend: instalar deps, levantar DB de tests, correr tests.
  2. Frontend: `npm run build` + `npm run lint` + tests si existen.
  3. Si todo pasa: build de imágenes Docker, push a ECR, deploy al EC2.
- **Motivación:** poder mostrarle mejoras al cliente de forma continua e instantánea sin deploys manuales.
- **Decisión:** GitHub Actions (no AWS CodePipeline) porque queremos aprender una herramienta portable.

##### 3.3.1 — Checklist: preparar Docker para producción (pendiente, antes del deploy)

> Nota de la sesión del 8 de agosto de 2026: el `docker-compose.yml` actual (con el `frontend` ya agregado) está pensado para **desarrollo local** (volúmenes montados + `next dev`). No está listo para cloud tal cual. Checklist de lo que hay que ajustar antes de deployar a AWS:

- **Frontend — Dockerfile multi-stage:** `npm ci` → `next build` → `next start` (imagen final liviana). Hoy corre `next dev`.
- **Backend — Dockerfile de producción:** uvicorn/gunicorn con `--workers N`; hoy corre `uvicorn main:app` sin workers y con volumen montado.
- **Quitar volúmenes de código** (`./backend/app:/app`, `./frontend:/app`, `- /app/node_modules`) en producción: en cloud no hay directorio del host que montar.
- **Secretos/credenciales externalizados:** hoy Postgres usa `root`/`root` hardcodeados. Pasar a variables de entorno / `.env` / AWS Secrets Manager; evaluar RDS PostgreSQL+PostGIS en vez de la DB dentro del EC2.
- **`container_name` fijos** (`pba_db`, `pba_backend`, `pba_frontend`, `pba_cache`): revisar porque chocan al escalar o en orquestadores; evaluar `profiles` para separar dev de prod.
- **Proxy reverso + TLS:** agregar Nginx (o similar) para HTTPS y enrutar `/` → frontend y `/api` → backend, y que así `BACKEND_URL` en producción sea relativo/seguro.
- **Persistencia de la DB:** hoy volumen local `postgres_data`; definir estrategia de disco gestionado y backups para el deploy real.
- **Documentar el deploy AWS:** alcance depende del destino; este checklist aplica a un **VPS / EC2 con Docker Compose**. Para servicios tipo (o K8s) la estrategia cambia.
- **Recordatorio general:** el frontend usa rewrites de Next (`/api/*` → `BACKEND_URL`); en producción configurar `BACKEND_URL` correctamente (ver `next.config.mjs`).

#### 3.4 — Roles + auditoría + monitoreo

- Tabla `audit_log`: registro de quién subió qué archivo, cuándo, con qué resultado, desde qué IP.
- Tabla `usuarios` extiende con `last_login`, `created_by` (admin que dio de alta).
- Dashboard básico de estado: scrapers activos, errores recientes, últimas cargas (puede ser tan simple como una página `/admin/health`).

**No incluido todavía:** salida a clientes externos — la plataforma sigue siendo interna de WALICHO.

### 📊 Etapa 4 — Visualización analítica (1-3 meses)

Capacidades prioritarias confirmadas:

- **Cards dinámicas según `TipoMetrica`**: hoy cada secundaria es genérica (un número). Meta: para ELECTORAL mostrar tabla de partidos; para DEMOGRAFICA valor + contexto; para ECONOMICA valor + unidad.
- **Series temporales**: comparativa entre múltiples elecciones (2017, 2019, 2021, 2023) con filtro por año, sobre el mismo municipio o región.
- **Cruces analíticos (correlaciones)**: scatter plots y heatmaps que correlacionen variables (ej: PBG vs. % de votos de un partido).
- **Tooltip enriquecido en el mapa**: al hover sobre un municipio, mostrar valor de la métrica principal + secundarias, no solo el nombre.
- **Exportar reporte a PDF/PNG**.

### 🔌 Etapa 5 — Fuentes externas (3-6 meses)

Orden de incorporación acordado:

1. **API Meta Business (Facebook/Instagram)** — primera por la disponibilidad y porque los datos están georeferenciables con la API.
2. **Pauta oficial** — carga CSV/JSON como módulo (más simple, sin scraping).
3. **Listen (scraping de medios digitales)** — scrapers en Python con taxonomía de temas (Seguridad, Salud, Educación) y georeferenciación por mención o sección electoral.
4. **Brandwatch / social listening pago** — pendiente confirmar licenciamiento.

Consideraciones generales:

- Cada nueva fuente debe integrarse como **procesador** del modelo actual (mismo ABM, sin código especial por fuente).
- Georeferenciar de forma explícita: si el post no tiene geo, asignar por heurística (sección electoral del usuario, aglomerado EPH, etc.).
- Scrapers requieren mantenimiento continuo (las webs cambian estructura).

### 🧠 Horizonte largo — Microservicio de IA (6+ meses, cuando la base esté estable)

**Idea central:** un servicio independiente que aporte inteligencia sobre los datos. Dos grandes funciones:

1. **Prep automático de archivos** — dado un CSV/JSON/Excel desconocido, que el agente pueda:
   - Detectar el esquema (columnas geográficas, métricas, dimensiones).
   - Sugerir un mapeo para el sistema de Procesadores (alimentar el ABM existente).
   - Validar tipos y proponer normalización de nombres geográficos.
   - Esto reemplazaría el flujo actual donde un humano identifica columnas a ojo.

2. **Chat interactivo dentro de la plataforma** — el usuario puede preguntar en lenguaje natural sobre los datos cargados:
   - "¿Qué municipio de la tercera sección tuvo mayor crecimiento del PBG entre 2020 y 2023?"
   - "¿En qué partidos ganó el mismo partido las últimas tres elecciones?"
   - El agente genera SQL contra el modelo estrella + devuelve respuesta + cita de fuentes.
   - **Valor para el cliente:** extraer conclusiones a partir del cruce de datos sin tener que armar reportes manualmente.

3. **Análisis de patrones en el sector de reportes** (el "diferencial"):
   - Identificar correlaciones no obvias entre métricas (ej: PBG × participación × resultado electoral).
   - Sugerir cruces que el humano no había pensado.
   - Detectar outliers y anomalías.
   - **Nota:** esto es lo más ambicioso y depende de tener volumen de datos + features estables. Es el último eslabón.

**Decisión de implementación (a evaluar cuando llegue el momento):**

- Microservicio separado (su propio Docker, su repo o monorepo) — para no acoplar el backend principal.
- LLM: Claude API (Anthropic) o similar, evaluando costos.
- Vector store solo si hace falta RAG sobre documentos de análisis pasados.
- Endpoint inicial: `POST /ia/sugerir-mapeo` (prep) + `POST /ia/chat` (consulta).
- Frontend: un panel de chat lateral en el dashboard.

**Por qué queda para más adelante:** requiere que la base de datos esté consolidada, que el sistema de auth/roles esté maduro, y que haya suficiente variedad de datos cargados como para que el agente tenga con qué trabajar. Empezar antes sería construir sobre arena.

---

## 🔌 Integraciones pendientes

| Fuente                | Tipo                | Estado        | Notas                                                  |
|-----------------------|---------------------|---------------|--------------------------------------------------------|
| Resultados oficiales  | CSV                 | ✅ Listo      | Formato 2017-2023 ya implementado                       |
| Socioeconómico INDEC  | CSV                 | ✅ Listo      | PBG + pobreza EPH (EPH requiere parseo por aglomerado)|
| Listen (medios)       | Scraping            | 🔮 Etapa 4 #3 | Definir taxonomía de temas antes de implementar        |
| Meta Business Suite   | API                 | 🔮 Etapa 4 #1 | Priorizado para integración temprana                    |
| Brandwatch            | API                 | 🔮 Etapa 4 #4 | Pendiente confirmar licenciamiento                      |
| Pauta oficial         | API / CSV / JSON    | 🔮 Etapa 4 #2 | Módulo de carga simple, sin scraping                      |
| Looker Studio         | ¿reutilizar?        | ❓ Evaluando  | Pregunta abierta del plan original                      |

---

## 📦 Datasets disponibles en `data/`

| Archivo                                              | Tamaño  | Observaciones                                                |
|------------------------------------------------------|---------|--------------------------------------------------------------|
| `resultados-electorales-diputados-2017_2023.csv`      | 95 MB   | Datos electorales oficiales 2017-2023, nivel municipio        |
| `indicador_socioeconomico_municipios.csv`            | 7 KB    | 5 indicadores por municipio (mock generado)                   |
| `pbg-base-2004-serie-31122004-31122023.csv`           | 33 KB   | PBG por partido 2004-2023                                     |
| `pbg_homologado.csv`                                 | 3 KB    | PBG 2023 reducido/limpio                                      |
| `pbg_por_partido_2023.csv`                           | 3 KB    | PBG 2023                                                      |
| `poblacion-con-ingresos-por-debajo-linea-pobreza-eph-continua.csv` | 11 KB | EPH continua (por aglomerado, no por partido PBA directo) |
| `propuesta.docx`                                     | 8 KB    | Propuesta original del proyecto                               |

---

## 🎯 Recomendaciones para próximas iteraciones (sesión 9-ago-2026)

Ordenadas por **impacto en demo / costo de implementación**. Las primeras son cosas que podrían hacerse en una sesión corta antes de la próxima demo; las últimas son apuestas más grandes.

### Tier 1 — Bajo costo, alto impacto visual (1 sesión cada una)

1. **Tooltip enriquecido en hover del mapa.** Hoy el tooltip muestra solo el nombre del municipio. Agregar el valor de la métrica principal + las secundarias cargadas, en formato corto (`CAMBIEMOS 42.3% · PBG $1.2M`). El backend ya devuelve todo, solo hay que engancharse al `mouseover` de react-leaflet y leer del cache `secondaryMetricsData` que ya vive en `page.tsx`. **Costo real: ~30 líneas.**

2. **Hover preview en métricas secundarias.** Al hover sobre un item de "Indicadores seleccionados", mostrar tooltip con el percentil/ranking del municipio en la provincia (top 20%, mediana, etc.). Requiere una query agregada nueva en backend pero es barata: `SELECT geografia_id, valor, percent_rank() OVER (ORDER BY valor) FROM hechos_datos WHERE metrica_id = ?`. **Costo: 1 endpoint + 1 componente.**

3. **Mapa coroplético alternativo (intensidad de presencia).** Hoy el mapa se colorea por **ganador**. Una segunda capa seleccionable "Intensidad por partido" podría teñir municipios con un gradient según el % de ese partido (no solo el ganador). El backend ya devuelve `resultados[].votos` por municipio; alcanza con cambiar el `style` para leer un partido específico del selector. **Costo: 30 líneas en el hook + 1 selector.**

4. **Atenuar vs. esconder los municipios excluidos por cruce.** Hoy cuando filtrás por PBG, los municipios fuera del rango quedan **grises**. Decidir si se quedan visibles atenuados (mejor narrativa: "estos quedaron fuera") o desaparecen (más limpio). Es solo un toggle en `getStyleMunicipio`. **Costo: 1 línea + decisión.**

### Tier 2 — Mejoras estructurales (medio plazo)

5. **Resolver la inconsistencia API client dual.** `lib/api.ts` usa rewrites de Next; `hooks/use-processors.ts` usa `NEXT_PUBLIC_API_BASE_URL` directo. Antes de agregar más endpoints, unificar en rewrites (más portable a deploys). **Costo: 1 archivo.**

6. **Collapsar la inconsistencia de niveles geográficos.** Backend usa `Partido`/`Circuito`; el modal frontend incluye `"Seccion"` y `"Municipio"` (sinónimos/partidos rotos). Homologar a `Partido`/`Circuito` en el modal y agregar una migración si hay datos viejos. **Costo: 1 línea + decisión.**

7. **Cachear `metricRanges` en backend.** Hoy se fetchean los rangos por métrica con un query sin filtros cada vez que se selecciona. Calcular una sola vez al subir el archivo y guardarlos en `metricas` (columnas `valor_min`, `valor_max`, `escala_sugerida`). **Costo: 1 migración + actualizar `upload_service`.**

8. **Filtros categóricos genéricos para métricas no electorales.** El backend ya tiene el campo `dimension` en `FiltroCategorico`; falta el UI para mostrar el selector cuando la métrica no es electoral (ej: filtrar socioeconómico por región, por sector PBG). **Costo: ~1 sesión.**

9. **Tooltip inteligente con insights.** Cuando el usuario aplica un filtro, mostrar un mini resumen: "5 municipios cumplen este criterio (top 5: La Matanza, La Plata, Mar del Plata, Bahía Blanca, Pilar)". Calculable en backend en el mismo query. **Costo: 1 endpoint nuevo.**

### Tier 3 — Diferenciadores (cuando el producto esté estable)

10. **Cruces pre-armados ("Recetas de demo").** Botones rápidos en la barra de filtros: "Pobreza × Resultado", "PBG Industrial × Votos", etc. Cada receta aplica 2-3 filtros preconfigurados para demos guiadas sin que el usuario tenga que descubrir las correlaciones. **Costo: tabla nueva `recetas` + UI simple.**

11. **Hover tooltip histórico con selector de año.** Tomar el endpoint `/serie-historica/{geo_id}` (ya implementado, quedó disponible) y mostrar un mini comparativo 2017/2019/2021/2023 en el tooltip del municipio, **mostrando el % (no los absolutos)** para corregir el problema de interpretación que tenía la sparkline. **Costo: 1 componente + usar el endpoint.**

12. **Vista `/graficos` conectada a datos reales.** Hoy tiene 4 datasets mock. Reemplazar con queries al backend: tendencia de participación por sección, ranking de municipios por métrica, scatter PBG×resultado. **Costo: ~2-3 sesiones, alto impacto para "esto es un producto, no un prototipo".**

13. **Comparador entre municipios.** Selección múltiple + vista side-by-side de N municipios en una tabla. Útil para responder "¿cómo se compara La Matanza con sus vecinos del conurbano sur?". **Costo: 2 sesiones.**

14. **Exportar vista actual a PNG/PDF.** `html2canvas` + endpoint que genere un PDF con el mapa + cards. Para el cliente es WOW factor en una demo. **Costo: 1 sesión.**

### Decisiones pendientes (no técnicas, hay que conversarlas)

- **Semántica del color del mapa.** ¿Ganador (hoy), % de votos del ganador, intensidad de presencia del partido seleccionado, o un heatmap del cruce con la secundaria activa? Cada opción cuenta una historia distinta.
- **Atenuar vs. esconder municipios excluidos** (item #4).
- **¿Vale la pena mantener `/graficos` como ruta aparte?** O se consolida como un modal/fullscreen dentro de `/`. La ruta aparte está subutilizada y seMocks carga trabajo.

### Lo que NO recomiendo hacer pronto

- **Microservicio de IA** (Etapa 5 del roadmap): tentador pero prematura. Sin auth, sin deploy, sin variedad de datos, el agente no tiene con qué aportar. Construir sobre arena.
- **Auth + AWS + CI/CD** en simultáneo: cada uno es un mini-proyecto. Hacer uno, validarlo, después el siguiente.
- **Optimizar el `generic_csv_processor`** mientras siga entrando por background task y el cliente esté conforme. La carga de 95 MB ya funciona; la mejora de velocidad es nice-to-have, no diferenciador.

---

## 🧪 Visualizador de cruzamientos — propuesta para validación con cliente (sesión 9-ago-2026)

**Estado:** Diseñado, no implementado. **Decisión:** esperar feedback del cliente antes de construir.

### Contexto

Hoy el cruce entre métricas funciona de forma **binaria por filtro**: elegís primaria (colorea el mapa) + rango de secundaria (atenúa municipios). Sirve para responder "¿qué pasa si filtro X?" pero **no revela correlaciones**. La visualización de cruce explícita es lo que falta para que el dashboard pase de "herramienta de filtrado" a "herramienta de descubrimiento".

### Endpoint base (común a todas las opciones)

`POST /api/v1/metricas/cruzar` recibe `(metrica_principal_id, metrica_secundaria_id, filtros)` y devuelve:

```json
{
  "puntos": [{"geografia_id": 1, "geografia_nombre": "La Matanza", "x": 145000.0, "y": 47.3, "partido": "UNIDAD CIUDADANA"}, ...],
  "correlacion_pearson": -0.34,
  "metrica_x": {"nombre": "PBG per cápita", "min": ..., "max": ...},
  "metrica_y": {"nombre": "% Diputado ganador", "min": ..., "max": ...}
}
```

Un punto por municipio con datos en ambas métricas. Pearson calculado sobre el set completo (o sobre el subconjunto filtrado, según variante). Costo backend: ~80 líneas, sin tocar modelo de datos.

### Opciones de visualización para elegir con el cliente

Cada opción es **independiente** (se puede combinar más de una si el cliente quiere). Costo indicado en sesiones.

#### Opción A — Scatter plot básico embebido (mínima viable)

Sección abajo del grid 2-cols existente en `app/page.tsx`. Solo aparece cuando hay primaria electoral + secundaria numérica activa. Scatter: X = secundaria, Y = % del partido ganador, color del punto = partido ganador. Pearson numérico al costado.

- **Pros:** el más rápido de implementar. Demuestra el cruce sin agregar navegación.
- **Contras:** no conecta con el mapa (no hay hover bidireccional). Lectura local.
- **Costo:** ~1 sesión. Backend + componente scatter.
- **Para el cliente:** "¿Querés ver la relación entre dos métricas en un solo gráfico?"

#### Opción B — Scatter + hover bidireccional con el mapa (recomendada)

Todo lo de A, **más**: hover sobre un punto del scatter → highlight del municipio en el mapa y viceversa. Hover sobre un municipio del mapa → highlight del punto en el scatter.

- **Pros:** cuenta la historia completa ("este municipio está acá en el cruce, acá en el ranking, y pintado así en el mapa"). Es el "ah, mirá esto" de una demo.
- **Contras:** el cableado del hover state compartido entre Leaflet y React es la parte más fina (puede haber races). Si se complica, se degrada a hover local sin propagar.
- **Costo:** ~1.5 sesiones. Backend + scatter + integración con mapa.
- **Para el cliente:** "¿Querés poder tocar un punto del cruce y ver el municipio iluminado en el mapa al mismo tiempo?"

#### Opción C — A + top 10 ranking (top del cruce)

A, **más** un panel "Top 10 del cruce": ranking de municipios por una métrica compuesta (default: % del partido ganador, secundaria como filtro implícito). Reordenable.

- **Pros:** el cliente siempre tiene un "qué mirar primero". Útil cuando el cruce tiene muchos puntos.
- **Contras:** agrega una decisión de diseño sobre qué es la "métrica compuesta" (% simple, score normalizado, ratio contra mediana?). No es trivial.
- **Costo:** ~2 sesiones. Backend + scatter + top 10.
- **Para el cliente:** "¿Querés que te diga qué municipios son los más interesantes de este cruce sin que tengas que adivinar?"

#### Opción D — Modal fullscreen / ruta `/cruzamientos` (experiencia completa)

Todo lo de B + C, pero en una vista aparte (modal fullscreen o ruta dedicada). Los selects de primaria/secundaria arriba, las tres ventanas abajo: scatter, top 10, y un mini-mapa que muestra solo los municipios del cruce (no el mapa completo).

- **Pros:** experiencia de "análisis activo". El cliente juega con los selects y ve cómo se reconfiguran las tres ventanas en tiempo real. Diferenciador claro contra cualquier competidor.
- **Contras:** es la más cara. Reestructura la página o agrega navegación. Tiempo total ~3 sesiones.
- **Costo:** ~3 sesiones. Backend + todo lo anterior + modal/ruta + integración.
- **Para el cliente:** "¿Querés una vista aparte dedicada al análisis, o alcanza con una sección abajo del dashboard actual?"

### Mi recomendación

**Empezar con la B** (scatter + hover bidireccional). Es el sweet spot de impacto/costo para una demo, y deja el terreno preparado para agregar C y D después sin reescribir.

Si el cliente pide "wow" antes que profundidad: **D completa** (vale la pena el costo extra).

Si el cliente es conservador o quiere ver resultados rápido: **A**, y en la sesión siguiente upgradeamos a B.

### Limitaciones a comunicar honestamente

- **Rendimiento:** el cruce con municipios (135 puntos) anda bien. Con circuitos (~7000 puntos) puede pasar de 200ms a 1-2s sin caché; queda en backlog.
- **Pearson sobre datos filtrados** puede ser engañoso si el filtro deja menos de 10 puntos. Hay que mostrarlo con un disclaimer o un mínimo.
- **El scatter no es un scatter temporal:** no muestra evolución por año. Si el cliente pide eso, es otro endpoint (usar el de `/serie-historica` que ya quedó implementado).

---

## 📝 Notas para retomar trabajo

- **Levantar el backend con Docker** es el primer paso; los scripts de geografía (`import_geojson`, `import_circuitos`) están documentados en `readme.md`.
- **Frontend usa rewrites de Next** (`/api/*` → `http://localhost:8000/api/*`). Si se deploya, configurar `BACKEND_URL`.
- **Modelos de procesador**: crear uno nuevo es trivial desde el modal de carga, lo que es la base del enfoque "adaptar a formatos sin código".
- **`dimension_extra`** es el comodín para metadata que no justifica una columna propia (año, tipo de voto, fuente, etc.).