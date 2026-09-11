# Feeds — tres pilares de inteligencia

Semia no agrega tres apps aparte: los feeds **generan señales** que se materializan como **métricas** y se consumen en el **mapa** y el **análisis tabular**, igual que un CSV.

```
Feed (Social / Web / IA / EPH)  →  agregación + revisión  →  métrica en catálogo  →  mapa / análisis
```

**Estado actual:**
- **EPH / socioeconómico:** primer conector **real** (operativo) — [Feed_Socioeconomico.md](./Feed_Socioeconomico.md).
- **Web / medios:** **PoC fase 1** (RSS → titulares → bolsón de tags → `/feeds/web`). Sin métrica al mapa todavía.
- **Social / IA:** mock / horizonte.
- **UI Feed APIs** (`/feeds/apis`): hoy centrada en EPH → hay que **simplificar a hub de conectores** (EPH es una card/tab, no toda la pantalla).

Dirección de producto: [`AVANCE.md`](./AVANCE.md) § *Dirección producto — reunión cliente*.

Configuración de conectores converge en **Feed APIs** + hub **Configuración** ([CONFIG.md](./CONFIG.md)).

---

## 1. Feed social

**Qué es:** menciones y conversación en redes (X, Meta) ancladas a partido, tema y municipio.

**Salida hacia Semia (ejemplos):**
- Menciones semanales por partido / municipio
- Volumen de conversación (proxy de visibilidad)
- Sentimiento neto (si se agrega NLP)

**UI mock:** timeline de posts + panel “Métricas generadas”.

---

## 2. Feed web

**Qué es:** titulares y notas de portales vía **RSS** (fase 1 del PoC).

### Fase 1 (implementada) — recolección, tags y curación

Alcance cerrado a propósito:

1. Fuentes en tabla **`feed_sources`** (CRUD en Configuración → Web).
2. Fetch manual **«Actualizar ahora»**: la UI orquesta `POST /api/v1/feeds/web/fetch/{source_id}` por cada fuente activa (timeout HTTP ~12s) y al final `POST …/fetch/purge`. Así se evita el 504 de nginx del batch único. Queda `POST /fetch` como batch (cron/debug; puede timeout detrás del proxy).
3. Ítems en **`feed_web_items`**; retención según `feeds.web.retention_days`.
4. Diccionario catalogador en tabla **`feed_web_dict_entries`** (texto, alias, tipo, activa) — **no** en `workspace_config`. Seed inicial + CRUD en **`/feeds/web`**.
5. Etiquetado por match de diccionario → bolsón en `feed_web_tags` + vínculo ítem–tag. Sin LLM (por ahora). Medios locales pueden tener **`feed_sources.municipio_default`**: todo titular de esa fuente recibe ese tag municipio automáticamente.
6. Curación en **`/feeds/web`**: eliminar titulares irrelevantes; editar tags a mano; «Reaplicar diccionario» por ítem.
7. Filtros por portal y por **tags ya descubiertos**; resumen (conteo, fuentes activas, última actualización, top tags).
8. Políticas en `workspace_config.document.feeds.web` (`fetch_interval_min`, `retention_days`, `classify_territorial`, `import_untagged`) — live paths en el hub. Fuentes y políticas siguen en Config; el diccionario vive en Feed web. Con `import_untagged=false` (default), el fetch omite titulares sin match de diccionario.

**Medios locales:** relevamiento en `data/medios_municipios_buenos_aires_rss.xlsx`; probe en `data/medios_rss_probe.json` (~40 RSS OK de ~129). Seed vía `POST /feeds/web/sources/seed-locals` (archivo `backend/static/reference/feed_web_local_sources.json`).


**Modelo de sentido = bolsón de tags**, no una sola dimensión fija. Un titular puede llevar varios tags; los filtros de la UI solo ofrecen etiquetas que ya aparecieron en el corpus.

**Qué queda fuera (fase 2+):** cron de producción; scraping HTML / Google News; **IA para etiquetar**; soft-delete / bloqueo de reingesta tras borrar; métrica custom por un solo tema (UI); sentimiento / peso por medio.

**Agenda «Qué se está diciendo» (publish):** `POST /feeds/web/publish-agenda` agrega pares tema×municipio en una ventana (conteo o peso por recencia), resuelve tags municipio → `dimension_geografica` (Partido) y **actualiza** métricas tipo **`PRENSA`** con `nombre_clave` estable (`prensa_salud`, …). Defaults de vista: **hotspots on / cruce off** (configurable en `/metricas`). Republicar **reemplaza** `hechos_datos` de esas claves; no crea métricas duplicadas ni pisa `is_active` ni preferencias de vista ya guardadas. Activar en `/metricas` para verlas como secundaria: puntos pulsantes en el mapa; el scatter solo si se activa «Cruce».

**API (prefijo `/api/v1/feeds/web`):** sources CRUD, `POST /fetch/{source_id}`, `POST /fetch/purge`, `POST /fetch` (batch), `POST /publish-agenda`, items (`GET` / `DELETE` / `PUT …/tags` / `POST …/retags`), dictionary CRUD, `GET /tags`, `GET /summary`.

**Salida hacia Semia (ejemplos):**
- Métricas `prensa_<tema>` por municipio (ocurrencia / recencia) — tipo `PRENSA`, hotspots por default
- (Futuro) métrica custom “Salud caliente” para filtrar municipios
- Menciones por fuerza política en prensa (no implementado)

**Nota:** preferir **RSS/API oficial**; scraping solo donde no haya alternativa, siempre con fuente + fecha.

### Feed web — research: RSS (resumen)

**Qué es RSS:** muchos portales publican un canal XML con titulares recientes (título, link, fecha, bajada). Semia lo consulta periódicamente — sin scrapear HTML ni pedir acceso especial al medio.

**Por qué va primero:** es el canal que el portal ya expone para syndication; estable, trazable (siempre guardamos fuente + URL + fecha) y suficiente para contar menciones por partido/municipio/tema.

| Enfoque | Cuándo | Riesgo |
|---------|--------|--------|
| **RSS del portal** | Primera opción | Bajo |
| **Google News RSS** | Medio sin feed propio o cobertura local | Bajo |
| **Scraping de listados** | Solo si no hay RSS ni alternativa | Medio (mantenimiento) |

**Portales con RSS verificado (ago 2026) — seed PoC:** Clarín Política, La Nación, El Cronista, Perfil, Ámbito (más los listados en research histórico: Infobae, Crónica, LPO, etc.).

**Sin RSS claro hoy:** Página/12, El Destape, Minuto Uno; varios medios locales — ahí entra Google News por sitio o scrape acotado (fuera de fase 1).

**Atajo útil — Google News:** un mismo formato RSS para buscar por tema (*“Buenos Aires provincia política”*) o por dominio (*`site:provincianoticias.com.ar`*), útil para cubrir medios chicos sin feed propio (fase posterior).

**Qué necesitamos del cliente:** qué portales priorizar, si hay medios locales imprescindibles, y qué partidos/municipios/temas monitorear al pasar a métrica.

---

## 3. Motor IA

**Qué es:** sugerencias de cruces y hallazgos **solo sobre datos ya cargados** en Semia (PBG, electoral, demográfico, etc.).

**Salida hacia Semia (ejemplos):**
- Métricas derivadas (residuo LLA vs PBG, delta UxP 2021→2023)
- Propuesta de cruce en `/analisis` con evidencia citada
- Insights con confianza alta/media — nunca hechos inventados

**UI mock:** cards de hallazgos + botón “Publicar métrica” (deshabilitado en demo).

**Regla:** el modelo razona sobre `hechos_datos`; el output es valor por geografía o recomendación de análisis.

---

## Flujo común (cuando esté implementado)

| Paso | Descripción |
|------|-------------|
| 1. Ingesta | Job periódico (API/RSS/LLM) trae items crudos |
| 2. Enriquecimiento | Partido, municipio, tema (NLP + reglas + homologaciones) |
| 3. Agregación | Valor numérico por `geografia_id` + `dimension_extra` |
| 4. Revisión | Borrador → lista → activa en **Gestión de métricas** |
| 5. Consumo | Misma tubería que CSV: mapa, filtros, cruce, tabla |

---

## Feed social — research: ¿API o scrape?

### Resumen ejecutivo

| Enfoque | Cuándo usarlo | Riesgo |
|---------|---------------|--------|
| **API oficial (OAuth cuenta del cliente)** | Primera opción para X e Instagram/Facebook del cliente | Bajo (ToS, estabilidad) |
| **Proveedor tercero (Apify, Brandwatch, etc.)** | Si el alcance supera lo que da la API o hay muchas cuentas | Medio (costo + dependencia) |
| **Scraping propio** | Evitar para producto; frágil y suele violar ToS | Alto |

**Recomendación para Semia:** empezar con **cuenta(s) del cliente vía API**, alcance acotado (menciones, hashtags, páginas propias), agregar a métricas territoriales; no scrapear X/Meta en producción.

---

### X (Twitter)

**Modelo 2026:** pay-per-use (créditos en [developer.x.com](https://developer.x.com)); sin tier free para cuentas nuevas.

| Operación | Coste orientativo |
|-----------|-------------------|
| Leer post propio / menciones propias (“Owned Reads”) | ~USD 0,001 por recurso |
| Leer post de terceros | ~USD 0,005 por request |
| Crear post | ~USD 0,015 (con URL ~USD 0,20) |

**Qué permite para Semia (cuenta del cliente conectada):**
- `GET /2/users/{id}/mentions` — menciones a la cuenta
- Búsqueda reciente por keyword/hashtag (ventana ~7 días en planes accesibles; archivo completo = tier caro)
- Webhooks / polling para ingestar y agregar por municipio (vía geocoding de texto o diccionario partido/municipio)

**Qué NO esperar:** un “firehose” barato de todo X sobre política PBA; el costo escala con volumen de lecturas (techo ~2–3M reads/mes en self-serve).

**Flujo técnico sugerido:**
1. App en developer.x.com + OAuth 2.0 PKCE (usuario/cliente autoriza).
2. Backend guarda tokens cifrados; job cada N minutos: mentions + search queries fijas (`#PBA`, nombres de partidos, etc.).
3. Normalizar → clasificar partido/municipio → contar por geografía → escribir hechos o staging para “Publicar métrica”.

**Scraping X:** no recomendado (ToS, bloqueos, sin estabilidad). Solo investigación puntual.

---

### Meta (Instagram / Facebook)

**Dos caminos distintos según alcance:**

#### A) Cuenta propia del cliente (recomendado para v1)

**Instagram Graph API** + Facebook Page (cuenta Business/Creator):

- **Gratis** en uso de API; costo = tiempo de **App Review**, verificación de negocio, mantenimiento OAuth.
- Permisos típicos: `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement`.
- **Webhooks:** comentarios, @mentions en contenido de la cuenta vinculada.
- **No da:** búsqueda libre de todo Instagram/Facebook sobre “política en La Matanza”.

Útil para: monitorear **presencia de la fuerza política del cliente** (menciones, comentarios, engagement en sus publicaciones).

#### B) Investigación / archivo público masivo

**Meta Content Library API:** contenido público amplio de FB/IG, pero acceso **restringido** a investigadores académicos / ONG aprobados, análisis en entorno seguro (cleanroom). **No encaja** en un SaaS comercial tipo Semia salvo partnership especial.

**Scraping Meta:** igual que X — evitar en producto.

---

### ¿La cuenta del cliente alcanza?

**Sí para v1**, si el objetivo es:
- Menciones a la cuenta / campaña del cliente
- Hashtags y keywords acotados en X (búsqueda reciente)
- Comentarios y @mentions en IG/FB de páginas que administra

**No alcanza solo** si el objetivo es:
- Escuchar **toda** la conversación política provincial sin keywords
- Competidores sin APIs de terceros o sin Content Library (investigación)

En ese caso: ampliar con **queries de búsqueda curadas** (partidos, intendentes, municipios) + presupuesto de API X, o evaluar **proveedor de social listening** (export CSV/API → mismo pipeline Semia).

---

### Arquitectura mínima propuesta (fase 1)

```
[OAuth X / Meta] → [Ingest jobs] → [Raw posts table]
        → [Enriquecer: partido, municipio, tema]
        → [Agregar por geografia_id]
        → [Staging métrica] → Gestión de métricas → Mapa / Análisis
```

**Stack sugerido:** endpoints FastAPI + cola (Redis/Celery o cron) + tabla `feed_items` + tabla `feed_metric_drafts`. Sin scrape en prod.

---

### Próximos pasos sugeridos

1. Definir con el cliente **alcance v1** (¿solo su cuenta? ¿keywords? ¿qué partidos/municipios?).
2. PoC **X API**: OAuth + mentions + 2–3 búsquedas fijas; estimar costo mensual de reads.
3. PoC **Meta** (si tienen IG Business): webhooks de mentions/comentarios.
4. Manual “Publicar métrica” desde staging (como el mock) antes de automatizar activación.

---

## Referencias

- X API pricing: [developer.x.com](https://developer.x.com)
- Instagram Graph API: [developers.facebook.com/docs/instagram-api](https://developers.facebook.com/docs/instagram-api/)
- Meta Content Library (investigación): [developers.facebook.com/docs/content-library-and-api](https://developers.facebook.com/docs/content-library-and-api/)
- UI mock: `frontend/app/feeds/{social,web,ia}/`, `frontend/lib/feed-mock.ts`
