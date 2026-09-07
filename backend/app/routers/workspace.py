"""API de configuración unificada del workspace."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_admin
from schemas import WorkspaceConfigPatch, WorkspaceConfigResponse
from services import workspace_config_service as wcs

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("/config", response_model=WorkspaceConfigResponse)
async def get_workspace_config(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    row = await wcs.get_or_create_workspace_row(db)
    document = await wcs.get_workspace_document(db)
    return WorkspaceConfigResponse(
        document=document,
        live_paths=sorted(wcs.LIVE_PATHS),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.patch("/config", response_model=WorkspaceConfigResponse)
async def patch_workspace_config(
    body: WorkspaceConfigPatch,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        document = await wcs.patch_workspace_document(db, body.document)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = await wcs.get_or_create_workspace_row(db)
    return WorkspaceConfigResponse(
        document=document,
        live_paths=sorted(wcs.LIVE_PATHS),
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )
