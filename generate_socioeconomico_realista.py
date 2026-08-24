# -*- coding: utf-8 -*-
"""
Genera un dataset socioeconómico realista para la demo de Semia.

Diferencias con generate_socioeconomico_csv.py (el original):
- Los indicadores socioeconómicos correlacionan con un perfil electoral implícito
  del municipio (centro/periferia, rico/pobre, AMBA/interior). Eso vuelve a la
  demo narrativamente coherente: "filtren por NBI > 20 y vean el mapa teñirse
  de un color".
- Se agregan dos columnas pensadas como CRUCES estrella con el mapa electoral:
    * PBG_per_capita: PBG_2023 / Poblacion_Total. Separa mejor por riqueza media
      que el PBG absoluto (que está distorsionado por partidos industriales grandes).
    * Composicion_PBG_Primario_pct: % del PBG que viene del sector primario.
      Cruza con "campo vs. fábrica", uno de los ejes clásicos del voto PBA.

Salida:
    data/indicador_socioeconomico_municipios.csv  (sobrescribe el mock plano)

Uso:
    python generate_socioeconomico_realista.py
"""

import csv
import random
from pathlib import Path
from typing import Dict

# Semilla fija -> mismo dataset en cada corrida (importante para demo reproducible).
random.seed(20260809)

# ----------------------------------------------------------------------------
# 1) Lista de municipios. Usamos el archivo canónico de la PBA.
# ----------------------------------------------------------------------------
ROOT = Path(__file__).parent
MUN_FILE = ROOT / "data" / "unique_municipalities.txt"
PBG_FILE = ROOT / "data" / "pbg_homologado.csv"
OUT_FILE = ROOT / "data" / "indicador_socioeconomico_municipios.csv"

with MUN_FILE.open(encoding="utf-8") as f:
    municipios = [line.strip() for line in f if line.strip()]

# ----------------------------------------------------------------------------
# 2) Cargar PBG_2023 desde el archivo homologado. El total absoluto lo conserva
#    el PBG ya cargado; acá derivamos per cápita y composición primaria.
# ----------------------------------------------------------------------------
pbg_por_municipio = {}  # type: Dict[str, int]
with PBG_FILE.open(encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        nombre = row["seccion_nombre"].strip()
        try:
            pbg = int(row["PBG_2023"])
        except (KeyError, ValueError):
            continue
        pbg_por_municipio[nombre] = pbg


# ----------------------------------------------------------------------------
# 3) Perfil electoral implícito de cada municipio.
#
#    No estamos modelando el voto real: estamos dibujando un "tipo" plausible
#    que arrastra correlaciones entre Poblacion / NBI / Desempleo / Ingreso /
#    Alfabetización. La idea es que los filtros socioeconómicos, al aplicarse
#    al mapa electoral, produzcan cambios visibles y narrativos.
#
#    Cuatro arquetipos:
#       AMBA_POPULAR    -> conurbano, Poblacion alta, NBI alto, Ingreso bajo.
#       INTERIOR_RICO   -> pueblo chico productor, Poblacion baja-media, NBI bajo,
#                          Ingreso medio-alto, Alfabetización alta.
#       CIUDAD_GRANDE   -> polos urbanos grandes, Poblacion alta, NBI medio,
#                          Ingreso medio-alto.
#       INTERIOR_POBRE  -> pueblo chico con atraso relativo, Poblacion baja,
#                          NBI alto, Ingreso bajo.
#
#    Cada municipio se asigna a UNO con probabilidades sesgadas (no uniforme):
#    - Si está en el AMBA (heurística: empieza con algunas sub-cadenas conocidas
#      o tiene Poblacion grande en el rango conurbano) -> AMBA_POPULAR.
#    - Si tiene PBG chico (< 250M) -> INTERIOR_RICO o INTERIOR_POBRE.
#    - El resto -> CIUDAD_GRANDE o INTERIOR según Poblacion.
# ----------------------------------------------------------------------------

# Subset manual de partidos del conurbano bonaerense (heurística, no exhaustiva).
# Sirve para anclar el arquetipo AMBA_POPULAR; los que no estén acá pero vivan
# en el AMBA caerán por Poblacion.
AMBA_PARTIDOS = {
    "Almirante Brown", "Avellaneda", "Berazategui", "Berisso", "Brandsen",
    "Campana", "Cañuelas", "Ensenada", "Escobar", "Esteban Echeverría",
    "Exaltación de la Cruz", "Ezeiza", "Florencio Varela", "General Las Heras",
    "General Rodríguez", "General San Martín", "Hurlingham", "Ituzaingó",
    "José C. Paz", "La Matanza", "Lanús", "Lomas de Zamora", "Luján",
    "Malvinas Argentinas", "Marcos Paz", "Merlo", "Moreno", "Morón",
    "Navarro", "Presidente Perón", "Pilar", "Quilmes", "San Fernando",
    "San Isidro", "San Miguel", "San Vicente", "Tigre", "Tres de Febrero",
    "Vicente López", "Zárate",
}

# Ciudades grandes / cabeceras regionales (no AMBA, pero sí urbanas).
CIUDADES_GRANDES = {
    "Bahía Blanca", "General Pueyrredón", "La Plata", "Mar del Plata",
    "Bahia Blanca",
}


def elegir_arquetipo(nombre: str, pbg_total: int) -> str:
    if nombre in AMBA_PARTIDOS:
        return "AMBA_POPULAR"
    if nombre in CIUDADES_GRANDES:
        return "CIUDAD_GRANDE"
    if pbg_total < 250_000_000:  # PBG chico -> interior
        # Decidir entre INTERIOR_RICO (70%) e INTERIOR_POBRE (30%).
        return "INTERIOR_RICO" if random.random() < 0.70 else "INTERIOR_POBRE"
    # PBG medio/alto y no es AMBA ni ciudad grande conocida -> presumimos cabecera
    # regional o polo agroindustrial rico.
    if pbg_total > 800_000_000:
        return "INTERIOR_RICO"
    return "CIUDAD_GRANDE"


# Distribuciones por arquetipo (min, max) para cada variable.
# Los rangos están calibrados para que el filtro "NBI > 20" produzca un cambio
# visible en el mapa cuando lo cruzamos con el voto.
PERFILES = {
    # Poblacion / Ingreso / NBI / Desempleo / Alfabetizacion / Primario_pct
    "AMBA_POPULAR":    dict(pop=(100_000, 1_500_000), ing=(60_000, 130_000),
                            nbi=(15.0, 35.0),    des=(6.0, 14.0),
                            alfa=(94.0, 98.5),   primario=(0.0, 8.0)),
    "INTERIOR_RICO":   dict(pop=(20_000, 250_000),  ing=(120_000, 280_000),
                            nbi=(3.0, 12.0),    des=(2.0, 6.0),
                            alfa=(97.5, 99.5),   primario=(35.0, 75.0)),
    "CIUDAD_GRANDE":   dict(pop=(200_000, 800_000), ing=(100_000, 220_000),
                            nbi=(8.0, 20.0),    des=(4.0, 10.0),
                            alfa=(96.5, 99.0),   primario=(3.0, 18.0)),
    "INTERIOR_POBRE":  dict(pop=(10_000, 90_000),   ing=(55_000, 110_000),
                            nbi=(18.0, 40.0),   des=(7.0, 16.0),
                            alfa=(92.0, 97.0),   primario=(20.0, 55.0)),
}


def gen_rango(rango):
    return random.uniform(*rango)


# ----------------------------------------------------------------------------
# 4) Composición del PBG por sector primario.
#
#    Modelamos 4 sectores: Primario (agro/ganadería/pesca/minería), Industria,
#    Comercio/Servicios, Administración pública/otros. La suma = 100%.
#
#    El % Primario lo sacamos del arquetipo (los INTERIOR_RICO tienen primario
#    alto). Los otros 3 se reparten el resto con pesos ligeramente distintos por
#    arquetipo:
#       - AMBA_POPULAR  -> mucho Comercio/Servicios, poca Industria.
#       - INTERIOR_RICO -> más Industria (agroindustria) que Ciudad.
#       - CIUDAD_GRANDE -> balanceado con predominio Servicios.
#       - INTERIOR_POBRE -> balanceado con ligero predominio primario.
# ----------------------------------------------------------------------------
PESOS_NO_PRIMARIO = {
    "AMBA_POPULAR":   {"industria": 0.20, "comercio": 0.55, "admin": 0.25},
    "INTERIOR_RICO":  {"industria": 0.45, "comercio": 0.40, "admin": 0.15},
    "CIUDAD_GRANDE":  {"industria": 0.30, "comercio": 0.50, "admin": 0.20},
    "INTERIOR_POBRE": {"industria": 0.25, "comercio": 0.45, "admin": 0.30},
}


def generar_fila(nombre: str) -> dict:
    pbg_total = pbg_por_municipio.get(nombre, 200_000_000)
    arq = elegir_arquetipo(nombre, pbg_total)
    p = PERFILES[arq]

    poblacion = random.randint(*[int(v) for v in p["pop"]])
    ingreso = round(gen_rango(p["ing"]), 2)
    nbi = round(gen_rango(p["nbi"]), 2)
    desempleo = round(gen_rango(p["des"]), 2)
    alfabetizacion = round(gen_rango(p["alfa"]), 2)

    pbg_per_capita = round(pbg_total / poblacion, 2)

    # Composición: primario del rango del arquetipo, el resto repartido por pesos.
    primario_pct = round(random.uniform(*p["primario"]), 2)
    if primario_pct > 100:
        primario_pct = 100.0
    restante = max(0.0, 100.0 - primario_pct)
    pesos = PESOS_NO_PRIMARIO[arq]
    industria_pct = round(restante * pesos["industria"], 2)
    comercio_pct = round(restante * pesos["comercio"], 2)
    admin_pct = round(restante - industria_pct - comercio_pct, 2)
    if admin_pct < 0:
        admin_pct = 0.0

    return {
        "municipio": nombre,
        "Poblacion_Total": poblacion,
        "Ingreso_Promedio": ingreso,
        "Tasa_Desempleo": desempleo,
        "Indice_NBI": nbi,
        "Tasa_Alfabetizacion": alfabetizacion,
        "PBG_per_capita": pbg_per_capita,
        "Composicion_PBG_Primario_pct": primario_pct,
        "Composicion_PBG_Industria_pct": industria_pct,
        "Composicion_PBG_Comercio_pct": comercio_pct,
        "Composicion_PBG_Admin_pct": admin_pct,
        "PBG_total_2023": pbg_total,
    }


# ----------------------------------------------------------------------------
# 5) Generar y guardar.
# ----------------------------------------------------------------------------
filas = [generar_fila(m) for m in municipios]

OUT_FILE.parent.mkdir(exist_ok=True)
with OUT_FILE.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
    writer.writeheader()
    writer.writerows(filas)

print(f"Generado {OUT_FILE} con {len(filas)} municipios.")
print("\nColumnas:")
for k in filas[0]:
    print(f"  {k}")