"""API Feed web (RSS) — fuentes, fetch, ítems y tags."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, require_admin
from schemas import (
    FeedSourceCreate,
    FeedSourceOut,
    FeedSourceUpdate,
    FeedWebFetchResult,
    FeedWebItemOut,
    FeedWebSummary,
    FeedWebTagOut,
)
from services import feed_web_service as fws

router = APIRouter(prefix="/feeds/web", tags=["feeds-web"])


def _source_out(s) -> FeedSourceOut:
    return FeedSourceOut(
        id=s.id,
        nombre=s.nombre,
        url=s.url,
        activa=s.activa,
        ultimo_fetch_at=s.ultimo_fetch_at.isoformat() if s.ultimo_fetch_at else None,
        ultimo_error=s.ultimo_error,
    )


def _item_out(item) -> FeedWebItemOut:
    return FeedWebItemOut(
        id=item.id,
        titulo=item.titulo,
        url=item.url,
        resumen=item.resumen,
        publicado_at=item.publicado_at.isoformat() if item.publicado_at else None,
        fetched_at=item.fetched_at.isoformat() if item.fetched_at else None,
        source_id=item.source_id,
        source_nombre=item.source.nombre if item.source else "",
        tags=[
            FeedWebTagOut(id=t.id, texto=t.texto, tipo=t.tipo)
            for t in (item.tags or [])
        ],
    )


@router.get("/sources", response_model=list[FeedSourceOut])
async def get_sources(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    return [_source_out(s) for s in await fws.list_sources(db)]


@router.post("/sources", response_model=FeedSourceOut)
async def post_source(
    body: FeedSourceCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        source = await fws.create_source(db, body.nombre, body.url, body.activa)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo crear la fuente: {exc}") from exc
    return _source_out(source)


@router.patch("/sources/{source_id}", response_model=FeedSourceOut)
async def patch_source(
    source_id: int,
    body: FeedSourceUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    source = await fws.update_source(
        db,
        source_id,
        nombre=body.nombre,
        url=body.url,
        activa=body.activa,
    )
    if not source:
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    return _source_out(source)


@router.delete("/sources/{source_id}")
async def remove_source(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    ok = await fws.delete_source(db, source_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    return {"ok": True}


@router.post("/fetch", response_model=FeedWebFetchResult)
async def fetch_now(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    result = await fws.fetch_all_active(db)
    return FeedWebFetchResult(**result)


@router.get("/items", response_model=list[FeedWebItemOut])
async def get_items(
    source_id: int | None = None,
    tag: str | None = None,
    limit: int = Query(80, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    items = await fws.list_items(db, source_id=source_id, tag=tag, limit=limit, offset=offset)
    return [_item_out(i) for i in items]


@router.get("/tags", response_model=list[FeedWebTagOut])
async def get_tags(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    rows = await fws.list_discovered_tags(db)
    return [FeedWebTagOut(**r) for r in rows]


@router.get("/summary", response_model=FeedWebSummary)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    data = await fws.get_summary(db)
    return FeedWebSummary(
        items_count=data["items_count"],
        sources_active=data["sources_active"],
        ultimo_fetch_at=data["ultimo_fetch_at"],
        top_tags=[FeedWebTagOut(**t) for t in data["top_tags"]],
    )
