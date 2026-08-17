from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from schemas import Archivo
from database import get_db
from services import archivo_service, upload_service
from models import Archivo as ArchivoModel, TipoMetrica # Importar el modelo y el Enum
from dependencies import get_current_user, require_admin

router = APIRouter(tags=["Archivos"])

@router.get("/archivos", response_model=List[Archivo])
async def list_archivos(
    db: AsyncSession = Depends(get_db),
    _user = Depends(get_current_user),
):
    """
    Retrieves a list of all uploaded file records.
    """
    return await archivo_service.get_archivos(db=db)

@router.post("/archivos", response_model=Archivo)
async def upload_archivo(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _admin = Depends(require_admin),
    file: UploadFile = File(...),
    nombre_visible: str = Form(...),
    descripcion: str = Form(None),
    tipo_metrica: TipoMetrica = Form(...), # Nuevo campo para el tipo de métrica
    processor_id: int = Form(...) # Cambiado de processor_name a processor_id
):
    """
    Handles the upload of a new file, creates a record, and starts background processing.
    """
    # Crear el registro del archivo en la base de datos con estado PENDIENTE
    db_archivo = await archivo_service.create_archivo(
        db=db, 
        nombre_visible=nombre_visible,
        nombre_archivo_original=file.filename,
        descripcion=descripcion
    )
    
    # Leer el contenido del archivo aquí, en el endpoint
    file_content = await file.read()

    # Añadir la tarea de procesamiento a la cola de tareas en segundo plano
    background_tasks.add_task(
        upload_service.process_file, 
        db=db, 
        db_archivo=db_archivo, 
        file_content=file_content,
        tipo_metrica=tipo_metrica, # Pasar el tipo de métrica
        processor_id=processor_id # Pasar el nuevo parámetro
    )
    
    # Devolver la respuesta inmediatamente al cliente
    return db_archivo

@router.delete("/archivos/{archivo_id}", status_code=204)
async def delete_archivo(
    archivo_id: int,
    db: AsyncSession = Depends(get_db),
    _admin = Depends(require_admin),
):
    """
    Deletes an archivo record.
    """
    db_archivo = await archivo_service.delete_archivo(db, archivo_id)
    if db_archivo is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return
