# Análisis tabular — plan de feature

Pantalla para leer el cruce de métricas **sin el mapa como protagonista**. El mapa arma el recorte; acá se lee, se ordena y se sigue construyendo.

Ruta: `/analisis`. No reemplaza `/graficos` (esa página sigue con mocks).

**Estado:** primera versión implementada (tabla + scatter + top 10 + receta compartida). Piso para un SQL visual más adelante, no el constructor.

---

## Relato

El cliente arma en el dashboard una selección (primaria, secundarias, año, partido, rangos) y quiere **pasar a una vista de datos**: tabla, gráficos, rankings. Ahí tiene que poder **seguir jugando** con métricas y filtros, no quedar congelado en lo que trajo del mapa.

Dos superficies, **una receta**:

| Superficie | Rol |
|------------|-----|
| `/` Dashboard | Descubrir en el mapa |
| `/analisis` | Leer el cruce (tabla + gráficos + rankings) |

Ida y vuelta. Si en análisis agregás PBG o cambiás el año, al volver al mapa se ve el mismo recorte.

---

## Arrastrar el recorte y seguir construyendo

**Costo: bajo.** No es una feature extra: es reutilizar lo que el dashboard ya hace.

Hoy la receta ya vive en `sessionStorage` (`semia.dashboard.view`):

- métrica primaria
- métricas secundarias
- filtros (partido, año, tipo de voto, rangos)

`/analisis` lee y escribe **la misma** receta. Arriba va el mismo `FilterBar`: tags, popover de secundarias, año, partido, sliders.

Eso cubre “pasar con la selección” **y** “una vez ahí, tener las otras variables”:

- Llegás con Diputados + Población + 2023.
- En análisis sumás PBG, sacás Población, cambiás de partido, movés un rango.
- La tabla, el scatter y los rankings se recalculan.
- Volvés al mapa: misma receta.

El pool de métricas es el de métricas **activas** (las mismas del dashboard), no un catálogo nuevo.

Lo que **no** hacemos: un constructor SQL (JOINs, group by, canvas de queries). Eso es otra feature, impacto alto, innecesario con ~135 partidos.

Metáfora que sí usamos (y se puede decirle al cliente):

| SQL | En la pantalla |
|-----|----------------|
| FROM municipios (Partido) | Cada fila es un partido |
| SELECT métricas | Cada tag es una columna |
| WHERE filtros | Año, tipo, partido, rango |
| ORDER BY | Click en el encabezado |

---

## Layout

Tabla a la **izquierda** (protagonista). A la **derecha**, apilados: scatter y un ranking. Abajo de la columna derecha (o bajo el scatter) espacio para un segundo bloque (p. ej. top/bottom de la columna ordenada).

```
[ FilterBar: primaria | partido | año | tipo | tags secundarias ]  [ Volver al mapa ]

+---------------------------+------------------------+
|                           | Scatter                |
| Tabla (scroll)            | (cruce X × % partido)  |
| Municipio | % / ganador   |                        |
| Secundarias + puesto      | Ranking top 10         |
| ordenable + buscar        | (según columna activa) |
+---------------------------+------------------------+
```

Proporción aproximada: tabla `flex-[3]`, columna de gráficos `flex-[2]` (parecido al dashboard, invertido: acá gana la tabla).

**Por qué este layout y no tabla full-width + scatter abajo:** el cliente pidió leer números y a la vez ver el cruce. La columna derecha no pelea con el scroll de 135 filas.

---

## Tabla (izquierda)

Una fila por municipio. Join en el cliente: datos electorales × métricas genéricas por `geografia_id`. APIs actuales (`POST /metricas/{id}/data` y `.../datos-genericos`). Sin endpoint nuevo.

Columnas:

- Municipio (búsqueda por nombre)
- Si hay partido elegido: **% de ese partido** (misma semántica que el scatter)
- Si no: **ganador** + su %
- Una columna por cada secundaria numérica: valor compacto + puesto `12 / 135` (1 = valor más alto)
- Click en encabezado: ordenar. La columna activa alimenta el ranking de la derecha

Vacío: sin primaria → “elegí una métrica acá o en el dashboard”. Sin secundarias → solo columnas electorales; el scatter no se muestra.

Click en fila: se resalta; el scatter usa el mismo `geografia_id`. Sin popup electoral.

---

## Derecha: gráficos y lectura

1. **Scatter** — reutilizar `CruceScatter`. X = secundaria (select si hay varias), Y = % del partido elegido o % del ganador. Click en punto = misma selección que la fila.

2. **Lectura del cruce** (reemplaza al Top 10): `r` + frase, n municipios, medianas, contraste 25% bajo vs alto en X, y 2–3 outliers (lejos de la tendencia). Click = misma selección.

---

## Cómo se entra

- Botón **Ver análisis** en el dashboard (deshabilitado sin métrica primaria).
- Ítem en el sidebar, junto a Dashboard.
- `/graficos` no se toca.

---

## Demo (5 minutos)

1. Mapa: Diputados + Población + un partido + un año.
2. Ver análisis: misma selección, tabla a la izquierda, scatter a la derecha.
3. Ordenar por población; el top 10 sigue esa columna.
4. Agregar PBG como tag: aparece columna. Sacar Población: se va columna y el scatter cambia el eje X.
5. Cambiar año: todo se recalcula.
6. Volver al mapa: el recorte sigue.

---

## SQL visual (pedido del cliente, fase posterior)

Esta entrega **no** es un canvas de JOINs. Es el equivalente operable: tags = SELECT, filtros = WHERE, orden = ORDER BY.

Cuando se retome el SQL visual, esta pantalla es el destino: las columnas de la tabla ya son el SELECT, y un builder podría solo **armar la receta** (`primary`, `secondaries`, `filters`) que `useDashboardView` ya consume. No hace falta un motor SQL aparte para 135 partidos.

---

## Qué se construyó (primera versión)

- `useDashboardView` — receta + fetches compartidos entre mapa y análisis.
- `/analisis` — FilterBar, tabla a la izquierda, scatter + top 10 a la derecha.
- CTA **Ver análisis** en el dashboard y link en el sidebar.

---

## Fuera de esta entrega

- Query builder visual / JOINs a mano
- `POST /metricas/cruzar` (Pearson en backend)
- Circuitos en la tabla
- Export Excel/PDF
- Mini-mapa en análisis
- Reescribir `/graficos`
- Comparador N municipios side-by-side
- Series 2017–2023 como columnas

---

## Impacto

**Medio-bajo.** Arrastrar y seguir filtrando es el FilterBar + la receta que ya existe. El layout izquierda/derecha es CSS. El ranking extra es un slice de la tabla ordenada.

El único trabajo “de verdad” es extraer el hook para no copiar 200 líneas de `page.tsx`, y armar la tabla.
