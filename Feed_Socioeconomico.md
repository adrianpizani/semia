# Feed socioeconómico — plan EPH / INDEC

Extensión del modelo de feeds de Semia: datos **socioeconómicos oficiales (INDEC / EPH)** y **métricas propias** derivadas de microdatos, materializados como indicadores en el mapa y el análisis.

```
Fase 1 Geografía     →  aglomerados + pesos partido
Fase 2 INDEC (oficial) →  series por aglomerado → métricas Semia
Fase 3 Semia (propias) →  microdatos EPH → agregación → métricas Semia
```

**Estado actual:** microdatos locales (`data/usu_*_T126.xlsx`), CSV pobreza continua (`poblacion-con-ingresos-por-debajo-linea-pobreza-eph-continua.csv`), geografía Semia solo en **Partido** y **Circuito**. Sin nivel **Aglomerado** ni feed automatizado.

**Relación con otros docs:** [Feeds.md](./Feeds.md) (modelo feed → métrica), [CONFIG.md](./CONFIG.md) (config futura del feed).

---

## Problema central

La EPH publica indicadores por **aglomerado urbano** (Gran La Plata, Mar del Plata, Partidos del GBA, etc.), no por **partido/municipio** bonaerense. Semia opera en **partidos** para el mapa electoral.

**Solución en dos capas:**

1. **Capa aglomerado** — entidad geográfica propia (GeoJSON + tabla INDEC).
2. **Capa partido** — valores **imputados** vía ponderación oficial INDEC (aglomerado → partidos que integran el aglomerado).

Sin eso, no se puede pintar el mapa de PBA con datos EPH sin distorsionar.

---

## Fase 1 — Geografía: aglomerados + ponderación municipal

### 1.1 Catálogo de aglomerados EPH (PBA)

Fuente: Anexo I del registro EPH (`EPH_registro_*.pdf`) + diccionario INDEC.

**Aglomerados con cobertura en provincia de Buenos Aires** (códigos EPH):

| Código | Nombre INDEC | REGION macro |
|--------|--------------|--------------|
| 33 | Partidos del Gran Buenos Aires | 1 (Gran Buenos Aires) |
| 2 | Gran La Plata | 43 (Pampeana) |
| 34 | Mar del Plata–Batán | 43 |
| 3 | Bahía Blanca–Cerri | 43 |
| 38 | San Nicolás–Villa Constitución | 43 |

**Filtro de microdatos:** `(REGION, AGLOMERADO)` — no filtrar por “provincia” en la base; `REGION 42` es **Cuyo**, no PBA.

### 1.2 GeoJSON de aglomerados

**Objetivo:** polígonos o puntos en `dimension_geografica` con `nivel = "Aglomerado"`.

| Fuente posible | Notas |
|----------------|--------|
| INDEC — centroides / mapas por aglomerado | Paquete R `eph::centroides_aglomerados`; referencia INDEC Nivel4-Tema |
| Construcción propia | Unión de polígonos de partidos según lista INDEC de localidades del aglomerado |
| Híbrido v1 | **Punto + radio** o **hull** de partidos ponderados → polígono simplificado para mapa |

**Entregables:**

- `data/geo/aglomerados_eph_pba.geojson`
- Script `import_aglomerados.py` → `dimension_geografica` + geometría
- Tabla `aglomerado_eph` (`codigo`, `nombre`, `region_macro`, `geografia_id`)

### 1.3 Ponderación aglomerado → partido (INDEC)

**Objetivo:** para cada aglomerado, peso de cada partido bonaerense que lo integra.

Fuente INDEC: documentos de **localidades incluidas en aglomerados EPH** (sitio anterior INDEC / anexos BUA). Alternativa: composición publicada en informes de aglomerados.

**Tabla propuesta:** `aglomerado_partido_peso`

| Campo | Descripción |
|-------|-------------|
| `aglomerado_cod` | Código EPH |
| `partido_geografia_id` | FK a `dimension_geografica` (nivel Partido) |
| `peso` | Proporción población hogar o viviendas (0–1, suma 1 por aglomerado) |
| `fuente` | URL / documento INDEC |
| `vigencia` | Desde trimestre / año |

**Uso:**

```text
valor_partido_i = valor_aglomerado × peso_i
```

Solo para **métricas extensive** (población, hogares). Para **tasas** (% pobreza, desempleo): **no** prorratear el %; mantener tasa a nivel aglomerado y usar pesos solo si INDEC publica desagregación o para métricas derivadas con microdatos.

**Entregables:**

- `data/reference/aglomerado_partido_pesos.csv` (curado manual + INDEC)
- Validación cruzada con totales publicados por aglomerado

### 1.4 UI / mapa

- Nuevo nivel en leyenda: **Aglomerado** (toggle con Partido).
- Análisis: filas de aglomerado + partidos (con badge “imputado”).
- Cruce electoral × socioeconómico: partido con valor imputado o aglomerado como dimensión.

**Criterio de éxito Fase 1:** 5 aglomerados PBA en BD, pesos documentados, al menos un polígono/punto visible en mapa.

---

## Fase 2 — Ingesta INDEC: datos oficiales por aglomerado

### 2.1 “API INDEC” — realidad y opciones

INDEC **no expone una API REST dedicada** para EPH microdatos. Opciones prácticas:

| Canal | Qué da | Uso en Semia |
|-------|--------|--------------|
| **datos.gob.ar — API de series** | Series temporales (pobreza, etc.) | Job periódico → `feed_sources` |
| **Datasets en datos.gob.ar / INDEC** | CSV/XLSX (ej. pobreza continua por aglomerado) | Download + ingest |
| **FTP INDEC** (`usu_hogar`, `usu_individual`) | Microdatos trimestrales | Fase 3, no Fase 2 |
| **REDATAM+SP** (INDEC) | Tabulados bajo demanda | Legacy; evaluar si simplifica algo |
| **pyeph / eph (R)** | Descarga automatizada + canastas | Backend job Python |

**Recomendación:** tratar el “feed INDEC” como **conector de ingesta** (no una sola API):

```
feed_indec_job  →  raw staging  →  normalizar aglomerado_cod + trimestre  →  hechos_datos / borrador métrica
```

### 2.2 Métricas oficiales v1 (revisar después)

Partir de lo que **ya está agregado por aglomerado** y alineado con informes INDEC:

| Métrica | Fuente inicial | Nivel |
|---------|----------------|--------|
| % población bajo línea de pobreza | CSV pobreza continua / datos.gob.ar | Aglomerado |
| % indigencia | Idem | Aglomerado |
| % GBA / La Plata / Mar del Plata… | Columnas del mismo dataset | Aglomerado |
| Ingreso medio (si publicado en cuadros) | Series o cuadros EPH | Aglomerado |
| Tasa de desempleo / actividad | Cuadros EPH trimestrales | Aglomerado |

**En repo hoy:** `data/poblacion-con-ingresos-por-debajo-linea-pobreza-eph-continua.csv` — **listo para PoC** de ingest (wide → long por aglomerado).

**Política:** marcar métricas oficiales con `origen = indec_oficial` y `revision_pendiente = true` hasta validar definiciones con el cliente.

### 2.3 Pipeline de ingest (Fase 2)

| Paso | Descripción |
|------|-------------|
| 1. Scheduler | Cron / Celery: trimestral + retry si INDEC tarda publicación |
| 2. `feed_sources` | Tipo `indec_series`, URL dataset o id serie datos.gob.ar |
| 3. Staging | `feed_indec_staging` (aglomerado_cod, periodo, indicador, valor, fuente_url) |
| 4. Homologación | Map nombre columna → `aglomerado_cod` |
| 5. Revisión | Borrador en Gestión de métricas (como feeds Social/Web) |
| 6. Activación | `hechos_datos` + opcional imputación a partido (Fase 1) |

### 2.4 Imputación a partido (métricas oficiales)

- **Tasas (%):** mostrar en mapa solo donde hay 1:1 (ej. Bahía Blanca ≈ partido homónimo) o **no pintar** partidos del GBA con un solo % del aglomerado 33.
- **Alternativa v1:** mapa por **aglomerado**; tabla de partidos con valores imputados marcados como estimados.
- **v2:** si INDEC publica desagregación provincial/aglomerado más fina, consumirla directamente.

**Criterio de éxito Fase 2:** al menos **pobreza continua** actualizada automáticamente; 5 aglomerados PBA en catálogo de métricas; fuente y fecha en cada valor.

---

## Fase 3 — Métricas Semia (propias, desde microdatos)

### 3.1 Objetivo

Indicadores **calculados por Semia** desde `usu_hogar` / `usu_individual`, no copiados del informe INDEC:

- Replicar metodología INDEC (canastas, adulto equivalente, línea de pobreza) **o** indicadores simplificados acordados con el cliente.
- Permitir cruces y recortes que el informe oficial no publica (subconjuntos, ventanas, derivadas).

**Marca:** `origen = semia_eph`, `nombre_amigable` distinto del oficial (ej. “Pobreza EPH Semia T1 2026”).

### 3.2 Hogar vs individual

| Archivo | Usar para |
|---------|-----------|
| **`usu_hogar`** | Pobreza, ingreso familiar (ITF), vivienda (IV*), NBI |
| **`usu_individual`** | Desempleo, ocupación, educación, ingreso individual |

Agregación: siempre con **`PONDERA`** (y `PONDIH` cuando aplique a hogar).

### 3.3 Preproceso (no subir Excel crudo a Semia)

```
usu_* (nacional)  →  filtro PBA aglomerados  →  agregación ponderada  →  CSV Semia  →  procesador
```

**Un script, muchas métricas** — no 98/234 uploads:

- `backend/scripts/eph_aggregate_pba.py`
- Salida long: `aglomerado_cod, trimestre, metrica_clave, valor`
- Salida partido (opcional): aplicar `aglomerado_partido_peso` solo donde metodología lo permita

**Librerías de referencia:** [pyeph](https://pyeph.readthedocs.io/) (pobreza oficial), lógica inspirada en [eph (R)](https://ropensci.github.io/eph/) para canastas y etiquetas.

### 3.4 Métricas Semia candidatas (priorizar con cliente)

| Métrica | Fuente | Nivel |
|---------|--------|--------|
| % pobreza (metodología Semia/pyeph) | hogar | Aglomerado |
| Ingreso medio per cápita familiar | hogar | Aglomerado |
| % hogares sin agua de red | hogar | Aglomerado |
| Tasa de desempleo | individual | Aglomerado |
| % población con universitario completo | individual | Aglomerado |
| Índice compuesto NBI proxy | hogar | Aglomerado |

**Revisión pendiente:** lista final con cliente; no implementar las 234 columnas.

### 3.5 Disponibilización en plataforma

Mismo flujo que el resto de Semia:

```
eph_aggregate  →  staging (borrador)  →  Gestión de métricas  →  mapa / análisis / cruce
```

- Tipo métrica: `DEMOGRAFICA` o `ECONOMICA`.
- `dimension_extra`: trimestre (`2026-T1`), opcional `origen=semia`.
- Comparar en UI **oficial INDEC** vs **Semia** (dos series, misma geografía).

**Criterio de éxito Fase 3:** un trimestre PBA procesado end-to-end; ≥3 métricas propias en catálogo; trazabilidad (script version, fecha microdato, filtros).

---

## Modelo de datos (resumen)

| Tabla / entidad | Rol |
|-----------------|-----|
| `dimension_geografica` | + nivel `Aglomerado` |
| `aglomerado_eph` | Catálogo códigos INDEC |
| `aglomerado_partido_peso` | Pesos oficiales |
| `feed_sources` | URLs series / datasets INDEC |
| `feed_indec_staging` | Valores crudos normalizados |
| `metricas` | `origen`: `indec_oficial` \| `semia_eph` |
| `hechos_datos` | Valores por `geografia_id` + periodo |

---

## Orden de implementación

| # | Entrega | Dependencias |
|---|---------|--------------|
| 1 | Catálogo aglomerados PBA + CSV pesos (manual INDEC) | — |
| 2 | GeoJSON / import aglomerados | #1 |
| 3 | PoC ingest CSV pobreza continua → staging → métrica | #1 |
| 4 | Job datos.gob.ar / download INDEC | #3 |
| 5 | UI: nivel Aglomerado en mapa + badge imputado | #2 |
| 6 | Script `eph_aggregate_pba.py` + 3 métricas Semia | #1, microdatos |
| 7 | Comparativa oficial vs Semia en análisis | #4, #6 |

---

## Riesgos y decisiones abiertas

| Tema | Opciones | Recomendación |
|------|----------|---------------|
| Tasas en mapa partido | No pintar / imputar / solo aglomerado | Mapa aglomerado + tabla partido imputado |
| API INDEC | Solo datasets + series | No esperar REST EPH; conector multi-fuente |
| Frecuencia | Trimestral (EPH) | Job post-publicación INDEC |
| Métricas oficiales | Muchas columnas CSV | v1: pobreza + 2–3; resto backlog |
| Validación | Diff vs informe INDEC | QA automático en staging (tolerancia %) |

---

## Próximos pasos inmediatos

1. **Cliente:** confirmar lista de aglomerados PBA y 5 indicadores prioritarios (oficial + propios).
2. **Equipo:** armar `aglomerado_partido_pesos.csv` desde documento INDEC de localidades.
3. **PoC técnico:** ingest pobreza continua + 5 filas aglomerado en análisis (sin mapa).
4. **Geo:** centroides INDEC → GeoJSON v1.
5. Documentar en CONFIG tab “Feed socioeconómico” cuando exista pantalla.

---

## Referencias

- Registro EPH: `data/EPH_registro_1T2026.pdf`
- Microdatos local: `data/usu_hogar_T126.xlsx`, `data/usu_individual_T126.xlsx`
- Pobreza continua: `data/poblacion-con-ingresos-por-debajo-linea-pobreza-eph-continua.csv`
- [datos.gob.ar](https://www.datos.gob.ar/) — series y datasets
- [INDEC bases EPH](https://www.indec.gob.ar/indec/web/Institucional-Indec-BasesDeDatos)
- [eph R package — diccionario y centroides aglomerados](https://ropensci.github.io/eph/)
- [pyeph](https://pyeph.readthedocs.io/)
- Semia: `backend/app/services/processors/socioeconomic_csv_processor.py`, [Feeds.md](./Feeds.md)
