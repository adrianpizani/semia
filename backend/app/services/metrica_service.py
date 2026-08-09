# services/metrica_service.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, cast, String
from collections import defaultdict
from typing import List, Optional

from models import Metricas, Hechos_Datos, Dimension_Geografica, TipoMetrica
from sqlalchemy import func, distinct
import schemas # Importar schemas

def _apply_filtros(query, filtros):
    """
    Aplica una lista de filtros a una query de Hechos_Datos:
      - 'categoria': filtra por un valor de una dimensión de `dimension_extra`
        (partido -> agrupacion_nombre, o año / votos_tipo según `filtro.dimension`).
      - 'rango': filtra por valor numérico.
    """
    if not filtros:
        return query
    for filtro in filtros:
        if filtro.tipo == "categoria":
            dimension = getattr(filtro, "dimension", "agrupacion_nombre")
            query = query.where(Hechos_Datos.dimension_extra[dimension].as_string().in_(filtro.valores))
        elif filtro.tipo == "rango":
            query = query.where(Hechos_Datos.valor.between(filtro.rango[0], filtro.rango[1]))
    return query

async def get_all_metrics(db: AsyncSession) -> list[schemas.Metrica]:
    """
    Recupera todas las métricas de la base de datos, incluido su archivo de origen relacionado,
    y las convierte explícitamente a esquemas Pydantic.
    """
    query = select(Metricas).options(selectinload(Metricas.archivo))
    result = await db.execute(query)
    db_metrics = result.scalars().unique().all()

    metrics_schemas = []
    for db_metric in db_metrics:
        archivo_schema = schemas.ArchivoForMetrica.from_orm(db_metric.archivo) if db_metric.archivo else None
        metrics_schemas.append(schemas.Metrica(
            id=db_metric.id,
            nombre_amigable=db_metric.nombre_amigable,
            is_active=db_metric.is_active,
            tipo=TipoMetrica(db_metric.tipo),
            archivo=archivo_schema
        ))
    return metrics_schemas

async def toggle_metric_status(db: AsyncSession, metric_id: int) -> schemas.Metrica | None:
    """
    Busca una métrica por su ID y cambia su estado booleano 'is_active'.
    """
    result = await db.execute(
        select(Metricas).options(selectinload(Metricas.archivo)).where(Metricas.id == metric_id)
    )
    metric = result.scalars().first()
    
    if metric:
        metric.is_active = not metric.is_active
        await db.commit()
        await db.refresh(metric)

        return schemas.Metrica.from_orm(metric)
    
    return None

async def get_electoral_metric_data(db: AsyncSession, metric_id: int, filtros: Optional[List[schemas.AnyFiltro]] = None):
    """
    Recupera datos para una métrica electoral, agrupados por geografía y partido, con filtros opcionales.
    """
    filtros = filtros or []

    # Filtros que modifican el conteo de votos (año, votos_tipo, rango) -> cambian el ganador.
    count_filters = [
        f for f in filtros
        if not (f.tipo == "categoria" and getattr(f, "dimension", "agrupacion_nombre") == "agrupacion_nombre")
    ]
    # Filtro de partido: restringe qué municipios se muestran (no cambia el color por ganador).
    party_filters = [
        f for f in filtros
        if f.tipo == "categoria" and getattr(f, "dimension", "agrupacion_nombre") == "agrupacion_nombre"
    ]

    base_query = select(
        Hechos_Datos.geografia_id,
        Hechos_Datos.valor,
        Hechos_Datos.dimension_extra['agrupacion_nombre'].as_string().label("agrupacion_nombre")
    ).where(Hechos_Datos.metrica_id == metric_id)

    base_query = _apply_filtros(base_query, count_filters)

    if party_filters:
        geo_sub = (
            select(Hechos_Datos.geografia_id)
            .where(Hechos_Datos.metrica_id == metric_id)
            .distinct()
        )
        geo_sub = _apply_filtros(geo_sub, count_filters)
        for pf in party_filters:
            geo_sub = geo_sub.where(
                Hechos_Datos.dimension_extra['agrupacion_nombre'].as_string().in_(pf.valores)
            )
        geo_result = await db.execute(geo_sub)
        geo_ids = set(geo_result.scalars().all())
        if not geo_ids:
            return []
        base_query = base_query.where(Hechos_Datos.geografia_id.in_(geo_ids))

    hechos_con_agrupacion_cte = base_query.cte("hechos_con_agrupacion")

    stmt = (
        select(
            hechos_con_agrupacion_cte.c.geografia_id,
            Dimension_Geografica.nombre.label("geografia_nombre"),
            hechos_con_agrupacion_cte.c.agrupacion_nombre,
            func.sum(hechos_con_agrupacion_cte.c.valor).label("total_votos")
        )
        .join(Dimension_Geografica, hechos_con_agrupacion_cte.c.geografia_id == Dimension_Geografica.id)
        .group_by(
            hechos_con_agrupacion_cte.c.geografia_id,
            Dimension_Geografica.nombre,
            hechos_con_agrupacion_cte.c.agrupacion_nombre
        )
        .order_by(
            hechos_con_agrupacion_cte.c.geografia_id,
            func.sum(hechos_con_agrupacion_cte.c.valor).desc()
        )
    )

    result = await db.execute(stmt)
    rows = result.all()

    data_by_geo = defaultdict(lambda: {"resultados": []})
    for row in rows:
        geo_id = row.geografia_id
        if "nombre" not in data_by_geo[geo_id]:
            data_by_geo[geo_id]["nombre"] = row.geografia_nombre
        
        data_by_geo[geo_id]["resultados"].append({
            "partido": row.agrupacion_nombre,
            "votos": float(row.total_votos)
        })

    final_data = [
        {
            "geografia_id": geo_id, 
            "nombre": geo_data["nombre"], 
            "resultados": geo_data["resultados"],
            "ganador": geo_data["resultados"][0] if geo_data["resultados"] else None
        }
        for geo_id, geo_data in data_by_geo.items()
    ]

    return final_data

async def get_all_generic_data_for_metric(db: AsyncSession, metric_id: int, filtros: Optional[List[schemas.AnyFiltro]] = None) -> list[schemas.GenericData]:
    """
    Recupera todos los valores para una métrica genérica, con filtros opcionales.
    """
    stmt = (
        select(
            Hechos_Datos.geografia_id,
            Dimension_Geografica.nombre.label("geografia_nombre"),
            Hechos_Datos.metrica_id,
            Metricas.nombre_amigable.label("metrica_nombre"),
            Hechos_Datos.valor
        )
        .join(Dimension_Geografica, Hechos_Datos.geografia_id == Dimension_Geografica.id)
        .join(Metricas, Hechos_Datos.metrica_id == Metricas.id)
        .where(Hechos_Datos.metrica_id == metric_id)
    )

    stmt = _apply_filtros(stmt, filtros)

    result = await db.execute(stmt)
    rows = result.all()

    return [schemas.GenericData.from_orm(row) for row in rows]


async def get_metric_opciones(db: AsyncSession, metric_id: int) -> dict:
    """
    Devuelve las opciones disponibles de dimensiones para una métrica (partidos, años, tipos de voto),
    para poblar los selectores de filtro del frontend.
    """
    async def _distinct(campo: str) -> list[str]:
        query = (
            select(distinct(Hechos_Datos.dimension_extra[campo].as_string()))
            .where(Hechos_Datos.metrica_id == metric_id)
        )
        result = await db.execute(query)
        valores = [v for v in result.scalars().all() if v]
        # Orden natural: por longitud y luego alfabético (2017 < 2023, etc.)
        return sorted(valores, key=lambda x: (len(x), x))

    return {
        "partidos": await _distinct("agrupacion_nombre"),
        "años": await _distinct("año"),
        "votos_tipos": await _distinct("votos_tipo"),
    }
