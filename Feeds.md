# Feeds — tres pilares de inteligencia

Semia no agrega tres apps aparte: los feeds **generan señales** que se materializan como **métricas** y se consumen en el **mapa** y el **análisis tabular**, igual que un CSV.

```
Feed (Social / Web / IA)  →  agregación + revisión  →  métrica en catálogo  →  mapa / análisis
```

**Estado actual:** vistas mock en `/feeds/social`, `/feeds/web`, `/feeds/ia` (Próximamente). **Feed socioeconómico (INDEC)** es el primer conector real — plan por etapas en [Feed_Socioeconomico.md](./Feed_Socioeconomico.md). Configuración de todos los conectores converge en **Feed APIs** (tab en Configuración).

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

**Qué es:** titulares y notas de portales (RSS, APIs editoriales o scraping acotado).

**Salida hacia Semia (ejemplos):**
- Cobertura mediática 7d por municipio o tema
- Menciones por partido en prensa
- Índice de “presencia en agenda” por territorio

**UI mock:** lista de noticias + filtros por portal/tema.

**Nota:** preferir **RSS/API oficial**; scraping solo donde no haya alternativa, siempre con fuente + fecha.

### Feed web — research: RSS (resumen)

**Qué es RSS:** muchos portales publican un canal XML con titulares recientes (título, link, fecha, bajada). Semia lo consulta periódicamente — sin scrapear HTML ni pedir acceso especial al medio.

**Por qué va primero:** es el canal que el portal ya expone para syndication; estable, trazable (siempre guardamos fuente + URL + fecha) y suficiente para contar menciones por partido/municipio/tema.

| Enfoque | Cuándo | Riesgo |
|---------|--------|--------|
| **RSS del portal** | Primera opción | Bajo |
| **Google News RSS** | Medio sin feed propio o cobertura local | Bajo |
| **Scraping de listados** | Solo si no hay RSS ni alternativa | Medio (mantenimiento) |

**Portales con RSS verificado (ago 2026):**

| Portal | Sección sugerida |
|--------|------------------|
| Clarín | Política |
| La Nación | Política / general |
| Infobae | Política / general |
| Perfil | Política |
| Ámbito | Política |
| Crónica | Política |
| Cronista | Política |
| La Política Online (LPO) | General |
| iProfesional | General |
| Provincial News | General (PBA) |

**Sin RSS claro hoy:** Página/12, El Destape, Minuto Uno; varios medios locales (Provincia Noticias, El Provincial, etc.) — ahí entra Google News por sitio o scrape acotado del listado de titulares.

**Atajo útil — Google News:** un mismo formato RSS para buscar por tema (*“Buenos Aires provincia política”*) o por dominio (*`site:provincianoticias.com.ar`*), útil para cubrir medios chicos sin feed propio.

**Propuesta v1:** lista curada de ~8–12 fuentes (grandes medios política + 1–2 provinciales + Google News para huecos) → clasificar titulares por partido/municipio → agregar a métricas de cobertura mediática en el mapa.

**Qué necesitamos del cliente:** qué portales priorizar, si hay medios locales imprescindibles, y qué partidos/municipios/temas monitorear en la primera versión.

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
