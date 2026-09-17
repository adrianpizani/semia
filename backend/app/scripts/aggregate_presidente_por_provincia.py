#!/usr/bin/env python3
"""Agrega resultados electorales a nivel provincia (distrito DINE).

Lee el CSV enorme de mesa (~1 GB / millones de filas) y escribe un CSV chico
listo para importar a Semia en capa Nacional (nivel Provincia).

Uso (desde la raíz del repo):

  python3 backend/app/scripts/aggregate_presidente_por_provincia.py

  python3 backend/app/scripts/aggregate_presidente_por_provincia.py \\
    --input data/2023_generales/2023_Generales/ResultadoElectorales_2023_Generales.csv \\
    --output data/2023_generales/presidente_2023_por_provincia.csv

Por defecto filtra cargo «PRESIDENTE Y VICE» y suma NATIVOS + EXTRANJEROS.
Los nombres de distrito coinciden con provincias.geojson / dimension_geografica.
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_INPUT = (
    REPO_ROOT
    / "data"
    / "2023_generales"
    / "2023_Generales"
    / "ResultadoElectorales_2023_Generales.csv"
)
DEFAULT_OUTPUT = REPO_ROOT / "data" / "2023_generales" / "presidente_2023_por_provincia.csv"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="CSV de resultados a mesa")
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV agregado por provincia")
    p.add_argument(
        "--cargo",
        default="PRESIDENTE Y VICE",
        help='Nombre de cargo a conservar (default: "PRESIDENTE Y VICE"). Usá "" para todos.',
    )
    p.add_argument(
        "--progress-every",
        type=int,
        default=500_000,
        help="Log cada N filas leídas (0 = silencio)",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    src: Path = args.input
    dst: Path = args.output
    cargo_filter: str | None = args.cargo.strip() or None

    if not src.is_file():
        print(f"ERROR: no existe el input: {src}", file=sys.stderr)
        return 1

    totals: dict[tuple[str, ...], int] = defaultdict(int)
    rows_read = 0
    rows_kept = 0
    t0 = time.perf_counter()

    print(f"Leyendo: {src}")
    print(f"Filtro cargo: {cargo_filter!r}" if cargo_filter else "Filtro cargo: (todos)")

    with src.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {
            "año",
            "eleccion_tipo",
            "distrito_id",
            "distrito_nombre",
            "cargo_id",
            "cargo_nombre",
            "agrupacion_id",
            "agrupacion_nombre",
            "votos_tipo",
            "votos_cantidad",
        }
        missing = required - set(reader.fieldnames or [])
        if missing:
            print(f"ERROR: faltan columnas: {sorted(missing)}", file=sys.stderr)
            return 1

        for row in reader:
            rows_read += 1
            if cargo_filter and (row.get("cargo_nombre") or "") != cargo_filter:
                if args.progress_every and rows_read % args.progress_every == 0:
                    elapsed = time.perf_counter() - t0
                    print(f"  … {rows_read:,} leídas | {rows_kept:,} útiles | {elapsed:.1f}s")
                continue

            try:
                votos = int(float(row["votos_cantidad"] or 0))
            except (TypeError, ValueError):
                continue

            key = (
                row.get("año") or "",
                row.get("eleccion_tipo") or "",
                row.get("distrito_id") or "",
                row.get("distrito_nombre") or "",
                row.get("cargo_id") or "",
                row.get("cargo_nombre") or "",
                row.get("agrupacion_id") or "",
                row.get("agrupacion_nombre") or "",
                row.get("votos_tipo") or "",
            )
            totals[key] += votos
            rows_kept += 1

            if args.progress_every and rows_read % args.progress_every == 0:
                elapsed = time.perf_counter() - t0
                print(
                    f"  … {rows_read:,} leídas | {rows_kept:,} útiles | "
                    f"{len(totals):,} claves | {elapsed:.1f}s"
                )

    dst.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "año",
        "eleccion_tipo",
        "distrito_id",
        "distrito_nombre",
        "cargo_id",
        "cargo_nombre",
        "agrupacion_id",
        "agrupacion_nombre",
        "votos_tipo",
        "votos_cantidad",
        # Alias: a nivel nacional la geografía es la provincia (= distrito DINE).
        "seccion_nombre",
    ]

    rows_out = sorted(
        totals.items(),
        key=lambda item: (item[0][3], item[0][8], item[0][7]),
    )

    with dst.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for key, votos in rows_out:
            (
                anio,
                eleccion_tipo,
                distrito_id,
                distrito_nombre,
                cargo_id,
                cargo_nombre,
                agrupacion_id,
                agrupacion_nombre,
                votos_tipo,
            ) = key
            writer.writerow(
                {
                    "año": anio,
                    "eleccion_tipo": eleccion_tipo,
                    "distrito_id": distrito_id,
                    "distrito_nombre": distrito_nombre,
                    "cargo_id": cargo_id,
                    "cargo_nombre": cargo_nombre,
                    "agrupacion_id": agrupacion_id,
                    "agrupacion_nombre": agrupacion_nombre,
                    "votos_tipo": votos_tipo,
                    "votos_cantidad": votos,
                    "seccion_nombre": distrito_nombre,
                }
            )

    elapsed = time.perf_counter() - t0
    size_kb = dst.stat().st_size / 1024
    print()
    print(f"Listo en {elapsed:.1f}s")
    print(f"  Filas leídas:     {rows_read:,}")
    print(f"  Filas del cargo:  {rows_kept:,}")
    print(f"  Filas agregadas:  {len(rows_out):,}")
    print(f"  Output:           {dst} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
