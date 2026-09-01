"""Descarga INDEC vía pyeph y agregación EPH trimestral por aglomerado PBA."""
from __future__ import annotations

import os
from datetime import date
from typing import Any


def _configure_pyeph_cache() -> str:
    """pyeph escribe en {cwd}/pyeph/.db; /app suele ser bind-mount sin permiso de escritura."""
    import importlib

    cache_root = os.environ.get("PYEPH_CACHE_DIR", "/tmp")
    os.makedirs(cache_root, exist_ok=True)
    for module_name in ("pyeph.get._base_getter", "pyeph.get.getter"):
        try:
            getter_mod = importlib.import_module(module_name)
            getter_mod.MODULE_PATH = cache_root
            break
        except ImportError:
            continue
    return cache_root


_configure_pyeph_cache()

import pandas as pd
import pyeph
from pyeph.errors import NonExistentDBError

from services.eph_microdata_service import (
    PBA_AGLOMERADOS,
    _detect_eph_kind,
    _load_canastas,
    _read_eph_txt,
    _trimestre_fecha,
    _weighted_rate,
)


def _current_trimestre_candidates() -> list[tuple[int, int]]:
    today = date.today()
    year = today.year
    quarter = (today.month - 1) // 3 + 1
    candidates: list[tuple[int, int]] = []
    for _ in range(10):
        candidates.append((year, quarter))
        quarter -= 1
        if quarter < 1:
            quarter = 4
            year -= 1
    return candidates


def discover_latest_trimestre() -> tuple[int, int]:
    """Prueba trimestres hacia atrás hasta encontrar microdata disponible en pyeph/INDEC."""
    last_error: str | None = None
    for year, period in _current_trimestre_candidates():
        try:
            download_trimestre(year, period)
            return year, period
        except (NonExistentDBError, Exception) as exc:
            last_error = str(exc)
            continue
    raise RuntimeError(
        f"No se encontró un trimestre EPH descargable en pyeph/INDEC. Último error: {last_error}"
    )


def download_trimestre(year: int, period: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    hogar = pyeph.get(data="eph", year=year, period=period, base_type="hogar")
    individual = pyeph.get(data="eph", year=year, period=period, base_type="individual")
    return hogar, individual


def _load_canastas_for_period(ano: int, trimestre: int) -> pd.DataFrame:
    periodo = f"{ano}.{trimestre}"
    try:
        basket = pyeph.get(data="canastas")
        subset = basket[basket["periodo"] == periodo]
        if not subset.empty:
            grouped = subset.groupby("codigo", as_index=False).agg(
                {"year": "first", "trim": "first", "CBA": "mean", "CBT": "mean"}
            )
            rows = []
            for _, row in grouped.iterrows():
                rows.append(
                    {
                        "region_codigo": int(row["codigo"]),
                        "ano": int(row["year"]),
                        "trimestre": int(row["trim"]),
                        "cba": float(row["CBA"]),
                        "cbt": float(row["CBT"]),
                    }
                )
            return pd.DataFrame(rows)
    except Exception:
        pass
    csv_can = _load_canastas()
    period_rows = csv_can[(csv_can["ano"] == ano) & (csv_can["trimestre"] == trimestre)]
    if not period_rows.empty:
        return period_rows.groupby("region_codigo", as_index=False).agg(
            {"ano": "first", "trimestre": "first", "cba": "mean", "cbt": "mean"}
        )
    return csv_can


def _load_adulto_equivalente() -> pd.DataFrame:
    ae = pyeph.get(data="adulto-equivalente")
    col = "adequi" if "adequi" in ae.columns else "adulto_equivalente"
    return ae.rename(columns={col: "adequi"})[["CH04", "CH06", "adequi"]].copy()


def aggregate_trimestre(
    hogar: pd.DataFrame,
    individual: pd.DataFrame,
    pba_only: bool = True,
) -> dict[str, Any]:
    hogar_kind = _detect_eph_kind(list(hogar.columns))
    ind_kind = _detect_eph_kind(list(individual.columns))
    if hogar_kind != "hogar":
        return {"error": "El archivo hogar no parece usu_hogar (falta ITF/PONDIH)."}
    if ind_kind != "individual":
        return {"error": "El archivo individual no parece usu_individual (falta COMPONENTE/CH06)."}

    hogar = hogar[hogar["REALIZADA"] == 1].copy()
    if pba_only:
        hogar = hogar[hogar["AGLOMERADO"].isin(PBA_AGLOMERADOS)]
        individual = individual[individual["AGLOMERADO"].isin(PBA_AGLOMERADOS)]

    if hogar.empty:
        return {"error": "No hay hogares para los 5 aglomerados PBA en el archivo."}

    ano = int(hogar["ANO4"].iloc[0])
    trimestre = int(hogar["TRIMESTRE"].iloc[0])
    fecha_dato = _trimestre_fecha(ano, trimestre)

    # --- Pobreza por hogar (PONDIH) con canastas y UAE de pyeph ---
    ind_poverty = individual[["CODUSU", "NRO_HOGAR", "ANO4", "TRIMESTRE", "CH04", "CH06"]].copy()
    ind_poverty["CH06"] = pd.to_numeric(ind_poverty["CH06"], errors="coerce")
    ind_poverty["CH04"] = pd.to_numeric(ind_poverty["CH04"], errors="coerce")
    ae = _load_adulto_equivalente()
    ind_poverty = ind_poverty.merge(ae, on=["CH04", "CH06"], how="left")
    ind_poverty["adequi"] = ind_poverty["adequi"].fillna(0)

    adequi_hogar = (
        ind_poverty.groupby(["CODUSU", "NRO_HOGAR", "ANO4", "TRIMESTRE"], as_index=False)["adequi"]
        .sum()
        .rename(columns={"adequi": "adequi_hogar"})
    )

    hogar_p = hogar.merge(adequi_hogar, on=["CODUSU", "NRO_HOGAR", "ANO4", "TRIMESTRE"], how="left")
    canastas = _load_canastas_for_period(ano, trimestre)
    can_row = canastas[(canastas["ano"] == ano) & (canastas["trimestre"] == trimestre)]
    if can_row.empty:
        return {
            "error": (
                f"No hay canastas regionales para {ano} T{trimestre}. "
                "Actualiza pyeph o eph_canastas_regionales.csv"
            ),
        }

    can_by_region = can_row.groupby("region_codigo").agg({"cba": "first", "cbt": "first"})
    hogar_p["cba_hogar"] = hogar_p.apply(
        lambda r: can_by_region.loc[r["REGION"], "cba"] * r["adequi_hogar"]
        if r["REGION"] in can_by_region.index and pd.notna(r["adequi_hogar"])
        else None,
        axis=1,
    )
    hogar_p["cbt_hogar"] = hogar_p.apply(
        lambda r: can_by_region.loc[r["REGION"], "cbt"] * r["adequi_hogar"]
        if r["REGION"] in can_by_region.index and pd.notna(r["adequi_hogar"])
        else None,
        axis=1,
    )
    hogar_p["ITF"] = pd.to_numeric(hogar_p["ITF"], errors="coerce")
    hogar_p["PONDIH"] = pd.to_numeric(hogar_p["PONDIH"], errors="coerce").fillna(0)

    hogar_valid = hogar_p[
        (hogar_p["PONDIH"] > 0) & hogar_p["cba_hogar"].notna() & hogar_p["cbt_hogar"].notna()
    ].copy()
    mask_i = hogar_valid["ITF"] < hogar_valid["cba_hogar"]
    mask_p = (hogar_valid["ITF"] >= hogar_valid["cba_hogar"]) & (hogar_valid["ITF"] < hogar_valid["cbt_hogar"])
    hogar_valid["situacion"] = "no_pobre"
    hogar_valid.loc[mask_i, "situacion"] = "indigente"
    hogar_valid.loc[mask_p, "situacion"] = "pobre"

    poverty_by_agl: dict[int, dict[str, float]] = {}
    for agl, grp in hogar_valid.groupby("AGLOMERADO"):
        w = grp["PONDIH"]
        total = w.sum()
        if total <= 0:
            continue
        indig = w[grp["situacion"] == "indigente"].sum() / total * 100
        pobre = w[grp["situacion"].isin(["pobre", "indigente"])].sum() / total * 100
        poverty_by_agl[int(agl)] = {
            "indigencia_eph_pct": round(indig, 4),
            "pobreza_eph_pct": round(pobre, 4),
        }

    # --- Mercado laboral: desempleo vía pyeph; ocupación/informalidad manual ---
    ind_lab = individual.copy()
    ind_lab["CH06"] = pd.to_numeric(ind_lab["CH06"], errors="coerce")
    ind_lab["PONDERA"] = pd.to_numeric(ind_lab["PONDERA"], errors="coerce").fillna(0)
    ind_lab["ESTADO"] = pd.to_numeric(ind_lab["ESTADO"], errors="coerce")
    if "EMPLEO" in ind_lab.columns:
        ind_lab["EMPLEO"] = pd.to_numeric(ind_lab["EMPLEO"], errors="coerce")
    else:
        ind_lab["EMPLEO"] = pd.NA
    ind_lab = ind_lab[ind_lab["CH06"] >= 14]

    labor_by_agl: dict[int, dict[str, float | None]] = {}
    try:
        ml = pyeph.LaborMarket(ind_lab)
        desemp_df = ml.desempleo(group_by=["AGLOMERADO"], div_por="PET")
        for agl, row in desemp_df.iterrows():
            labor_by_agl[int(agl)] = {"desempleo_eph_pct": round(float(row["Tasa de Desempleo"]), 4)}
    except Exception:
        pass

    for agl, grp in ind_lab.groupby("AGLOMERADO"):
        activos = grp[grp["ESTADO"].isin([1, 2])]
        desocup = _weighted_rate(activos, activos["ESTADO"] == 2, "PONDERA")
        ocup = _weighted_rate(activos, activos["ESTADO"] == 1, "PONDERA")
        ocupados = grp[grp["ESTADO"] == 1]
        informal = _weighted_rate(ocupados, ocupados["EMPLEO"] == 2, "PONDERA")
        entry = labor_by_agl.setdefault(int(agl), {})
        if "desempleo_eph_pct" not in entry:
            entry["desempleo_eph_pct"] = desocup
        entry["ocupacion_eph_pct"] = ocup
        entry["informalidad_eph_pct"] = informal

    staging_rows: list[dict[str, Any]] = []
    all_agl = sorted(set(poverty_by_agl.keys()) | set(labor_by_agl.keys()))
    for agl in all_agl:
        merged: dict[str, float | None] = {}
        merged.update(poverty_by_agl.get(agl, {}))
        merged.update(labor_by_agl.get(agl, {}))
        for indicador, valor in merged.items():
            if valor is None:
                continue
            staging_rows.append(
                {
                    "aglomerado_cod": agl,
                    "indicador_clave": indicador,
                    "fecha_dato": fecha_dato,
                    "valor": valor,
                }
            )

    return {
        "inserted": len(staging_rows),
        "skipped": 0,
        "periodo": f"{ano}-T{trimestre}",
        "fecha_dato": fecha_dato.isoformat(),
        "indicadores": sorted({r["indicador_clave"] for r in staging_rows}),
        "aglomerados": all_agl,
        "staging_preview": staging_rows,
        "motor": "pyeph",
    }


def aggregate_eph_trimestre_bytes(
    hogar_content: bytes,
    individual_content: bytes,
    pba_only: bool = True,
) -> dict[str, Any]:
    hogar = _read_eph_txt(hogar_content)
    individual = _read_eph_txt(individual_content)
    return aggregate_trimestre(hogar, individual, pba_only=pba_only)


def download_and_aggregate_latest(pba_only: bool = True) -> dict[str, Any]:
    last_error: str | None = None
    for year, period in _current_trimestre_candidates():
        try:
            hogar, individual = download_trimestre(year, period)
            result = aggregate_trimestre(hogar, individual, pba_only=pba_only)
            if result.get("error"):
                last_error = result["error"]
                continue
            result["source"] = f"INDEC/pyeph {year}-T{period}"
            return result
        except (NonExistentDBError, Exception) as exc:
            last_error = str(exc)
            continue
    raise RuntimeError(
        f"No se pudo descargar ni agregar un trimestre EPH reciente. Último error: {last_error}"
    )
