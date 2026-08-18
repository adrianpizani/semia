from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from database import get_db
from dependencies import get_current_user, require_admin
import models
import schemas

router = APIRouter(
    prefix="/procesadores",
    tags=["procesadores"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.Procesador)
async def create_procesador(
    procesador: schemas.ProcesadorCreate,
    db: AsyncSession = Depends(get_db),
    _admin = Depends(require_admin),
):
    """
    Crea una nueva configuración de procesador.
    """
    db_procesador = models.Procesador(**procesador.dict())
    db.add(db_procesador)
    await db.commit()
    await db.refresh(db_procesador)
    return db_procesador

@router.get("/", response_model=List[schemas.Procesador])
async def read_procesadores(
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Devuelve una lista de todas las configuraciones de procesadores.
    """
    result = await db.execute(select(models.Procesador))
    return result.scalars().all()

@router.post("/verificar-encabezados", response_model=schemas.Procesador | None)
async def verificar_procesador_por_encabezados(
    request: schemas.ProcesadorMatchRequest,
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Verifica si existe un procesador que coincida con los encabezados proporcionados.
    """
    stmt = select(models.Procesador)
    if request.tipo_archivo:
        stmt = stmt.where(models.Procesador.tipo_archivo == request.tipo_archivo)
    if request.nivel_geografico:
        stmt = stmt.where(models.Procesador.nivel_geografico == request.nivel_geografico)
    if request.metric_name:
        stmt = stmt.where(models.Procesador.metric_name == request.metric_name)
    
    result = await db.execute(stmt)
    procesadores = result.scalars().all()

    for proc in procesadores:
        # Extraer las claves del mapeo de columnas del procesador
        columnas_esperadas = set(proc.mapeo_columnas.keys())
        # Convertir los encabezados recibidos a un conjunto para una comparación eficiente
        encabezados_recibidos = set(request.headers)

        # Verificar si el conjunto de columnas esperadas es exactamente igual al de los encabezados recibidos
        if columnas_esperadas == encabezados_recibidos:
            return proc # Se encontró una coincidencia exacta

    return None # No se encontró ningún procesador que coincida
