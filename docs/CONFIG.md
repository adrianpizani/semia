# Configuración — hub unificado

**Estado (7-sep-2026):** existe `workspace_config` (documento JSON singleton) + API
`GET/PATCH /api/v1/workspace/config`. La pantalla `/configuracion` es el hub: lo
**Persistido** se guarda; el resto es preview sobre el **mismo schema**.

Dirección de producto: [`AVANCE.md`](./AVANCE.md) § *Dirección producto*.

---

## Regla de oro (para todo lo nuevo)

| Tipo de setting | Dónde va | Cómo se gestiona |
|-----------------|----------|------------------|
| Política / default del equipo | `workspace_config.document` | `PATCH /workspace/config` con deep-merge de la rama |
| Lista que crece (RSS, hashtags) | Tabla `feed_sources` | CRUD propio; no inflar el JSON |
| Por métrica (activar, escala) | Tabla `metricas` | `/metricas` (y link desde Config) |
| Preferencia personal | `user_preferences` (futuro) | Por usuario; no pisa workspace |
| Secretos (OAuth, LLM) | env / vault | Nunca en JSON de config |

**Al agregar un setting nuevo:**
1. Sumarlo a `DEFAULT_WORKSPACE_CONFIG` en `workspace_config_service.py`.
2. Si ya tiene efecto en producto, agregarlo a `LIVE_PATHS`.
3. Exponerlo en `/configuracion` (tab correspondiente) y/o en la pantalla operativa.
4. Guardar solo vía `patchWorkspaceConfig({ ...rama })` — **no** crear tablas `*_config` por conector.

---

## Documento JSON (schema)

Ubicación: `backend/app/services/workspace_config_service.py` → `DEFAULT_WORKSPACE_CONFIG`.

```
version
defaults.mapa | analisis | metricas
feeds.socio | web | social | ia
archivos
storage
```

**Live hoy:**
- `feeds.socio.borrar_trimestre_anterior_al_publicar`, `feeds.socio.trimestre_referencia`
- `feeds.web.fetch_interval_min`, `feeds.web.retention_days`, `feeds.web.classify_territorial`, `feeds.web.import_untagged`
- Fuentes RSS: tabla `feed_sources` (CRUD `/api/v1/feeds/web/sources`, UI Configuración → Web)

Compat: `GET/PATCH /feeds/socio/config` sigue existiendo como fachada sobre `feeds.socio`.

---

## Mapa de dónde vive hoy vs destino

| Setting / área | Dónde se ve | Persistencia |
|----------------|-------------|--------------|
| EPH: borrar trimestre | Config → Feeds + Feed APIs | `workspace_config` → `feeds.socio` |
| Activar métrica / escala | `/metricas` | tabla `metricas` |
| Preferencias de mapa (sesión) | Dashboard | `sessionStorage` → futuro `user_preferences` |
| Web políticas (intervalo, retención, clasificar, importar sin tags) | Config → Web | `workspace_config` → `feeds.web` |
| Fuentes RSS | Config → Web | tabla `feed_sources` |
| Web/Social/IA resto (social, ia) | Config (preview) | schema en `feeds.*` (aún no live) |
| Secretos | — | env |

---

## Capas (resumen)

| Capa | Uso |
|------|-----|
| **`workspace_config`** | Defaults y políticas del equipo (un JSON) |
| **`metricas`** | Config por indicador |
| **`feed_sources`** | Fuentes RSS del feed web (CRUD en Config → Web) |
| **`user_preferences`** | Preferencias personales — pendiente |
| **Env / secrets** | Credenciales |
| **`feed_socio_config`** | Legacy; migrado al hub (tabla puede quedar vacía de uso) |

---

## API

```http
GET  /api/v1/workspace/config   # admin → { document, live_paths, updated_at }
PATCH /api/v1/workspace/config  # admin → body: { "document": { ...partial } }
```

El PATCH hace **deep-merge**: solo se envían las ramas a cambiar.

---

## Pantallas (especificación funcional)

Cada tab de `/configuracion` corresponde a una rama del documento. Detalle mínimo:

| Tab | Rama JSON | Notas |
|-----|-----------|-------|
| Mapa | `defaults.mapa` | Preferencias personales de recorte → futuro `user_preferences` |
| Análisis | `defaults.analisis` | Umbral de resaltado es de equipo |
| Feeds | `feeds.*` | EPH live; web/social/ia schema listo |
| Social / IA | `feeds.social` / `ia` | keywords → futuro `feed_sources` o tablas propias |
| Web | `feeds.web` + tabla `feed_sources` | políticas JSON; URLs en tabla |
| Archivos | `archivos.*` | Procesadores siguen en `/archivos` |
| Métricas | `defaults.metricas` + tabla `metricas` | Activar/escala en `/metricas` |

### Almacenamiento y retención (`storage.*`)

| Clave | Uso |
|-------|-----|
| `staging_ttl_days` | Borradores de feeds |
| `historical_hechos_months` | Hechos históricos a conservar |
| `feed_raw_retention_days` | Texto/crudo de medios (cuando exista) |

EPH trimestral es liviano; el riesgo de disco son elecciones a circuito y feeds con texto crudo.
