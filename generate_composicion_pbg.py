# -*- coding: utf-8 -*-
"""
Genera un CSV con la composición del PBG por sector (Primario, Industria,
Comercio/Servicios, Administración pública) en valores ABSOLUTOS por municipio.

Por qué un CSV aparte (no columnas del indicador_socioeconomico_municipios.csv):
el generic_csv_processor guarda las columnas distintas de `geography_identifier`
y `value_identifier` como `dimension_extra` (JSON pegado a cada hecho). Eso las
vuelve **metadatos de la métrica principal**, no métricas filtrables por rango
en el slider.

Si queremos que "Industria" o "Servicios" sean **métricas secundarias con su
propio slider de rango**, tienen que ser archivos separados donde el valor
absoluto del sector sea el `value_identifier`. El procesador genérico creará
una `Metrica` por `metric_name` del Procesador, y el frontend podrá aplicarle
un `RangeFilter` igual que al PBG total.

Formato de salida (largo, una fila por municipio×sector):
    seccion_nombre,anio,sector,valor
    La Matanza,2023,Primario,338988572
    La Matanza,2023,Industria,1356123456
    ...

Uso:
    python3 generate_composicion_pbg.py
"""

import csv
import random
from pathlib import Path
from typing import Dict

# Semilla independiente para que la composición sea estable por sí sola,
# pero pueda re-generarse sin tocar el socioeconómico.
random.seed(42)

ROOT = Path(__file__).parent
PBG_FILE = ROOT / "data" / "pbg_homologado.csv"
SOCIO_FILE = ROOT / "data" / "indicador_socioeconomico_municipios.csv"
OUT_FILE = ROOT / "data" / "composicion_pbg_por_municipio.csv"

ANIO = 2023

# Cargar PBG total por municipio.
pbg_total: Dict[str, int] = {}
with PBG_FILE.open(encoding="utf-8") as f:
    for row in csv.DictReader(f):
        nombre = row["seccion_nombre"].strip()
        try:
            pbg_total[nombre] = int(row["PBG_2023"])
        except (KeyError, ValueError):
            continue

# Cargar los % por sector ya generados (para no re-generar con semilla distinta).
porcentajes: Dict[str, Dict[str, float]] = {}
with SOCIO_FILE.open(encoding="utf-8") as f:
    for row in csv.DictReader(f):
        m = row["municipio"].strip()
        porcentajes[m] = {
            "Primario": float(row["Composicion_PBG_Primario_pct"]),
            "Industria": float(row["Composicion_PBG_Industria_pct"]),
            "Comercio": float(row["Composicion_PBG_Comercio_pct"]),
            "Admin": float(row["Composicion_PBG_Admin_pct"]),
        }

filas = []
for municipio, total in pbg_total.items():
    dist = porcentajes.get(municipio)
    if not dist:
        # El socioeconómico y el PBG pueden tener municipios levemente
        # desalineados. Si no hay perfil, le inventamos uno "promedio".
        primario = random.uniform(5.0, 25.0)
        industria = random.uniform(20.0, 35.0)
        comercio = 100.0 - primario - industria - random.uniform(15.0, 25.0)
        admin = 100.0 - primario - industria - comercio
        dist = {
            "Primario": primario,
            "Industria": industria,
            "Comercio": max(comercio, 5.0),
            "Admin": max(admin, 5.0),
        }
    for sector, pct in dist.items():
        valor = round(total * pct / 100.0, 2)
        filas.append({
            "seccion_nombre": municipio,
            "anio": ANIO,
            "sector": sector,
            "valor": valor,
        })

OUT_FILE.parent.mkdir(exist_ok=True)
with OUT_FILE.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["seccion_nombre", "anio", "sector", "valor"])
    writer.writeheader()
    writer.writerows(filas)

print(f"Generado {OUT_FILE} con {len(filas)} filas "
      f"({len(set(r['seccion_nombre'] for r in filas))} municipios x 4 sectores).")
print("\nMuestra:")
for r in filas[:8]:
    print(f"  {r['seccion_nombre']:<25} {r['sector']:<12} {r['valor']:>15,.0f}")