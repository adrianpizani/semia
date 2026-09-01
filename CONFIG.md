# Configuración — plan por pantalla

La pantalla `/configuracion` muestra un **mock realista** de cómo se verán los ajustes. Este documento concentra el **plan funcional** y **dónde persistir** cada cosa.

**Estado actual:** UI mock; nada persiste en backend.

---

## Dónde vivirá la configuración

| Capa | Uso | Ejemplos |
|------|-----|----------|
| **`metricas` (BD)** | Config por indicador | `is_active`, `escala_rango`, tipo, archivo origen |
| **`feed_sources` (BD)** | Fuentes de ingesta | URL RSS, query Google News, hashtag, cuenta social |
| **`workspace_config` (JSON)** | Defaults del equipo / tenant | Polling, IA, homologaciones, límites globales |
| **`user_preferences` (JSON)** | Preferencias personales | Métrica primaria al abrir mapa, columnas en análisis |
| **Env / secrets** | Credenciales sensibles | API keys X/Meta/LLM; tokens OAuth cifrados |
| **`storage_stats` (vista / job)** | Uso de disco y retención | Totales por tabla, alertas, políticas de purge |

**Regla:** secretos nunca en JSON de usuario. Preferencias personales no pisan defaults del workspace.

---

## 1. Mapa

Defaults al abrir el dashboard (`/`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Métrica primaria por defecto | Métrica electoral preseleccionada | `user_preferences` |
| Métricas secundarias iniciales | Hasta N indicadores en la barra de filtros | `user_preferences` |
| Partido / año / tipo de voto | Recorte electoral inicial (ej. 2023 · positivo · LLA) | `user_preferences` |
| Estilo de mapa base | OSM, satélite, etc. | `user_preferences` |
| Modo de color por partido | Intensidad relativa (p5–p95) vs absoluta | `user_preferences` |
| Panel lateral y leyenda | Mostrar/ocultar por defecto | `user_preferences` |

**Nota:** la intensidad relativa ya funciona en runtime; falta persistir la preferencia.

---

## 2. Análisis

Tabla territorial y cruce scatter (`/analisis`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Columnas visibles por defecto | Secundarias numéricas precargadas en la tabla | `user_preferences` |
| Orden inicial | Por % partido, nombre o métrica secundaria | `user_preferences` |
| Métrica X del cruce | Indicador preseleccionado en scatter (ej. PBG) | `user_preferences` |
| Umbral de resaltado | % mínimo para tintar filas con partido elegido | `workspace_config` |
| Exportar tabla | Formato CSV/XLSX y columnas incluidas | `user_preferences` |

---

## 3. Social

Feed social — menciones X / Meta (`/feeds/social`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Cuenta X conectada | OAuth del cliente (mentions, búsquedas) | `env_secrets` + token cifrado |
| Cuenta Instagram / Facebook | Graph API + webhooks | `env_secrets` + token cifrado |
| Keywords y hashtags | Términos a monitorear (#PBA, partidos, intendentes) | `feed_sources` |
| Intervalo de ingesta | Frecuencia del job (ej. 15 min) | `workspace_config` |
| Diccionario partido / municipio | Aliases para clasificar menciones | `workspace_config` |
| Publicación de métricas | Siempre borrador vs auto-activar tras revisión | `workspace_config` |

Ver también: [Feeds.md](./Feeds.md) — research API vs scrape.

---

## 4. Web

Feed web — titulares RSS / Google News (`/feeds/web`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Fuentes RSS | URLs (Clarín, LN, Infobae, Provincial News…) | `feed_sources` |
| Queries Google News | Por tema o `site:dominio` | `feed_sources` |
| Intervalo de fetch | Polling respetando ttl del medio | `workspace_config` |
| Clasificación territorial | Titular → partido/municipio (reglas + opcional LLM) | `workspace_config` |
| Retención de noticias | Días antes de purgar items crudos | `workspace_config` |

Ver también: **§8 Almacenamiento** — TTL de crudo vs hechos agregados.

---

## 5. IA

Motor de sugerencias (`/feeds/ia`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Modelo y temperatura | Proveedor LLM, modelo, creatividad | `env_secrets` + `workspace_config` |
| Confianza mínima | Solo insights con evidencia citada sobre umbral | `workspace_config` |
| Métricas elegibles | Tipos que pueden derivarse (electoral, PBG, etc.) | `workspace_config` |
| Flujo de publicación | Borrador obligatorio vs activación directa | `workspace_config` |
| Límite diario | Tope de llamadas LLM por workspace | `workspace_config` |

**Regla:** el modelo razona solo sobre datos ya cargados; nunca inventa hechos.

---

## 6. Archivos

Upload y procesamiento CSV (`/archivos`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Procesador sugerido al subir | Match automático vs confirmación manual | `workspace_config` |
| Validación post-upload | Preview columnas/geografía antes de procesar | `workspace_config` |
| Retención de fallidos | Días antes de borrar uploads FALLIDO | `workspace_config` |
| Definición de procesadores | Mapeo columnas → métricas | **`/archivos`** (ya existe) |

Ver también: **§8 Almacenamiento** — impacto de cargas masivas en `hechos_datos`.

---

## 7. Métricas

Catálogo activo (`/metricas`).

| Setting | Descripción | Persistencia |
|---------|-------------|--------------|
| Activar / desactivar | Qué indicadores aparecen en el mapa | **`/metricas`** → `metricas.is_active` |
| Escala del slider | Lineal / log por métrica numérica | **`/metricas`** → `metricas.escala_rango` |
| Máximo de secundarias | Límite en barra de filtros del mapa | `workspace_config` |
| Métricas desde feeds | Política global borrador vs auto-activación | `workspace_config` |
| Homologaciones de partido | Aliases entre fuentes (electoral, prensa, redes) | `workspace_config` |

---

## 8. Almacenamiento y depuración

**Problema:** el front solo pide lo que necesita para trabajar (RAM/latencia). El **disco en cloud** crece con lo que **persistimos** en Postgres (y, si existiera, object storage de crudos). EPH trimestral es liviano; **elecciones a nivel circuito** y **feeds con texto crudo** son el riesgo real.

### Qué crece y qué no

| Origen | Archivo crudo en servidor | Qué queda en BD | Orden de magnitud |
|--------|---------------------------|----------------|-------------------|
| EPH trimestral (`usu_hogar` + `usu_individual`) | No — se agrega y se descarta | `feed_socio_staging` (borrador) + `hechos_datos` publicados | ~25 staging + ~165 hechos/trimestre (5 indicadores × 33 partidos) |
| CSV electoral / PBG (`/archivos`) | No hoy — procesamiento en memoria | `hechos_datos` (+ metadata `archivos`) | **Alto** — puede ser millones de filas |
| Feed web / social (futuro) | Opcional S3/disco | Items crudos + agregados en `hechos_datos` | **Alto** si guardamos texto completo sin TTL |
| Geografía (PostGIS) | GeoJSON en imagen/static | `dimension_geografica` | Casi fijo (~143 partidos + circuitos) |

**Tabla crítica:** `hechos_datos` (valor + `fecha_dato` + `dimension_extra` JSON). El comentario en el modelo ya contempla escalar a millones de filas.

### Capas de datos y políticas (objetivo)

```
Crudo (opcional)  →  Staging / borrador  →  Hechos publicados  →  Archivo frío (futuro)
     TTL corto           TTL corto              retención por política      parquet/S3
```

| Capa | Contenido | Retención propuesta (default) | Acción de purge |
|------|-----------|-------------------------------|-----------------|
| **Crudo** | TXT/CSV original, posts, HTML | 0–90 días (o no guardar) | Borrar archivo / objeto S3 |
| **Staging** | `feed_socio_staging`, borradores feeds | Hasta publicar o 30 días | `DELETE` al nuevo trimestre o tras publicar |
| **Hechos activos** | `hechos_datos` de métricas `is_active` | Sin límite por defecto | Solo si admin archiva métrica/archivo |
| **Hechos históricos** | Métricas desactivadas o archivos antiguos | 24–36 meses configurable | Job mensual + confirmación admin |
| **Metadata** | `archivos`, logs de procesamiento | Igual que hechos ligados | Cascade al borrar archivo |

**Reglas de producto:**
- Publicar EPH trimestre nuevo **reemplaza borradores** del conector socio (ya implementado).
- Borrar un archivo en **Gestión de Archivos** debe seguir eliminando sus `hechos_datos` (cascade).
- Feeds con texto: **agregar a métricas**, no acumular crudo indefinido (ver retención en tabs Social/Web).

### Mostrar al usuario (admin)

Nueva subsección en **Configuración → Almacenamiento** (o tab dedicado), solo `rol=admin`:

| Elemento UI | Qué muestra |
|-------------|-------------|
| **Resumen** | Tamaño total Postgres (o volumen cloud), % del límite contratado, tendencia 30 días |
| **Por tabla** | `hechos_datos`, `dimension_geografica`, `feed_socio_staging`, `archivos` — filas y tamaño estimado |
| **Por fuente** | Desglose por `archivo_id` / métrica / feed (última carga, filas, MB aprox.) |
| **Top consumidores** | 10 archivos o métricas con más hechos |
| **Políticas** | TTL staging, retención hechos históricos, retención noticias/posts (editable, con defaults del workspace) |
| **Acciones** | “Purgar staging > N días”, “Eliminar archivos FALLIDO > N días”, “Archivar métrica inactiva” (con preview de filas a borrar) |

**API backend (futuro):**
- `GET /api/v1/admin/storage` — totales y desglose.
- `POST /api/v1/admin/storage/preview-purge` — simulación sin borrar.
- `POST /api/v1/admin/storage/purge` — ejecuta política (requiere admin + confirmación).

**Alertas (ops / cloud):**
- Alerta cuando disco del volumen Postgres > 70 % (panel del proveedor o script cron).
- Log semanal con filas nuevas en `hechos_datos` y tamaño DB.

### Jobs de depuración (futuro)

| Job | Frecuencia | Qué hace |
|-----|------------|----------|
| `purge_staging` | Diario | Borra `feed_socio_staging` BORRADOR con `created_at` > TTL |
| `purge_failed_uploads` | Semanal | Archivos `FALLIDO` > N días (config tab Archivos) |
| `purge_feed_raw` | Diario | Items crudos web/social > retención configurada |
| `archive_old_hechos` | Mensual | Métricas inactivas + hechos > ventana histórica → opcional export parquet y `DELETE` |
| `vacuum_analyze` | Mensual (ops) | `VACUUM ANALYZE` en Postgres tras purgas grandes |

Todos los jobs deben **loguear** filas eliminadas y dejar entrada en auditoría (quién/cuándo si fue manual).

### Orden de implementación (almacenamiento)

1. **Lectura** — endpoint `GET /admin/storage` + card en Configuración (totales + filas por tabla + top archivos). Sin purge automático.
2. **Políticas en `workspace_config`** — TTL staging, retención fallidos, retención feeds crudos (defaults documentados).
3. **Purge manual con preview** — botón admin “Simular limpieza” / “Ejecutar” con conteo de filas.
4. **Jobs cron** — staging + fallidos + feed raw (cuando existan feeds reales).
5. **Archivo frío** — export S3/parquet antes de borrar hechos históricos (solo si el volumen lo justifica).

**No hacer sin necesidad:** guardar TXT EPH crudos en BD; duplicar millones de hechos por trimestre si la métrica ya está publicada (upsert por `geografia_id + metrica_id + fecha_dato`).

---

## Orden de implementación sugerido

1. **`user_preferences`** — defaults mapa + análisis (impacto inmediato, bajo riesgo).
2. **`workspace_config`** — límites globales, homologaciones, política feeds.
3. **`feed_sources`** — cuando exista ingesta Social/Web.
4. **Secrets + OAuth** — cuentas X/Meta/LLM en fase feeds.
5. **Almacenamiento (§8)** — dashboard admin + políticas de retención antes de feeds masivos.

---

## Referencias

- UI mock: `frontend/components/configuracion-cliente.tsx`
- Feeds: [Feeds.md](./Feeds.md)
- Feed socio EPH: [Feed_Socioeconomico.md](./Feed_Socioeconomico.md)
- Métricas live: `/metricas` (activación, escala)
- Procesadores live: `/archivos`
- Almacenamiento: **§8** en este documento
