"""Agregación EPH trimestral (usu_hogar + usu_individual TXT) → indicadores por aglomerado."""
from __future__ import annotations

import csv
import io
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

PBA_AGLOMERADOS = {33, 2, 34, 3, 38}

EPH_INDICATORS: dict[str, dict[str, Any]] = {
    "pobreza_eph_pct": {
        "nombre_amigable": "Pobreza EPH (%)",
        "tipo": "ECONOMICA",
        "descripcion": "Hogares bajo línea de pobreza (pobre + indigente), PONDIH",
    },
    "indigencia_eph_pct": {
        "nombre_amigable": "Indigencia EPH (%)",
        "tipo": "ECONOMICA",
        "descripcion": "Hogares bajo línea de indigencia (CBA), PONDIH",
    },
    "desempleo_eph_pct": {
        "nombre_amigable": "Desempleo EPH (%)",
        "tipo": "ECONOMICA",
        "descripcion": "Desocupados / (ocupados + desocupados), PONDERA, 14+",
    },
    "ocupacion_eph_pct": {
        "nombre_amigable": "Ocupación EPH (%)",
        "tipo": "ECONOMICA",
        "descripcion": "Ocupados / (ocupados + desocupados), PONDERA, 14+",
    },
    "informalidad_eph_pct": {
        "nombre_amigable": "Informalidad EPH (%)",
        "tipo": "ECONOMICA",
        "descripcion": "Ocupados informales / ocupados, PONDERA",
    },
}


def _ref_candidates(filename: str) -> list[Path]:
    script = Path(__file__).resolve()
    candidates: list[Path] = [
        Path(f"/data/reference/{filename}"),
        Path(f"/app/static/reference/{filename}"),
        script.parent.parent / "static" / "reference" / filename,
    ]
    for depth in (3, 2):
        try:
            candidates.append(script.parents[depth] / "data" / "reference" / filename)
        except IndexError:
            pass
    return candidates


def _resolve_ref(filename: str) -> Path:
    for path in _ref_candidates(filename):
        if path.is_file():
            return path
    raise FileNotFoundError(f"No se encontró {filename} en referencia EPH")


def _read_eph_txt(content: bytes) -> pd.DataFrame:
    text = content.decode("latin-1")
    return pd.read_csv(io.StringIO(text), sep=";", low_memory=False)


def _detect_eph_kind(columns: list[str]) -> str | None:
    cols = {c.upper().strip() for c in columns}
    if "CODUSU" in cols and "COMPONENTE" in cols and "CH06" in cols:
        return "individual"
    if "CODUSU" in cols and "ITF" in cols and "REALIZADA" in cols:
        return "hogar"
    return None


def _trimestre_fecha(ano: int, trimestre: int) -> date:
    month = {1: 1, 2: 4, 3: 7, 4: 10}.get(int(trimestre), 1)
    return date(int(ano), month, 1)


def _load_canastas() -> pd.DataFrame:
    path = _resolve_ref("eph_canastas_regionales.csv")
    rows = []
    with path.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if not row.get("region_codigo"):
                continue
            rows.append(
                {
                    "region_codigo": int(row["region_codigo"]),
                    "ano": int(row["ano"]),
                    "trimestre": int(row["trimestre"]),
                    "cba": float(row["cba"]),
                    "cbt": float(row["cbt"]),
                }
            )
    return pd.DataFrame(rows)


def _weighted_rate(df: pd.DataFrame, mask: pd.Series, weight_col: str) -> float | None:
    weights = df[weight_col].fillna(0)
    total = weights.sum()
    if total <= 0:
        return None
    return round(float(weights[mask].sum() / total) * 100, 4)


def aggregate_eph_trimestre(
    hogar_content: bytes,
    individual_content: bytes,
    pba_only: bool = True,
) -> dict:
    """Agrega microdatos TXT; motor pyeph (canastas UAE oficiales + descarga INDEC)."""
    from services.pyeph_adapter import aggregate_eph_trimestre_bytes

    return aggregate_eph_trimestre_bytes(hogar_content, individual_content, pba_only=pba_only)
