# Contexto Semia — preparar archivos para cargar

Usá este documento para generar archivos CSV listos para subir en **Semia → Archivos**, o para decidir cuándo **no** conviene usar esa pantalla (por ejemplo, con datos EPH crudos).

## Qué fuente va a qué nivel

| Fuente | Cómo tratarla |
|--------|----------------|
| **EPH** | Contexto urbano por **aglomerado**. En Semia va por **Feed APIs**, no inventes desagregación a partido/radio. |
| **Censo, empleo registrado u otros** | Traé el indicador **ya agregado** al nivel que Archivos acepta hoy: **Provincia** (nacional) o **Partido** (PBA). |
| **Radio censal / departamento del resto del país** | **Todavía no.** Archivos no tiene esos niveles cargados; no armes CSV a radio ni a departamento nacional. |

El match geográfico hoy es por **nombre** (como en este documento), no por código INDEC. Si el origen trae código, convertí a nombre Semia; el código puede ir como columna extra, no como geografía.

---

## Formato para Archivos

- El archivo debe ser **CSV**, no Excel (`.xlsx`).
- Codificación: **UTF-8**. Evitá el BOM (marca invisible al inicio del archivo que a veces agrega Excel u otras herramientas).
- Separador de columnas: **coma** (`,`).
- Separador decimal: **punto** (`12.5`). No uses coma decimal (`12,5`).
- Cada fila representa **una unidad geográfica** (un partido o una provincia).
- Por cada archivo o métrica debe haber **una sola columna con el valor numérico**.
- Debe haber **una columna con el nombre** de esa geografía, escrito como lo espera Semia.

Al subir el archivo en Semia se elige el **nivel geográfico** del procesador. Ese nivel tiene que coincidir con lo que trae la columna de geografía: **Partido**, **Provincia** o **Circuito**.

---

## Ámbito PBA (partido / municipio)

Ejemplo:

```csv
partido,valor,anio
La Matanza,42.5,2024
Veinticinco de Mayo,18.0,2024
Nueve de Julio,9.2,2024
```

- En Semia, el nivel del procesador debe ser **Partido**.
- Algunos nombres frecuentes no coinciden con los de Semia. Usá siempre la forma de la columna derecha:

| No uses | Usá en Semia |
|---------|--------------|
| 25 de Mayo | Veinticinco de Mayo |
| 9 de Julio | Nueve de Julio |
| Adolfo González Chaves | Adolfo Gonzales Chaves |

---

## Ámbito nacional (provincia)

Si la métrica es de **cobertura nacional** (una fila por provincia, incluida CABA), el nivel del procesador debe ser **Provincia**.

Ejemplo:

```csv
provincia,valor,anio
Buenos Aires,38.2,2024
Ciudad Autónoma de Buenos Aires,22.1,2024
Córdoba,31.0,2024
Santa Fe,29.4,2024
```

Usá **exactamente** estos nombres de provincia:

Buenos Aires · Catamarca · Chaco · Chubut · Ciudad Autónoma de Buenos Aires · Corrientes · Córdoba · Entre Ríos · Formosa · Jujuy · La Pampa · La Rioja · Mendoza · Misiones · Neuquén · Río Negro · Salta · San Juan · San Luis · Santa Cruz · Santa Fe · Santiago del Estero · Tierra del Fuego, Antártida e Islas del Atlántico Sur · Tucumán

Importante:

- No uses abreviaciones como “CABA”, “Bs As” o “Capital Federal”. Tampoco uses códigos INDEC (`06`, `02`) **como** columna de geografía: hoy Semia matchea por nombre; el código, si lo tenés, va como columna extra.
- Un mismo CSV no puede mezclar provincias y partidos: o todas las filas son provincias, o todas son partidos.
- En el mapa de Semia, el modo nacional muestra provincias; el modo PBA muestra partidos.

---

## EPH / INDEC

Semia ya incluye un conector EPH en **Feed APIs → Socioeconómico**. Ese flujo toma microdatos trimestrales, calcula indicadores por aglomerado de PBA y los publica a nivel partido.

| Situación | Qué hacer |
|-----------|-----------|
| Quieren pobreza, desempleo u otros indicadores EPH de PBA como ya los muestra Semia | **No** armes un CSV para Archivos. Usá **Feed APIs → Socioeconómico** (descarga automática o carga del TXT oficial de INDEC). |
| Ya tienen un indicador EPH o INDEC **resumido** (por ejemplo, un porcentaje por provincia o por partido) | Prepará un CSV según este documento (nivel Provincia o Partido) y subilo por **Archivos**. |
| Tienen los microdatos crudos `usu_hogar` / `usu_individual` | **No** los subas por Archivos. Si hace falta un indicador propio, primero hay que **agregar** los microdatos y entregar solo el CSV resumido. |

Si transformás EPH a CSV para Archivos:

1. Definí el corte geográfico: **Provincia** (nacional) o **Partido** (PBA).
2. Un archivo por métrica (por ejemplo `pobreza_pct` o `desempleo_pct`).
3. El valor debe ser numérico y claro (porcentaje o tasa). Dejá la unidad indicada en el nombre de la métrica.
4. Si aplica, agregá una columna extra `periodo` o `anio`.
5. No uses nombres de aglomerado (“GBA”, “Gran La Plata”) como geografía: Archivos no los reconoce.

Ejemplo de EPH ya resumido a nivel nacional:

```csv
provincia,pobreza_pct,periodo
Buenos Aires,45.1,2024-T1
Ciudad Autónoma de Buenos Aires,28.3,2024-T1
Córdoba,39.0,2024-T1
```

Al cargar ese archivo: la métrica es la columna `pobreza_pct` y el nivel geográfico es **Provincia**.

---

## Qué no hacer

- Poner varias métricas en columnas distintas en el mismo CSV (salvo que luego se carguen por separado, una métrica por vez).
- Usar separador `;`, tabulaciones, o Excel (`.xlsx`) en Archivos.
- Subir microdatos EPH crudos por Archivos.
- Usar geografías informales (“GBA”, “AMBA”, “Interior”) o códigos INDEC como única clave geográfica.
- Mezclar provincias y partidos en el mismo archivo.
- Preparar CSV a nivel radio censal o departamento fuera de PBA (aún no soportado en Archivos).

---

## Checklist antes de entregar

1. El archivo está en UTF-8, con coma como separador y punto decimal.
2. Los nombres de columna son claros y no cambian entre versiones del archivo.
3. El nivel geográfico es claro: **Partido** (PBA) o **Provincia** (nacional).
4. Los nombres de geografía coinciden con Semia (tablas de este documento).
5. Hay una sola columna de valor; el resto son geografía o datos extra (año, período, etc.).
6. No hay celdas vacías ni textos como `undefined` en la columna de valor.
7. Si es EPH crudo → no va por Archivos. Si es EPH ya resumido → CSV según este documento.
