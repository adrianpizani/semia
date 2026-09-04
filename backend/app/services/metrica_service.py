# services/metrica_service.py
from datetime import date
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


async def _geos_for_filter(db: AsyncSession, filtro: schemas.AnyFiltro) -> set[int]:
    """Devuelve los geografia_id que satisfacen un filtro sobre SU PROPIA métrica.

    Se usa para el CRUCE entre métricas: p. ej. un rango de PBG determina qué municipios
    se muestran en el mapa electoral (intersección de geografías).
    """
    query = (
        select(Hechos_Datos.geografia_id)
        .where(Hechos_Datos.metrica_id == filtro.metrica_id)
        .distinct()
    )
    if filtro.tipo == "categoria":
        dimension = getattr(filtro, "dimension", "agrupacion_nombre")
        query = query.where(Hechos_Datos.dimension_extra[dimension].as_string().in_(filtro.valores))
    elif filtro.tipo == "rango":
        query = query.where(Hechos_Datos.valor.between(filtro.rango[0], filtro.rango[1]))
    result = await db.execute(query)
    return set(result.scalars().all())

async def get_all_metrics(db: AsyncSession) -> list[schemas.Metrica]:
    """
    Recupera todas las métricas, con trimestre EPH vigente cuando aplica.
    """
    from services.eph_microdata_service import EPH_INDICATORS
    from services.feed_socio_service import fecha_to_periodo, get_or_create_feed_socio_config

    query = select(Metricas).options(selectinload(Metricas.archivo))
    result = await db.execute(query)
    db_metrics = result.scalars().unique().all()

    cfg = await get_or_create_feed_socio_config(db)
    trimestre_referencia = cfg.trimestre_referencia

    eph_claves = set(EPH_INDICATORS.keys())
    max_fecha_by_metric: dict[int, date | None] = {}
    if eph_claves:
        fecha_rows = await db.execute(
            select(
                Hechos_Datos.metrica_id,
                func.max(Hechos_Datos.fecha_dato),
            )
            .join(Metricas, Hechos_Datos.metrica_id == Metricas.id)
            .where(Metricas.nombre_clave.in_(eph_claves))
            .group_by(Hechos_Datos.metrica_id)
        )
        max_fecha_by_metric = {row[0]: row[1] for row in fecha_rows.all()}

    metrics_out: list[schemas.Metrica] = []
    for db_metric in db_metrics:
        metric = schemas.Metrica.model_validate(db_metric)
        if db_metric.nombre_clave not in eph_claves:
            metrics_out.append(metric)
            continue

        max_fecha = max_fecha_by_metric.get(db_metric.id)
        periodo_publicado = fecha_to_periodo(max_fecha) if max_fecha else None
        es_vigente = None
        if periodo_publicado and trimestre_referencia:
            es_vigente = periodo_publicado == trimestre_referencia

        metric.periodo_publicado = periodo_publicado
        metric.trimestre_referencia = trimestre_referencia
        metric.es_trimestre_vigente = es_vigente
        metrics_out.append(metric)

    return metrics_out

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

        return schemas.Metrica.model_validate(metric)
    
    return None


async def update_metric_scale(
    db: AsyncSession,
    metric_id: int,
    escala_rango: str | None,
) -> schemas.Metrica | None:
    result = await db.execute(
        select(Metricas).options(selectinload(Metricas.archivo)).where(Metricas.id == metric_id)
    )
    metric = result.scalars().first()
    if not metric:
        return None
    if metric.tipo not in (TipoMetrica.ECONOMICA, TipoMetrica.DEMOGRAFICA):
        return None
    metric.escala_rango = escala_rango
    await db.commit()
    await db.refresh(metric)
    return schemas.Metrica.model_validate(metric)


async def get_electoral_metric_data(db: AsyncSession, metric_id: int, filtros: Optional[List[schemas.AnyFiltro]] = None):
    """
    Recupera datos para una métrica electoral, agrupados por geografía y partido, con filtros opcionales.
    """
    filtros = filtros or []
    self_metric = metric_id

    # Filtros del PROPIO métrico que restringen las FILAS de votos (año, votos_tipo, rango)
    # -> cambian el ganador.
    count_filters = [
        f for f in filtros
        if f.metrica_id == self_metric
        and not (f.tipo == "categoria" and getattr(f, "dimension", "agrupacion_nombre") == "agrupacion_nombre")
    ]
    # Filtro de partido del propio métrico: restringe qué municipios se muestran.
    party_filters = [
        f for f in filtros
        if f.metrica_id == self_metric
        and f.tipo == "categoria" and getattr(f, "dimension", "agrupacion_nombre") == "agrupacion_nombre"
    ]
    # Filtros de OTROS métricos (CRUCE, p. ej. rango de PBG): restringen los municipios a
    # los que cumplen la condición en SU propia métrica (intersección de geografías).
    cross_filters = [f for f in filtros if f.metrica_id != self_metric]

    base_query = select(
        Hechos_Datos.geografia_id,
        Hechos_Datos.valor,
        Hechos_Datos.dimension_extra['agrupacion_nombre'].as_string().label("agrupacion_nombre")
    ).where(Hechos_Datos.metrica_id == self_metric)

    base_query = _apply_filtros(base_query, count_filters)

    # Conjunto de municipios que satisfacen TODOS los filtros de restricción
    # (partido del propio métrico + filtros de cruce de otros métricos).
    geo_sets = []
    if party_filters:
        for pf in party_filters:
            geo_sets.append(await _geos_for_filter(db, pf))
    for cf in cross_filters:
        geo_sets.append(await _geos_for_filter(db, cf))

    if geo_sets:
        intersection = geo_sets[0]
        for geo_set in geo_sets[1:]:
            intersection &= geo_set
        if not intersection:
            return []
        base_query = base_query.where(Hechos_Datos.geografia_id.in_(intersection))

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

async def get_serie_historica_for_geo(
    db: AsyncSession, metric_id: int, geografia_id: int
) -> schemas.SerieHistorica:
    """Serie histórica de una métrica ELECTORAL para una geografía puntual.

    Devuelve los votos agregados por (año, partido) ordenados por año asc.
    Pensada para alimentar una sparkline compacta en la card de Resultados.

    Solo aplica a métricas electorales: si no, devolvemos serie vacía.
    """
    stmt = (
        select(
            Hechos_Datos.dimension_extra['año'].as_string().label('anio'),
            Hechos_Datos.dimension_extra['agrupacion_nombre'].as_string().label('partido'),
            func.sum(Hechos_Datos.valor).label('votos'),
        )
        .where(
            Hechos_Datos.metrica_id == metric_id,
            Hechos_Datos.geografia_id == geografia_id,
        )
        .group_by('anio', 'partido')
        .order_by('anio')
    )
    result = await db.execute(stmt)
    rows = result.all()
    puntos = [
        schemas.SerieHistoricaPunto(anio=r.anio or '', partido=r.partido or '', votos=float(r.votos or 0))
        for r in rows
        if r.anio and r.partido
    ]
    return schemas.SerieHistorica(geografia_id=geografia_id, puntos=puntos)


async def get_all_generic_data_for_metric(db: AsyncSession, metric_id: int, filtros: Optional[List[schemas.AnyFiltro]] = None) -> list[schemas.GenericData]:
    """
    Recupera todos los valores para una métrica genérica, con filtros opcionales.

    Misma semántica de cruce que el electoral:
      - filtros de ESTA métrica (p. ej. rango propio) se aplican sobre `valor`
      - filtros de OTRAS métricas restringen por intersección de geografías
        (no se aplican sobre el valor de esta métrica)
    """
    filtros = filtros or []
    self_filters = [f for f in filtros if f.metrica_id == metric_id]
    cross_filters = [f for f in filtros if f.metrica_id != metric_id]

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

    from services.eph_microdata_service import EPH_INDICATORS

    metric_row = await db.get(Metricas, metric_id)
    if metric_row and metric_row.nombre_clave in EPH_INDICATORS:
        max_fecha = await db.execute(
            select(func.max(Hechos_Datos.fecha_dato)).where(Hechos_Datos.metrica_id == metric_id)
        )
        latest = max_fecha.scalar()
        if latest:
            stmt = stmt.where(Hechos_Datos.fecha_dato == latest)

    stmt = _apply_filtros(stmt, self_filters)

    if cross_filters:
        geo_sets = [await _geos_for_filter(db, cf) for cf in cross_filters]
        intersection = geo_sets[0]
        for geo_set in geo_sets[1:]:
            intersection &= geo_set
        if not intersection:
            return []
        stmt = stmt.where(Hechos_Datos.geografia_id.in_(intersection))

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
