from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import require_admin
from models import FeedSocioEstado
from schemas import (
    FeedSocioIngestResult,
    FeedSocioPreview,
    FeedSocioPublishResult,
    FeedSocioStagingRow,
)
from services.eph_microdata_service import EPH_INDICATORS
from services.feed_socio_service import (
    ingest_eph_latest,
    ingest_eph_trimestre,
    list_staging,
    preview_publish,
    publish_all_staging,
    publish_staging,
)

router = APIRouter(
    prefix="/feeds",
    tags=["feeds"],
)

_feeds_script = Path(__file__).resolve()


def _eph_sample_paths(base: str) -> list[Path]:
    paths = [Path(f"/data/{base}")]
    for depth in (3, 2):
        try:
            paths.append(_feeds_script.parents[depth] / "data" / base)
        except IndexError:
            pass
    return paths


def _resolve_eph_sample() -> tuple[Path, Path]:
    hogar_candidates = _eph_sample_paths("usu_hogar_T126.txt")
    ind_candidates = _eph_sample_paths("usu_individual_T126.txt")
    hogar = next((p for p in hogar_candidates if p.is_file()), None)
    ind = next((p for p in ind_candidates if p.is_file()), None)
    if not hogar or not ind:
        raise FileNotFoundError(
            "Faltan usu_hogar_T126.txt y/o usu_individual_T126.txt en data/ (montado en /data en Docker)"
        )
    return hogar, ind


@router.get("/socio/indicadores")
async def get_socio_indicadores(_admin=Depends(require_admin)):
    return EPH_INDICATORS


@router.get("/socio/staging", response_model=list[FeedSocioStagingRow])
async def get_socio_staging(
    indicador_clave: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    return await list_staging(db, indicador_clave, FeedSocioEstado.BORRADOR)


@router.get("/socio/preview", response_model=FeedSocioPreview)
async def get_socio_preview(
    indicador_clave: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    return await preview_publish(db, indicador_clave)


@router.post("/socio/upload", response_model=FeedSocioIngestResult)
async def upload_socio_eph_trimestre(
    hogar_file: UploadFile = File(..., description="usu_hogar trimestral (TXT/CSV INDEC)"),
    individual_file: UploadFile = File(..., description="usu_individual trimestral (TXT/CSV INDEC)"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    hogar_content = await hogar_file.read()
    individual_content = await individual_file.read()
    result = await ingest_eph_trimestre(db, hogar_content, individual_content)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/socio/download-latest", response_model=FeedSocioIngestResult)
async def download_socio_latest(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        result = await ingest_eph_latest(db)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/socio/sample", response_model=FeedSocioIngestResult)
async def ingest_socio_sample(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        hogar_path, ind_path = _resolve_eph_sample()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    result = await ingest_eph_trimestre(db, hogar_path.read_bytes(), ind_path.read_bytes())
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    result["source"] = f"{hogar_path.name} + {ind_path.name}"
    return result


@router.post("/socio/publish", response_model=FeedSocioPublishResult)
async def publish_socio(
    indicador_clave: str | None = Query(None, description="Vacío = publicar todos los borradores"),
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    if indicador_clave:
        result = await publish_staging(db, indicador_clave)
    else:
        result = await publish_all_staging(db)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result
