"""Importa geometrías seed a dimension_geografica.

Orden: provincias → partidos (los partidos PBA quedan con parent_id =
provincia «Buenos Aires»). Idempotente por nombre; si un partido ya existe
sin padre, intenta enlazarlo.

En prod lo invoca el entrypoint al arrancar (mismo patrón que seed EPH).
"""
from __future__ import annotations

import json
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import Dimension_Geografica

STATIC_DIR = Path("/app/static")
# Fallback cuando se corre fuera del container (dev en host).
# scripts/ → app/ → backend/static
_HOST_STATIC = Path(__file__).resolve().parents[2] / "static"
if not (STATIC_DIR / "provincias.geojson").is_file() and (_HOST_STATIC / "provincias.geojson").is_file():
    STATIC_DIR = _HOST_STATIC

GEOJSON_FILES = (
    STATIC_DIR / "provincias.geojson",
    STATIC_DIR / "partidos.geojson",
)

PROVINCIA_PADRE_PARTIDOS = "Buenos Aires"


async def _get_by_nombre(session: AsyncSession, nombre: str) -> Dimension_Geografica | None:
    result = await session.execute(
        select(Dimension_Geografica).filter_by(nombre=nombre)
    )
    return result.scalar_one_or_none()


async def _count_nivel(session: AsyncSession, nivel: str) -> int:
    result = await session.execute(
        select(func.count()).select_from(Dimension_Geografica).where(
            Dimension_Geografica.nivel == nivel
        )
    )
    return int(result.scalar_one() or 0)


async def _import_file(
    session: AsyncSession,
    geojson_path: Path,
    *,
    parent_id_for_partido: int | None = None,
    verbose: bool = True,
) -> tuple[int, int, int]:
    """Devuelve (añadidos, omitidos, padres_actualizados)."""
    if verbose:
        print(f"Iniciando importación de GeoJSON desde: {geojson_path}")

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            geojson_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Archivo GeoJSON no encontrado en {geojson_path}")
        return 0, 0, 0
    except json.JSONDecodeError:
        print(f"Error: No se pudo decodificar el archivo GeoJSON en {geojson_path}")
        return 0, 0, 0

    added = 0
    skipped = 0
    linked = 0
    for feature in geojson_data.get("features") or []:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry")
        if not geometry:
            if verbose:
                print(f"Skipping feature sin geometría: {properties}")
            skipped += 1
            continue

        nombre = properties.get("nam") or properties.get("fna")
        nivel = properties.get("gna")

        if not nombre or not nivel:
            if verbose:
                print(f"Skipping feature due to missing 'nombre' or 'nivel': {properties}")
            skipped += 1
            continue

        parent_id = None
        if nivel == "Partido" and parent_id_for_partido is not None:
            parent_id = parent_id_for_partido

        existing = await _get_by_nombre(session, nombre)
        if existing:
            if (
                existing.nivel == "Partido"
                and existing.parent_id is None
                and parent_id is not None
            ):
                existing.parent_id = parent_id
                linked += 1
                if verbose:
                    print(f"Enlazado padre: '{nombre}' → id={parent_id}")
            else:
                if verbose:
                    print(f"Ya existe '{nombre}', omitiendo.")
            skipped += 1
            continue

        shapely_geometry = shape(geometry)
        session.add(
            Dimension_Geografica(
                nombre=nombre,
                nivel=nivel,
                parent_id=parent_id,
                geometria=from_shape(shapely_geometry, srid=4326),
            )
        )
        if verbose:
            print(
                f"Añadido: {nombre} ({nivel})"
                + (f" parent_id={parent_id}" if parent_id else "")
            )
        added += 1

    return added, skipped, linked


async def import_geojson_data(*, verbose: bool = True) -> None:
    async with AsyncSessionLocal() as session:
        n_prov = await _count_nivel(session, "Provincia")
        n_part = await _count_nivel(session, "Partido")
        if n_prov >= 24 and n_part > 0:
            # Puede faltar parent_id en partidos viejos: solo backfill de enlaces.
            provincia_ba = await _get_by_nombre(session, PROVINCIA_PADRE_PARTIDOS)
            linked = 0
            if provincia_ba:
                result = await session.execute(
                    select(Dimension_Geografica).where(
                        Dimension_Geografica.nivel == "Partido",
                        Dimension_Geografica.parent_id.is_(None),
                    )
                )
                for partido in result.scalars().all():
                    partido.parent_id = provincia_ba.id
                    linked += 1
            if linked:
                await session.commit()
                print(
                    f"[import_geojson] seed ya presente "
                    f"(provincias={n_prov}, partidos={n_part}); "
                    f"enlazados {linked} partidos sin padre."
                )
            else:
                print(
                    f"[import_geojson] seed ya presente "
                    f"(provincias={n_prov}, partidos={n_part}); nada que hacer."
                )
            return

        total_added = 0
        total_skipped = 0
        total_linked = 0

        added, skipped, linked = await _import_file(
            session, GEOJSON_FILES[0], verbose=verbose
        )
        total_added += added
        total_skipped += skipped
        total_linked += linked
        await session.flush()

        provincia_ba = await _get_by_nombre(session, PROVINCIA_PADRE_PARTIDOS)
        parent_id = provincia_ba.id if provincia_ba else None
        if parent_id:
            print(
                f"Partidos se enlazarán a provincia "
                f"'{PROVINCIA_PADRE_PARTIDOS}' (id={parent_id})."
            )
        else:
            print(
                f"WARN: no está la provincia '{PROVINCIA_PADRE_PARTIDOS}'; "
                "partidos se importan sin parent_id."
            )

        added, skipped, linked = await _import_file(
            session,
            GEOJSON_FILES[1],
            parent_id_for_partido=parent_id,
            verbose=verbose,
        )
        total_added += added
        total_skipped += skipped
        total_linked += linked

        await session.commit()
    print(
        f"Importación de GeoJSON completada. "
        f"Añadidos={total_added}, omitidos={total_skipped}, "
        f"padres_actualizados={total_linked}."
    )


if __name__ == "__main__":
    import asyncio

    asyncio.run(import_geojson_data(verbose=True))
