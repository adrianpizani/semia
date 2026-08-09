# routers/metricas.py
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

import schemas
from database import get_db
from services import metrica_service

from models import TipoMetrica, Metricas as MetricasModel

router = APIRouter(prefix="/metricas", tags=["Metricas"])

@router.get("", response_model=List[schemas.Metrica])
async def get_all_metrics(db: AsyncSession = Depends(get_db)):
    """
    Recupera una lista de todas las métricas disponibles.
    """
    return await metrica_service.get_all_metrics(db)

@router.post("/{metric_id}/toggle", response_model=schemas.Metrica)
async def toggle_metric(metric_id: int, db: AsyncSession = Depends(get_db)):
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
    db: AsyncSession = Depends(get_db)
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
async def get_metric_opciones(metric_id: int, db: AsyncSession = Depends(get_db)):
    """
    Devuelve las opciones disponibles (partidos, años, tipos de voto) para poblar
    los selectores de filtro de una métrica.
    """
    metric = await db.get(MetricasModel, metric_id)
    if not metric:
        raise HTTPException(status_code=404, detail="Metrica no encontrada")
    return await metrica_service.get_metric_opciones(db, metric_id)

@router.post("/{metric_id}/datos-genericos", response_model=List[schemas.GenericData])
async def get_generic_data_for_metric(
    metric_id: int, 
    request: Optional[schemas.FilterRequest] = Body(None),
    db: AsyncSession = Depends(get_db)
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
