"""Feed web: fuentes RSS, fetch, tags y consulta."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser
import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import models
from services.feed_web_tagging import dictionary_from_rows, extract_tags, normalize_text
from services import workspace_config_service as wcs


VALID_DICT_TIPOS = frozenset({"municipio", "partido", "tema", "otro"})


def _parse_published(entry: dict) -> datetime | None:
    for key in ("published", "updated"):
        raw = entry.get(key)
        if not raw:
            continue
        try:
            dt = parsedate_to_datetime(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (TypeError, ValueError, IndexError):
            continue
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        try:
            return datetime(*parsed[:6], tzinfo=timezone.utc)
        except (TypeError, ValueError):
            pass
    return None


def _entry_guid(entry: dict, source_id: int) -> str:
    raw = entry.get("id") or entry.get("link") or entry.get("title") or ""
    digest = hashlib.sha256(f"{source_id}:{raw}".encode("utf-8")).hexdigest()
    return digest


async def list_sources(db: AsyncSession) -> list[models.FeedSource]:
    result = await db.execute(select(models.FeedSource).order_by(models.FeedSource.nombre))
    return list(result.scalars().all())


async def create_source(db: AsyncSession, nombre: str, url: str, activa: bool = True) -> models.FeedSource:
    source = models.FeedSource(nombre=nombre.strip(), url=url.strip(), activa=activa)
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return source


async def update_source(
    db: AsyncSession,
    source_id: int,
    *,
    nombre: str | None = None,
    url: str | None = None,
    activa: bool | None = None,
) -> models.FeedSource | None:
    source = await db.get(models.FeedSource, source_id)
    if not source:
        return None
    if nombre is not None:
        source.nombre = nombre.strip()
    if url is not None:
        source.url = url.strip()
    if activa is not None:
        source.activa = activa
    await db.commit()
    await db.refresh(source)
    return source


async def delete_source(db: AsyncSession, source_id: int) -> bool:
    source = await db.get(models.FeedSource, source_id)
    if not source:
        return False
    await db.delete(source)
    await db.commit()
    return True


async def _load_dictionary(db: AsyncSession) -> list[tuple[str, str, str]]:
    result = await db.execute(
        select(models.FeedWebDictEntry).where(models.FeedWebDictEntry.activa.is_(True))
    )
    rows = [
        (e.texto, e.normalized_alias, e.tipo)
        for e in result.scalars().all()
    ]
    return dictionary_from_rows(rows)


async def list_dictionary(
    db: AsyncSession,
    *,
    tipo: str | None = None,
    only_active: bool | None = None,
) -> list[models.FeedWebDictEntry]:
    stmt = select(models.FeedWebDictEntry).order_by(
        models.FeedWebDictEntry.tipo,
        models.FeedWebDictEntry.texto,
        models.FeedWebDictEntry.alias,
    )
    if tipo:
        stmt = stmt.where(models.FeedWebDictEntry.tipo == tipo)
    if only_active is True:
        stmt = stmt.where(models.FeedWebDictEntry.activa.is_(True))
    elif only_active is False:
        stmt = stmt.where(models.FeedWebDictEntry.activa.is_(False))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_dictionary_entry(
    db: AsyncSession,
    *,
    texto: str,
    alias: str,
    tipo: str,
    activa: bool = True,
) -> models.FeedWebDictEntry:
    tipo_n = (tipo or "otro").strip().lower()
    if tipo_n not in VALID_DICT_TIPOS:
        raise ValueError(f"tipo inválido: {tipo}")
    alias_s = alias.strip()
    texto_s = texto.strip()
    if not texto_s or not alias_s:
        raise ValueError("texto y alias son obligatorios")
    norm = normalize_text(alias_s)
    if len(norm) < 4:
        raise ValueError("el alias normalizado debe tener al menos 4 caracteres")
    existing = await db.execute(
        select(models.FeedWebDictEntry).where(models.FeedWebDictEntry.normalized_alias == norm)
    )
    if existing.scalar_one_or_none():
        raise ValueError("ya existe una entrada con ese alias")
    entry = models.FeedWebDictEntry(
        texto=texto_s,
        alias=alias_s,
        normalized_alias=norm,
        tipo=tipo_n,
        activa=activa,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def update_dictionary_entry(
    db: AsyncSession,
    entry_id: int,
    *,
    texto: str | None = None,
    alias: str | None = None,
    tipo: str | None = None,
    activa: bool | None = None,
) -> models.FeedWebDictEntry | None:
    entry = await db.get(models.FeedWebDictEntry, entry_id)
    if not entry:
        return None
    if texto is not None:
        entry.texto = texto.strip()
    if alias is not None:
        alias_s = alias.strip()
        norm = normalize_text(alias_s)
        if len(norm) < 4:
            raise ValueError("el alias normalizado debe tener al menos 4 caracteres")
        clash = await db.execute(
            select(models.FeedWebDictEntry).where(
                models.FeedWebDictEntry.normalized_alias == norm,
                models.FeedWebDictEntry.id != entry_id,
            )
        )
        if clash.scalar_one_or_none():
            raise ValueError("ya existe una entrada con ese alias")
        entry.alias = alias_s
        entry.normalized_alias = norm
    if tipo is not None:
        tipo_n = tipo.strip().lower()
        if tipo_n not in VALID_DICT_TIPOS:
            raise ValueError(f"tipo inválido: {tipo}")
        entry.tipo = tipo_n
    if activa is not None:
        entry.activa = activa
    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_dictionary_entry(db: AsyncSession, entry_id: int) -> bool:
    entry = await db.get(models.FeedWebDictEntry, entry_id)
    if not entry:
        return False
    await db.delete(entry)
    await db.commit()
    return True


async def _get_or_create_tag(db: AsyncSession, texto: str, tipo: str | None) -> models.FeedWebTag:
    normalized = normalize_text(texto)
    result = await db.execute(select(models.FeedWebTag).where(models.FeedWebTag.normalized == normalized))
    tag = result.scalar_one_or_none()
    if tag:
        if tipo and not tag.tipo:
            tag.tipo = tipo
        return tag
    tag = models.FeedWebTag(texto=texto, tipo=tipo, normalized=normalized)
    db.add(tag)
    await db.flush()
    return tag


async def _apply_retention(db: AsyncSession) -> int:
    doc = await wcs.get_workspace_document(db)
    days = int(wcs.get_path(doc, "feeds.web.retention_days", 30) or 30)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(delete(models.FeedWebItem).where(models.FeedWebItem.publicado_at < cutoff))
    return result.rowcount or 0


async def fetch_source(
    db: AsyncSession,
    source: models.FeedSource,
    dictionary: list[tuple[str, str, str]],
    classify: bool,
) -> dict[str, Any]:
    inserted = 0
    skipped = 0
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(
                source.url,
                headers={"User-Agent": "SemiaFeedBot/1.0 (+https://semia.studio)"},
            )
            response.raise_for_status()
            content = response.text
        parsed = feedparser.parse(content)
        if getattr(parsed, "bozo", False) and not parsed.entries:
            raise ValueError(getattr(parsed, "bozo_exception", None) or "RSS inválido")

        for entry in parsed.entries:
            guid = _entry_guid(entry, source.id)
            existing = await db.execute(select(models.FeedWebItem.id).where(models.FeedWebItem.guid == guid))
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            title = (entry.get("title") or "").strip() or "(sin título)"
            link = (entry.get("link") or "").strip() or source.url
            summary = entry.get("summary") or entry.get("description")
            if summary:
                summary = str(summary)[:2000]
            item = models.FeedWebItem(
                source_id=source.id,
                titulo=title[:500],
                url=link[:1000],
                resumen=summary,
                publicado_at=_parse_published(entry),
                guid=guid,
                fetched_at=datetime.now(timezone.utc),
            )
            db.add(item)
            await db.flush()

            if classify:
                haystack = f"{title} {summary or ''}"
                for texto, tipo in extract_tags(haystack, dictionary):
                    tag = await _get_or_create_tag(db, texto, tipo)
                    await db.execute(
                        models.feed_web_item_tags.insert().values(item_id=item.id, tag_id=tag.id)
                    )

            inserted += 1

        source.ultimo_fetch_at = datetime.now(timezone.utc)
        source.ultimo_error = None
        await db.commit()
        return {
            "source_id": source.id,
            "nombre": source.nombre,
            "ok": True,
            "inserted": inserted,
            "skipped": skipped,
            "error": None,
        }
    except Exception as exc:
        source_id = source.id
        source_nombre = source.nombre
        await db.rollback()
        src = await db.get(models.FeedSource, source_id)
        if src:
            src.ultimo_fetch_at = datetime.now(timezone.utc)
            src.ultimo_error = str(exc)[:1000]
            await db.commit()
        return {
            "source_id": source_id,
            "nombre": source_nombre,
            "ok": False,
            "inserted": 0,
            "skipped": 0,
            "error": str(exc)[:500],
        }


async def fetch_all_active(db: AsyncSession) -> dict[str, Any]:
    doc = await wcs.get_workspace_document(db)
    classify = bool(wcs.get_path(doc, "feeds.web.classify_territorial", True))
    dictionary = await _load_dictionary(db) if classify else []

    result = await db.execute(select(models.FeedSource).where(models.FeedSource.activa.is_(True)))
    sources = list(result.scalars().all())
    per_source = []
    total_inserted = 0
    for source in sources:
        # re-load after possible rollback
        src = await db.get(models.FeedSource, source.id)
        if not src:
            continue
        report = await fetch_source(db, src, dictionary, classify)
        per_source.append(report)
        total_inserted += report.get("inserted", 0)

    purged = await _apply_retention(db)
    await db.commit()
    return {
        "sources": per_source,
        "inserted": total_inserted,
        "purged": purged,
        "classify": classify,
    }


async def list_items(
    db: AsyncSession,
    *,
    source_id: int | None = None,
    tag: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[models.FeedWebItem]:
    stmt = (
        select(models.FeedWebItem)
        .options(selectinload(models.FeedWebItem.source), selectinload(models.FeedWebItem.tags))
        .order_by(models.FeedWebItem.publicado_at.desc().nullslast(), models.FeedWebItem.id.desc())
        .limit(min(limit, 200))
        .offset(max(offset, 0))
    )
    if source_id:
        stmt = stmt.where(models.FeedWebItem.source_id == source_id)
    if tag:
        norm = normalize_text(tag)
        stmt = (
            stmt.join(models.FeedWebItem.tags)
            .where(models.FeedWebTag.normalized == norm)
            .distinct()
        )
    result = await db.execute(stmt)
    return list(result.scalars().unique().all())


async def list_discovered_tags(db: AsyncSession, limit: int = 100) -> list[dict[str, Any]]:
    stmt = (
        select(
            models.FeedWebTag.id,
            models.FeedWebTag.texto,
            models.FeedWebTag.tipo,
            func.count(models.feed_web_item_tags.c.item_id).label("count"),
        )
        .join(
            models.feed_web_item_tags,
            models.FeedWebTag.id == models.feed_web_item_tags.c.tag_id,
        )
        .group_by(models.FeedWebTag.id)
        .order_by(func.count(models.feed_web_item_tags.c.item_id).desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [
        {"id": row.id, "texto": row.texto, "tipo": row.tipo, "count": int(row.count)}
        for row in result.all()
    ]


async def get_summary(db: AsyncSession) -> dict[str, Any]:
    items_count = await db.scalar(select(func.count()).select_from(models.FeedWebItem)) or 0
    sources_active = await db.scalar(
        select(func.count()).select_from(models.FeedSource).where(models.FeedSource.activa.is_(True))
    ) or 0
    last_fetch = await db.scalar(select(func.max(models.FeedSource.ultimo_fetch_at)))
    tags = await list_discovered_tags(db, limit=10)
    return {
        "items_count": int(items_count),
        "sources_active": int(sources_active),
        "ultimo_fetch_at": last_fetch.isoformat() if last_fetch else None,
        "top_tags": tags,
    }


async def delete_item(db: AsyncSession, item_id: int) -> bool:
    item = await db.get(models.FeedWebItem, item_id)
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True


async def _reload_item(db: AsyncSession, item_id: int) -> models.FeedWebItem | None:
    result = await db.execute(
        select(models.FeedWebItem)
        .options(selectinload(models.FeedWebItem.source), selectinload(models.FeedWebItem.tags))
        .where(models.FeedWebItem.id == item_id)
    )
    return result.scalar_one_or_none()


async def set_item_tags(
    db: AsyncSession,
    item_id: int,
    tags: list[dict[str, Any]],
) -> models.FeedWebItem | None:
    item = await db.get(models.FeedWebItem, item_id)
    if not item:
        return None
    await db.execute(
        delete(models.feed_web_item_tags).where(models.feed_web_item_tags.c.item_id == item_id)
    )
    seen: set[str] = set()
    for raw in tags:
        texto = (raw.get("texto") or "").strip()
        if not texto:
            continue
        norm = normalize_text(texto)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        tipo = raw.get("tipo")
        if isinstance(tipo, str):
            tipo = tipo.strip().lower() or None
            if tipo and tipo not in VALID_DICT_TIPOS:
                tipo = "otro"
        else:
            tipo = None
        tag = await _get_or_create_tag(db, texto, tipo)
        await db.execute(
            models.feed_web_item_tags.insert().values(item_id=item_id, tag_id=tag.id)
        )
    await db.commit()
    return await _reload_item(db, item_id)


async def retag_item(db: AsyncSession, item_id: int) -> models.FeedWebItem | None:
    item = await db.get(models.FeedWebItem, item_id)
    if not item:
        return None
    dictionary = await _load_dictionary(db)
    haystack = f"{item.titulo} {item.resumen or ''}"
    matched = extract_tags(haystack, dictionary)
    return await set_item_tags(
        db,
        item_id,
        [{"texto": texto, "tipo": tipo} for texto, tipo in matched],
    )
