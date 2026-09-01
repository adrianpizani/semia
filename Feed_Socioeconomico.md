# Feed socioeconómico — plan por etapas

Plan acotado para el **primer feed real**: INDEC / EPH por **aglomerado**, con ponderación a partido y visualización clara. Sin microdatos Semia hasta cerrar las etapas 1–4.

**Documentos relacionados:** [Feeds.md](./Feeds.md) (modelo feed → métrica), [CONFIG.md](./CONFIG.md).

---

## Marco: Feed APIs

Los feeds externos no son solo pantallas mock: convergen en **Feed APIs** — configuración y orquestación de conectores.

```
Feed APIs (config + jobs)  →  conector (Socio / Web / IA / INDEC…)  →  staging  →  métrica  →  mapa / análisis
```

| Conector | Estado | Qué configura en Feed APIs |
|----------|--------|---------------------------|
| **Socioeconómico (INDEC)** | **Primero — este doc** | Fuentes CSV/series, homologación aglomerado, frecuencia trimestral, publicación |
| Social | Mock | OAuth, keywords, polling |
| Web | Mock | RSS, Google News |
| IA | Mock | Modelo, confianza, métricas elegibles |

**UI propuesta:** sección **Feed APIs** en Configuración (o `/feeds/apis`) con tab por conector. Socioeconómico es el primero que **persiste** config y dispara ingest real.

**Hoy:** Configuración tiene mock; Feeds Social/Web/IA son demo. **Siguiente:** tab Feed APIs con Socioeconómico operativo; el resto se vuelca ahí cuando exista backend.

---

## Enfoque acordado (v1 → mejora)

**v1 — Paramétrico + partido en mapa/análisis**

1. Aglomerados solo en **tablas de referencia** (catálogo INDEC + pesos población), **sin** capa mapa aglomerado.
2. INDEC llega por **aglomerado** → staging → job asigna el **mismo % oficial** a cada partido del aglomerado (según pesos de población, el % queda igual en todos; ver nota abajo).
3. Valores publicados en `hechos_datos` a nivel **Partido** → se activan como **métrica secundaria** en Gestión de Métricas y se usan en mapa/análisis **igual que PBG o cualquier otra** (sin UX especial en v1).
4. Metadata opcional en `dimension_extra` (`origen`, `aglomerado_cod`) para trazabilidad; badges en UI si hace falta después.

**Nota simple:** el % del aglomerado es un **promedio de la zona**. Repartir por población no inventa que La Matanza tenga otro % que Quilmes: en v1 todos los partidos del mismo aglomerado muestran **el mismo %**. Es aceptable como primer paso; hay que marcarlo en UI.

**v2 — Mejorar desagregación**

| Camino | Qué mejora |
|--------|------------|
| Microdatos EPH (`usu_*`) | % calculado por partido/aglomerado con `PONDERA` (Etapa 5) |
| Series INDEC más finas | Si publican desagregación que no tengamos hoy |
| Reemplazo selectivo | Mantener oficial en staging; publicar Semia solo donde reemplace el estimado |

---

**5 aglomerados PBA (EPH):**

| Código | Nombre |
|--------|--------|
| 33 | Partidos del Gran Buenos Aires |
| 2 | Gran La Plata |
| 34 | Mar del Plata–Batán |
| 3 | Bahía Blanca–Cerri |
| 38 | San Nicolás–Villa Constitución |

---

## Etapas (orden fijo)

Cada etapa tiene **una decisión**. No saltar a la siguiente sin cerrarla.

---

### Etapa 1 — Catálogo aglomerado (paramétrico)

**Objetivo:** referencia INDEC en BD; **no** nueva capa en el mapa.

**Entregables:**
- `data/reference/aglomerados_eph_pba.csv` (código, nombre, region_macro)
- Tabla `aglomerado_eph` (sin obligar `dimension_geografica` nivel Aglomerado en v1)

**Decisión 1 — Cerrada:** **paramétrico** (sin GeoJSON aglomerado en v1).

---

### Etapa 2 — Ponderación y asignación a partido

**Objetivo:** pesos INDEC (población por partido dentro de cada aglomerado) + regla de publicación a `hechos_datos`.

**Entregables:**
- `data/reference/aglomerado_partido_pesos.csv`
- Tabla `aglomerado_partido_peso`
- Job: `staging (aglomerado_cod, periodo, valor)` → N filas partido con el **mismo %** del aglomerado

**Regla v1 (acordada):**
- Para **%** (pobreza, etc.): cada partido del aglomerado recibe el **mismo % oficial** del aglomerado.
- Los pesos definen **qué partidos** entran (lista GBA, La Plata, etc.), no un % distinto por partido.
- Partidos 1:1 (Bahía Blanca, Mar del Plata…): dato **directo**, sin badge estimado.
- Partidos del agl. 33: badge **Estimado** + fuente aglomerado en tooltip.

**Decisión 2 — Cerrada:** imputar a todos los partidos del aglomerado (mismo % oficial).

---

### Etapa 3 — Métrica en la plataforma

**Objetivo:** el feed termina en una métrica más del catálogo, no en una pantalla nueva.

**Flujo (igual que CSV hoy):**
```
Feed APIs (borrador)  →  activar en /metricas  →  secundaria en mapa / análisis / cruce
```

**No hace falta v1:** toggle aglomerado, leyenda especial, panel dedicado. Si la métrica está activa, el mapa ya la consume.

**Decisión 3 — Cerrada:** métrica secundaria estándar.

---

### Etapa 4 — Feed APIs + ingest INDEC

**Objetivo:** sección **Feed APIs** (Configuración o `/feeds/apis`) para el conector socioeconómico: ver borradores, publicar métrica, config futura (frecuencia, fuentes, homologaciones).

**Prerequisitos:** Etapas 1–2 (catálogo + pesos).

**Entregables v1:**
- Tab **Feed APIs → Socioeconómico**
- Ver staging / borrador generado (aglomerado + periodo + valor)
- Acción **Publicar** → crea/actualiza métrica + `hechos_datos` por partido (job aglomerado → partido)
- Config mínima: fuente CSV, mapping columnas (luego ampliamos)

**Origen de datos — implementado (EPH trimestral + pyeph):**

| Fase | Origen |
|------|--------|
| **4a** | Upload manual `usu_hogar` + `usu_individual` (TXT INDEC) o archivo de ejemplo en `data/` |
| **4b** | **Descarga automática** vía [pyeph](https://github.com/institutohumai/pyeph) — botón «Descargar último trimestre INDEC» en Feed APIs |

**Motor de cálculo:** `pyeph_adapter` — canastas y adulto equivalente oficiales (pyeph), desempleo (LaborMarket), pobreza por hogar (PONDIH), ocupación e informalidad (PONDERA). Fallback a `eph_canastas_regionales.csv` si el trimestre aún no está en el mirror de canastas.

**Pipeline:**
1. Microdatos EPH trimestrales (descarga o upload)
2. Agregación por `AGLOMERADO` (5 aglomerados PBA)
3. Staging por `aglomerado_cod` × indicador
4. Job con pesos → filas partido
5. Admin **Publicar** → métricas activables en Gestión de Métricas

**Métricas v1:** pobreza, indigencia, desempleo, ocupación, informalidad (`*_eph_pct`).

**Decisión 4 — Cerrada:** borrador en Feed APIs → activación manual en Métricas (como hoy).

**Decisión 5 — Actualizada:** descarga pyeph/INDEC operativa; upload manual sigue disponible.

---

### Etapa 5 — Métricas Semia (microdatos) — después

**Objetivo:** indicadores propios desde `usu_hogar` / `usu_individual` (pyeph, agregación PONDERA).

**No empezar hasta:** Etapa 4 con al menos un trimestre oficial visible en la plataforma.

**Entregables futuros:** `eph_aggregate_pba.py`, `origen=semia_eph`, comparativa oficial vs Semia en análisis.

---

## Checklist antes de codear

| # | Decisión | Estado |
|---|----------|--------|
| 1 | Catálogo paramétrico (sin mapa aglomerado) | ✅ |
| 2 | Mismo % por partido dentro del aglomerado | ✅ |
| 3 | Métrica secundaria estándar (mapa como cualquier otra) | ✅ |
| 4 | Borrador en Feed APIs → activar en Métricas | ✅ |
| 5 | CSV primero; API después | ✅ |

**Trabajo manual paralelo (sin código):**
- [ ] Armar `aglomerados_eph_pba.csv`
- [ ] Armar `aglomerado_partido_pesos.csv` desde documento INDEC localidades
- [ ] Validar 2–3 valores pobreza CSV vs informe INDEC

---

## Modelo de datos (por etapa)

| Etapa | Tablas / cambios |
|-------|------------------|
| 1 | `aglomerado_eph` (catálogo) |
| 2 | `aglomerado_partido_peso` + job aglomerado → partido |
| 3 | Nada extra en mapa — métrica en catálogo |
| 4 | `feed_sources`, staging, **Feed APIs** UI, ingest CSV |
| 5 | Microdatos → % por partido real (reemplaza estimados) |

---

## Qué NO hacer en la primera entrega

- Subir `usu_*.xlsx` crudo a Semia
- Pintar % pobreza del GBA en 24 partidos sin decisión 2 explícita
- Prometer “API INDEC” única (es conector multi-fuente)
- Mezclar Feed APIs con ingest de microdatos (Etapa 5)

---

## Referencias

- `data/EPH_registro_1T2026.pdf`, `data/usu_*_T126.xlsx`
- `data/poblacion-con-ingresos-por-debajo-linea-pobreza-eph-continua.csv`
- [datos.gob.ar](https://www.datos.gob.ar/)
- [eph R — centroides y diccionario aglomerados](https://ropensci.github.io/eph/)
