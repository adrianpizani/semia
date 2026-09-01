"""Carga catálogo EPH y pesos aglomerado→partido desde data/reference/*.csv"""
import asyncio
import csv
from decimal import Decimal
from pathlib import Path

from sqlalchemy import delete, func, select

from database import AsyncSessionLocal
import models

_script = Path(__file__).resolve()
REF_CANDIDATES = [Path("/data/reference")]
for depth in (3, 2):
    try:
        REF_CANDIDATES.append(_script.parents[depth] / "data" / "reference")
    except IndexError:
        pass


def _resolve_ref_dir() -> Path:
    for candidate in REF_CANDIDATES:
        if (candidate / "aglomerados_eph_pba.csv").is_file():
            return candidate
    raise FileNotFoundError(f"Faltan CSV de referencia (buscado en {REF_CANDIDATES})")


async def seed(session) -> None:
    ref = _resolve_ref_dir()
    agl_path = ref / "aglomerados_eph_pba.csv"
    peso_path = ref / "aglomerado_partido_pesos.csv"

    with agl_path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            codigo = int(row["codigo"])
            existing = await session.get(models.AglomeradoEph, codigo)
            if existing:
                existing.nombre = row["nombre"]
                existing.region_macro = int(row["region_macro"]) if row.get("region_macro") else None
            else:
                session.add(
                    models.AglomeradoEph(
                        codigo=codigo,
                        nombre=row["nombre"],
                        region_macro=int(row["region_macro"]) if row.get("region_macro") else None,
                    )
                )

    await session.flush()

    await session.execute(delete(models.AglomeradoPartidoPeso))
    with peso_path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            session.add(
                models.AglomeradoPartidoPeso(
                    aglomerado_cod=int(row["aglomerado_cod"]),
                    partido_nombre=row["partido_nombre"].strip(),
                    peso=Decimal(row["peso"]),
                    fuente=row.get("fuente") or None,
                )
            )

    await session.commit()
    count_agl = await session.scalar(select(func.count()).select_from(models.AglomeradoEph))
    result = await session.execute(select(models.AglomeradoPartidoPeso))
    pesos = len(result.scalars().all())
    print(f"Seed EPH: {count_agl} aglomerados, {pesos} pesos partido cargados.")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await seed(session)


if __name__ == "__main__":
    asyncio.run(main())
