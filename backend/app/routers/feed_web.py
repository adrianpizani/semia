"""API Feed web (RSS) — fuentes, fetch, ítems, tags y diccionario."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user, require_admin
from schemas import (
    FeedSourceCreate,
    FeedSourceOut,
    FeedSourceUpdate,
    FeedWebAgendaPublishRequest,
    FeedWebAgendaPublishResult,
    FeedWebDictEntryCreate,
    FeedWebDictEntryOut,
    FeedWebDictEntryUpdate,
    FeedWebFetchResult,
    FeedWebItemOut,
    FeedWebItemTagsUpdate,
    FeedWebPurgeResult,
    FeedWebSourceFetchResult,
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
        municipio_default=s.municipio_default,
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


def _dict_out(e) -> FeedWebDictEntryOut:
    return FeedWebDictEntryOut(
        id=e.id,
        texto=e.texto,
        alias=e.alias,
        normalized_alias=e.normalized_alias,
        tipo=e.tipo,
        activa=e.activa,
        created_at=e.created_at.isoformat() if e.created_at else None,
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
        source = await fws.create_source(
            db,
            body.nombre,
            body.url,
            body.activa,
            municipio_default=body.municipio_default,
        )
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
    payload = body.model_dump(exclude_unset=True)
    clear_muni = "municipio_default" in payload and payload.get("municipio_default") is None
    source = await fws.update_source(
        db,
        source_id,
        nombre=payload.get("nombre"),
        url=payload.get("url"),
        activa=payload.get("activa"),
        municipio_default=payload.get("municipio_default"),
        clear_municipio_default=clear_muni,
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


@router.post("/sources/seed-locals")
async def seed_local_sources(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Importa medios locales con RSS verificado + municipio_default."""
    result = await fws.seed_local_sources(db)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "Error al seed")
    return result


@router.post("/fetch/purge", response_model=FeedWebPurgeResult)
async def purge_now(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Aplica retención una vez (llamar al final del loop por fuente)."""
    purged = await fws.purge_expired(db)
    return FeedWebPurgeResult(purged=purged)


@router.post("/fetch/{source_id}", response_model=FeedWebSourceFetchResult)
async def fetch_one_source(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    result = await fws.fetch_one(db, source_id)
    if not result:
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    return FeedWebSourceFetchResult(**result)


@router.post("/fetch", response_model=FeedWebFetchResult)
async def fetch_now(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Batch de todas las activas (puede timeout detrás de nginx). Preferir /fetch/{id}."""
    result = await fws.fetch_all_active(db)
    return FeedWebFetchResult(**result)


@router.post("/publish-agenda", response_model=FeedWebAgendaPublishResult)
async def publish_agenda(
    body: FeedWebAgendaPublishRequest,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    score = body.score if body.score in ("count", "recency") else "count"
    result = await fws.publish_agenda(
        db,
        window_days=body.window_days,
        score=score,
        min_score=body.min_score,
        min_municipios=body.min_municipios,
        require_variance=body.require_variance,
    )
    return FeedWebAgendaPublishResult.model_validate(result)


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


@router.delete("/items/{item_id}")
async def remove_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    ok = await fws.delete_item(db, item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Titular no encontrado")
    return {"ok": True}


@router.put("/items/{item_id}/tags", response_model=FeedWebItemOut)
async def put_item_tags(
    item_id: int,
    body: FeedWebItemTagsUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    item = await fws.set_item_tags(
        db,
        item_id,
        [{"texto": t.texto, "tipo": t.tipo} for t in body.tags],
    )
    if not item:
        raise HTTPException(status_code=404, detail="Titular no encontrado")
    return _item_out(item)


@router.post("/items/{item_id}/retags", response_model=FeedWebItemOut)
async def post_item_retags(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    item = await fws.retag_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Titular no encontrado")
    return _item_out(item)


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


@router.get("/dictionary", response_model=list[FeedWebDictEntryOut])
async def get_dictionary(
    tipo: str | None = None,
    only_active: bool | None = None,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    entries = await fws.list_dictionary(db, tipo=tipo, only_active=only_active)
    return [_dict_out(e) for e in entries]


@router.post("/dictionary", response_model=FeedWebDictEntryOut)
async def post_dictionary(
    body: FeedWebDictEntryCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        entry = await fws.create_dictionary_entry(
            db,
            texto=body.texto,
            alias=body.alias,
            tipo=body.tipo,
            activa=body.activa,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _dict_out(entry)


@router.patch("/dictionary/{entry_id}", response_model=FeedWebDictEntryOut)
async def patch_dictionary(
    entry_id: int,
    body: FeedWebDictEntryUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        entry = await fws.update_dictionary_entry(
            db,
            entry_id,
            texto=body.texto,
            alias=body.alias,
            tipo=body.tipo,
            activa=body.activa,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    return _dict_out(entry)


@router.delete("/dictionary/{entry_id}")
async def remove_dictionary(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    ok = await fws.delete_dictionary_entry(db, entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    return {"ok": True}
