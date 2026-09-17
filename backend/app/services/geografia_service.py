
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from shapely.geometry import mapping
from shapely import wkb
from typing import Optional

from models import Dimension_Geografica, Hechos_Datos, Metricas
from schemas import GeografiaCreate, GeoDataRequest

async def _get_geografias_by_nivel_as_feature_collection(db: AsyncSession, nivel: Optional[str] = None) -> dict:
    """
    Retrieves geographies, optionally filtered by level, and formats them as a GeoJSON FeatureCollection.
    """
    query = select(Dimension_Geografica)
    if nivel:
        query = query.where(Dimension_Geografica.nivel == nivel)
    
    result = await db.execute(query)
    geografias = result.scalars().all()

    features = []
    for geo in geografias:
        if geo.geometria:
            # Convert WKBElement to Shapely geometry, then to GeoJSON dict
            shapely_geo = wkb.loads(bytes(geo.geometria.data))
            geojson_geometry = mapping(shapely_geo)

            features.append({
                "type": "Feature",
                "id": geo.id,
                "properties": {
                    "nombre": geo.nombre,
                    "nivel": geo.nivel,
                    "parent_id": geo.parent_id, # <-- AÑADIDO
                },
                "geometry": geojson_geometry,
            })

    return {
        "type": "FeatureCollection",
        "features": features,
    }

async def get_municipios_geojson(db: AsyncSession) -> dict:
    """
    Returns all 'Partido' level geographies as a GeoJSON FeatureCollection.
    """
    return await _get_geografias_by_nivel_as_feature_collection(db, nivel="Partido")


async def get_provincias_geojson(db: AsyncSession) -> dict:
    """Returns all 'Provincia' level geographies as a GeoJSON FeatureCollection."""
    return await _get_geografias_by_nivel_as_feature_collection(db, nivel="Provincia")


async def get_circuitos_geojson(db: AsyncSession) -> dict:
    """
    Returns all 'Circuito' level geographies as a GeoJSON FeatureCollection.
    """
    return await _get_geografias_by_nivel_as_feature_collection(db, nivel="Circuito")

async def get_geografias_with_data(db: AsyncSession, request: GeoDataRequest) -> dict:
    """
    Retrieves geographies, joins them with aggregated data from Hechos_Datos,
    and formats them as a GeoJSON FeatureCollection.
    """
    # 1. Define la función de agregación
    if request.agregacion == 'avg':
        agg_func = func.avg(Hechos_Datos.valor)
    else: # Por defecto o si es 'sum'
        agg_func = func.sum(Hechos_Datos.valor)

    # 2. Query para obtener los datos agregados
    data_query = (
        select(
            Hechos_Datos.geografia_id,
            Metricas.nombre_clave,
            agg_func.label("valor_agregado")
        )
        .join(Metricas)
        .where(Hechos_Datos.archivo_id.in_(request.archivo_ids))
        .group_by(Hechos_Datos.geografia_id, Metricas.nombre_clave)
    )
    data_result = await db.execute(data_query)

    # 3. Estructura los datos para una búsqueda rápida: {geo_id: {metrica: valor, ...}}
    aggregated_data = {}
    for geo_id, metrica_clave, valor in data_result.all():
        if geo_id not in aggregated_data:
            aggregated_data[geo_id] = {}
        aggregated_data[geo_id][metrica_clave] = float(valor) if valor is not None else 0

    # 4. Obtiene todas las geografías base
    geo_query = select(Dimension_Geografica)
    geo_result = await db.execute(geo_query)
    geografias = geo_result.scalars().all()

    # 5. Construye el FeatureCollection final, inyectando los datos
    features = []
    for geo in geografias:
        if geo.geometria:
            shapely_geo = wkb.loads(bytes(geo.geometria.data))
            geojson_geometry = mapping(shapely_geo)

            properties = {
                "nombre": geo.nombre,
                "nivel": geo.nivel,
            }
            
            # Inyecta los datos agregados si existen para esta geografía
            if geo.id in aggregated_data:
                properties.update(aggregated_data[geo.id])

            features.append({
                "type": "Feature",
                "id": geo.id,
                "properties": properties,
                "geometry": geojson_geometry,
            })

    return {
        "type": "FeatureCollection",
        "features": features,
    }

async def create_new_geografia(geografia: GeografiaCreate, db: AsyncSession) -> Dimension_Geografica:
    """
    Creates a new Dimension_Geografica record.
    """
    db_geografia = Dimension_Geografica(
        nombre=geografia.nombre,
        nivel=geografia.nivel,
        parent_id=geografia.parent_id
    )
    db.add(db_geografia)
    await db.commit()
    await db.refresh(db_geografia)
    return db_geografia

async def get_all_geografias(db: AsyncSession) -> list[Dimension_Geografica]:
    """
    Retrieves all Dimension_Geografica records.
    """
    query = select(Dimension_Geografica)
    result = await db.execute(query)
    geografias = result.scalars().all()
    return geografias
