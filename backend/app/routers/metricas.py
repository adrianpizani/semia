# routers/metricas.py
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

import schemas
from database import get_db
from services import metrica_service
from dependencies import get_current_user, require_admin

from models import TipoMetrica, Metricas as MetricasModel

router = APIRouter(prefix="/metricas", tags=["Metricas"])

@router.get("", response_model=List[schemas.Metrica])
async def get_all_metrics(
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Recupera una lista de todas las métricas disponibles.
    """
    return await metrica_service.get_all_metrics(db)

@router.post("/{metric_id}/toggle", response_model=schemas.Metrica)
async def toggle_metric(
    metric_id: int,
    db: AsyncSession = Depends(get_db),
    _admin = Depends(require_admin),
):
    """
    Cambia el estado 'is_active' de una única métrica.
    """
    metric = await metrica_service.toggle_metric_status(db, metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail="Metrica no encontrada")
    return metric

@router.post("/{metric_id}/data", response_model=List[schemas.GeoDataElectoral])
async def get_electoral_data(
    metric_id: int, 
    request: Optional[schemas.FilterRequest] = Body(None),
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Obtiene los datos procesados para una métrica de tipo electoral,
    agrupados por geografía y con los resultados por partido.
    Permite aplicar filtros dinámicos.
    """
    metric = await db.get(MetricasModel, metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail="Metrica no encontrada")
    
    if metric.tipo != TipoMetrica.ELECTORAL:
        raise HTTPException(
            status_code=400, 
            detail=f"Esta ruta solo es para métricas de tipo ELECTORAL. La métrica seleccionada es de tipo {metric.tipo.value}."
        )

    filtros = request.filtros if request else None
    data = await metrica_service.get_electoral_metric_data(db, metric_id, filtros=filtros)
    if not data:
        # Se devuelve una lista vacía en lugar de un 404 si los filtros no producen resultados
        return []
    
    return data

@router.get("/{metric_id}/opciones", response_model=schemas.MetricaOpciones)
async def get_metric_opciones(
    metric_id: int,
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Devuelve las opciones disponibles (partidos, años, tipos de voto) para poblar
    los selectores de filtro de una métrica.
    """
    metric = await db.get(MetricasModel, metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail="Metrica no encontrada")
    return await metrica_service.get_metric_opciones(db, metric_id)

@router.get("/{metric_id}/serie-historica/{geografia_id}", response_model=schemas.SerieHistorica)
async def get_serie_historica(
    metric_id: int,
    geografia_id: int,
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """Serie histórica de una métrica electoral por (año, partido) para una geografía.

    Alimenta la sparkline de la card de Resultados del municipio seleccionado.
    Devuelve serie vacía si la métrica no es electoral o el municipio no tiene datos.
    """
    metric = await db.get(MetricasModel, metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail="Metrica no encontrada")
    if metric.tipo != TipoMetrica.ELECTORAL:
        # Las series históricas hoy solo tienen sentido para métricas electorales
        # (las genéricas no tienen dimensión 'año' agregada).
        return schemas.SerieHistorica(geografia_id=geografia_id, puntos=[])
    return await metrica_service.get_serie_historica_for_geo(db, metric_id, geografia_id)

@router.post("/{metric_id}/datos-genericos", response_model=List[schemas.GenericData])
async def get_generic_data_for_metric(
    metric_id: int, 
    request: Optional[schemas.FilterRequest] = Body(None),
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Obtiene todos los datos para una métrica genérica (no electoral),
    permitiendo aplicar filtros dinámicos.
    """
    metric = await db.get(MetricasModel, metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail="Metrica no encontrada")

    filtros = request.filtros if request else None
    data = await metrica_service.get_all_generic_data_for_metric(db, metric_id, filtros=filtros)
    if not data:
        # Se devuelve una lista vacía en lugar de un 404 si los filtros no producen resultados
        return []
    
    return data
