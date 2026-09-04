"""Carga catálogo EPH y pesos aglomerado→partido desde CSV o fallback embebido."""
import asyncio
import csv
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, func, select

from database import AsyncSessionLocal
import models

_script = Path(__file__).resolve()
REF_CANDIDATES = [
    Path("/data/reference"),
    Path("/app/static/reference"),  # embebido en imagen Docker
    _script.parent.parent / "static" / "reference",
]
for depth in (3, 2):
    try:
        REF_CANDIDATES.append(_script.parents[depth] / "data" / "reference")
    except IndexError:
        pass

# Fallback si no hay CSV en la imagen (p. ej. deploy anterior a incluir reference/)
_FALLBACK_AGLOMERADOS = [
    {"codigo": 33, "nombre": "Partidos del Gran Buenos Aires", "region_macro": 1},
    {"codigo": 2, "nombre": "Gran La Plata", "region_macro": 43},
    {"codigo": 34, "nombre": "Mar del Plata-Batan", "region_macro": 43},
    {"codigo": 3, "nombre": "Bahia Blanca-Cerri", "region_macro": 43},
    {"codigo": 38, "nombre": "San Nicolas-Villa Constitucion", "region_macro": 43},
]

_GBA_PARTIDOS = [
    "Almirante Brown",
    "Avellaneda",
    "Berazategui",
    "Escobar",
    "Esteban Echeverría",
    "Ezeiza",
    "Florencio Varela",
    "General San Martín",
    "Hurlingham",
    "Ituzaingó",
    "José C. Paz",
    "La Matanza",
    "Lanús",
    "Lomas de Zamora",
    "Malvinas Argentinas",
    "Merlo",
    "Moreno",
    "Morón",
    "Presidente Perón",
    "Quilmes",
    "San Fernando",
    "San Isidro",
    "San Miguel",
    "San Vicente",
    "Tigre",
    "Tres de Febrero",
    "Vicente López",
]
_GBA_PESO = Decimal("1") / Decimal(len(_GBA_PARTIDOS))

_FALLBACK_PESOS = (
    [
        {"aglomerado_cod": 3, "partido_nombre": "Bahía Blanca", "peso": Decimal("1"), "fuente": "fallback v1"},
        {
            "aglomerado_cod": 34,
            "partido_nombre": "General Pueyrredón",
            "peso": Decimal("1"),
            "fuente": "fallback v1",
        },
        {"aglomerado_cod": 38, "partido_nombre": "San Nicolás", "peso": Decimal("1"), "fuente": "fallback v1"},
        {"aglomerado_cod": 2, "partido_nombre": "La Plata", "peso": Decimal("0.5"), "fuente": "fallback v1"},
        {"aglomerado_cod": 2, "partido_nombre": "Berisso", "peso": Decimal("0.25"), "fuente": "fallback v1"},
        {"aglomerado_cod": 2, "partido_nombre": "Ensenada", "peso": Decimal("0.25"), "fuente": "fallback v1"},
    ]
    + [
        {
            "aglomerado_cod": 33,
            "partido_nombre": nombre,
            "peso": _GBA_PESO,
            "fuente": "fallback v1 GBA pesos iguales",
        }
        for nombre in _GBA_PARTIDOS
    ]
)


def _resolve_ref_dir() -> Path | None:
    for candidate in REF_CANDIDATES:
        if (candidate / "aglomerados_eph_pba.csv").is_file():
            return candidate
    return None


def _load_aglomerados_rows() -> list[dict]:
    ref = _resolve_ref_dir()
    if not ref:
        return list(_FALLBACK_AGLOMERADOS)
    rows = []
    with (ref / "aglomerados_eph_pba.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(
                {
                    "codigo": int(row["codigo"]),
                    "nombre": row["nombre"],
                    "region_macro": int(row["region_macro"]) if row.get("region_macro") else None,
                }
            )
    return rows


def _load_peso_rows() -> list[dict]:
    ref = _resolve_ref_dir()
    if not ref or not (ref / "aglomerado_partido_pesos.csv").is_file():
        return list(_FALLBACK_PESOS)
    rows = []
    with (ref / "aglomerado_partido_pesos.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(
                {
                    "aglomerado_cod": int(row["aglomerado_cod"]),
                    "partido_nombre": row["partido_nombre"].strip(),
                    "peso": Decimal(row["peso"]),
                    "fuente": row.get("fuente") or None,
                }
            )
    return rows


async def ensure_seeded(session) -> bool:
    """Si aglomerado_eph está vacío, carga catálogo + pesos. Retorna True si sembró."""
    count = await session.scalar(select(func.count()).select_from(models.AglomeradoEph))
    if count and count > 0:
        return False
    await seed(session)
    return True


async def seed(session) -> None:
    for row in _load_aglomerados_rows():
        existing = await session.get(models.AglomeradoEph, row["codigo"])
        if existing:
            existing.nombre = row["nombre"]
            existing.region_macro = row.get("region_macro")
        else:
            session.add(
                models.AglomeradoEph(
                    codigo=row["codigo"],
                    nombre=row["nombre"],
                    region_macro=row.get("region_macro"),
                )
            )

    await session.flush()

    await session.execute(delete(models.AglomeradoPartidoPeso))
    for row in _load_peso_rows():
        session.add(
            models.AglomeradoPartidoPeso(
                aglomerado_cod=row["aglomerado_cod"],
                partido_nombre=row["partido_nombre"],
                peso=row["peso"],
                fuente=row.get("fuente"),
            )
        )

    await session.commit()
    count_agl = await session.scalar(select(func.count()).select_from(models.AglomeradoEph))
    result = await session.execute(select(models.AglomeradoPartidoPeso))
    pesos = len(result.scalars().all())
    source = "CSV" if _resolve_ref_dir() else "fallback embebido"
    print(f"Seed EPH ({source}): {count_agl} aglomerados, {pesos} pesos partido cargados.")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
