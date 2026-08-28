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

## Orden de implementación sugerido

1. **`user_preferences`** — defaults mapa + análisis (impacto inmediato, bajo riesgo).
2. **`workspace_config`** — límites globales, homologaciones, política feeds.
3. **`feed_sources`** — cuando exista ingesta Social/Web.
4. **Secrets + OAuth** — cuentas X/Meta/LLM en fase feeds.

---

## Referencias

- UI mock: `frontend/components/configuracion-cliente.tsx`
- Feeds: [Feeds.md](./Feeds.md)
- Métricas live: `/metricas` (activación, escala)
- Procesadores live: `/archivos`
