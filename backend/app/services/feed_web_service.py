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


VALID_DICT_TIPOS = frozenset({"municipio", "partido", "tema", "otro", "provincia"})


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


async def create_source(
    db: AsyncSession,
    nombre: str,
    url: str,
    activa: bool = True,
    municipio_default: str | None = None,
    provincia_default: str | None = None,
) -> models.FeedSource:
    muni = (municipio_default or "").strip() or None
    prov = (provincia_default or "").strip() or None
    source = models.FeedSource(
        nombre=nombre.strip(),
        url=url.strip(),
        activa=activa,
        municipio_default=muni,
        provincia_default=prov,
    )
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
    municipio_default: str | None = None,
    clear_municipio_default: bool = False,
    provincia_default: str | None = None,
    clear_provincia_default: bool = False,
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
    if clear_municipio_default:
        source.municipio_default = None
    elif municipio_default is not None:
        source.municipio_default = municipio_default.strip() or None
    if clear_provincia_default:
        source.provincia_default = None
    elif provincia_default is not None:
        source.provincia_default = provincia_default.strip() or None
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


async def seed_local_sources(db: AsyncSession) -> dict[str, Any]:
    """Upsert fuentes locales verificadas (RSS OK) con municipio_default."""
    import json
    from pathlib import Path

    candidates = [
        Path(__file__).resolve().parents[2] / "static" / "reference" / "feed_web_local_sources.json",
        Path("/app/static/reference/feed_web_local_sources.json"),
    ]
    path = next((p for p in candidates if p.is_file()), None)
    if not path:
        return {"ok": False, "error": "No se encontró feed_web_local_sources.json", "created": 0, "updated": 0}

    rows = json.loads(path.read_text(encoding="utf-8"))
    created = 0
    updated = 0
    for row in rows:
        url = (row.get("url") or "").strip()
        nombre = (row.get("nombre") or "").strip()
        municipio = (row.get("municipio") or "").strip() or None
        if not url or not nombre:
            continue
        existing = await db.execute(select(models.FeedSource).where(models.FeedSource.url == url))
        src = existing.scalar_one_or_none()
        if src:
            changed = False
            if municipio and src.municipio_default != municipio:
                src.municipio_default = municipio
                changed = True
            if nombre and src.nombre != nombre:
                src.nombre = nombre
                changed = True
            if changed:
                updated += 1
        else:
            db.add(
                models.FeedSource(
                    nombre=nombre[:200],
                    url=url[:1000],
                    activa=True,
                    municipio_default=municipio,
                )
            )
            created += 1
    await db.commit()
    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "total_file": len(rows),
        "path": str(path),
    }


async def seed_provincial_sources(db: AsyncSession) -> dict[str, Any]:
    """Upsert medios provinciales (2× provincia) con provincia_default."""
    import json
    from pathlib import Path

    candidates = [
        Path(__file__).resolve().parents[2]
        / "static"
        / "reference"
        / "feed_web_provincial_sources.json",
        Path("/app/static/reference/feed_web_provincial_sources.json"),
    ]
    path = next((p for p in candidates if p.is_file()), None)
    if not path:
        return {
            "ok": False,
            "error": "No se encontró feed_web_provincial_sources.json",
            "created": 0,
            "updated": 0,
        }

    rows = json.loads(path.read_text(encoding="utf-8"))
    created = 0
    updated = 0
    for row in rows:
        url = (row.get("url") or "").strip()
        nombre = (row.get("nombre") or "").strip()
        provincia = (row.get("provincia") or "").strip() or None
        if not url or not nombre:
            continue
        existing = await db.execute(select(models.FeedSource).where(models.FeedSource.url == url))
        src = existing.scalar_one_or_none()
        if src:
            changed = False
            if provincia and src.provincia_default != provincia:
                src.provincia_default = provincia
                changed = True
            if nombre and src.nombre != nombre:
                src.nombre = nombre
                changed = True
            if changed:
                updated += 1
        else:
            db.add(
                models.FeedSource(
                    nombre=nombre[:200],
                    url=url[:1000],
                    activa=True,
                    provincia_default=provincia,
                )
            )
            created += 1
    await db.commit()
    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "total_file": len(rows),
        "path": str(path),
    }


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
    import_untagged: bool = False,
) -> dict[str, Any]:
    inserted = 0
    skipped = 0
    skipped_untagged = 0
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
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

            matched_tags: list[tuple[str, str]] = []
            if classify:
                haystack = f"{title} {summary or ''}"
                matched_tags = extract_tags(haystack, dictionary)

            # Medios locales PBA: forzar tag municipio
            if source.municipio_default:
                muni = source.municipio_default.strip()
                if muni:
                    already = {normalize_text(t) for t, _ in matched_tags}
                    if normalize_text(muni) not in already:
                        matched_tags.append((muni, "municipio"))

            # Medios provinciales: forzar tag provincia
            if source.provincia_default:
                prov = source.provincia_default.strip()
                if prov:
                    already = {normalize_text(t) for t, _ in matched_tags}
                    if normalize_text(prov) not in already:
                        matched_tags.append((prov, "provincia"))

            if classify and not matched_tags and not import_untagged:
                skipped_untagged += 1
                continue

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

            seen_tag_norm: set[str] = set()
            for texto, tipo in matched_tags:
                norm = normalize_text(texto)
                if not norm or norm in seen_tag_norm:
                    continue
                seen_tag_norm.add(norm)
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
            "skipped_untagged": skipped_untagged,
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
            "skipped_untagged": 0,
            "error": str(exc)[:500],
        }


async def _fetch_policy(db: AsyncSession) -> tuple[bool, bool, list[tuple[str, str, str]]]:
    doc = await wcs.get_workspace_document(db)
    classify = bool(wcs.get_path(doc, "feeds.web.classify_territorial", True))
    import_untagged = bool(wcs.get_path(doc, "feeds.web.import_untagged", False))
    dictionary = await _load_dictionary(db) if classify else []
    return classify, import_untagged, dictionary


async def fetch_one(db: AsyncSession, source_id: int) -> dict[str, Any] | None:
    """Fetch atómico de una fuente. None si no existe."""
    source = await db.get(models.FeedSource, source_id)
    if not source:
        return None
    classify, import_untagged, dictionary = await _fetch_policy(db)
    report = await fetch_source(db, source, dictionary, classify, import_untagged=import_untagged)
    report["classify"] = classify
    report["import_untagged"] = import_untagged
    return report


async def purge_expired(db: AsyncSession) -> int:
    purged = await _apply_retention(db)
    await db.commit()
    return purged


async def fetch_all_active(db: AsyncSession) -> dict[str, Any]:
    """Batch sync (cron / debug). Preferir fetch_one desde la UI."""
    classify, import_untagged, dictionary = await _fetch_policy(db)

    result = await db.execute(select(models.FeedSource).where(models.FeedSource.activa.is_(True)))
    sources = list(result.scalars().all())
    per_source = []
    total_inserted = 0
    total_skipped_untagged = 0
    for source in sources:
        # re-load after possible rollback
        src = await db.get(models.FeedSource, source.id)
        if not src:
            continue
        report = await fetch_source(db, src, dictionary, classify, import_untagged=import_untagged)
        per_source.append(report)
        total_inserted += report.get("inserted", 0)
        total_skipped_untagged += report.get("skipped_untagged", 0)

    purged = await _apply_retention(db)
    await db.commit()
    return {
        "sources": per_source,
        "inserted": total_inserted,
        "purged": purged,
        "classify": classify,
        "import_untagged": import_untagged,
        "skipped_untagged": total_skipped_untagged,
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


def _tema_clave(tema: str, *, alcance: str = "pba") -> str:
    slug = normalize_text(tema).replace(" ", "_")
    slug = "".join(c for c in slug if c.isalnum() or c == "_")
    if not slug:
        slug = "tema"
    if alcance == "nacional":
        return f"prensa_nac_{slug}"
    return f"prensa_{slug}"


def _item_effective_at(item: models.FeedWebItem) -> datetime | None:
    return item.publicado_at or item.fetched_at


def _recency_weight(age_days: float, window_days: int) -> float:
    if age_days < 0:
        age_days = 0
    if age_days > window_days:
        return 0.0
    return (window_days + 1 - age_days) / (window_days + 1)


async def aggregate_agenda(
    db: AsyncSession,
    *,
    window_days: int = 7,
    score: str = "count",
    min_score: float = 2.0,
    min_municipios: int = 2,
    require_variance: bool = True,
    alcance: str = "pba",
) -> dict[str, Any]:
    """Agrega pares geo×tema del corpus en la ventana.

    alcance=pba → tags municipio → dimension Partido → claves prensa_*
    alcance=nacional → tags provincia → dimension Provincia → claves prensa_nac_*
    """
    from decimal import Decimal

    alcance_n = "nacional" if alcance == "nacional" else "pba"
    geo_tag_tipo = "provincia" if alcance_n == "nacional" else "municipio"
    geo_nivel = "Provincia" if alcance_n == "nacional" else "Partido"
    geo_label_word = "provincia" if alcance_n == "nacional" else "municipio"

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=window_days)
    score_mode = "recency" if score == "recency" else "count"
    min_score = max(0.0, float(min_score))
    min_municipios = max(1, int(min_municipios))

    result = await db.execute(
        select(models.FeedWebItem).options(selectinload(models.FeedWebItem.tags))
    )
    items = list(result.scalars().unique().all())

    scores: dict[str, dict[str, float]] = {}
    tema_label: dict[str, str] = {}
    geo_label: dict[str, str] = {}
    items_used = 0

    for item in items:
        when = _item_effective_at(item)
        if when is None:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when < cutoff:
            continue
        geos = [t for t in (item.tags or []) if (t.tipo or "") == geo_tag_tipo]
        temas = [t for t in (item.tags or []) if (t.tipo or "") == "tema"]
        if not geos or not temas:
            continue
        items_used += 1
        age_days = (now - when).total_seconds() / 86400.0
        weight = 1.0 if score_mode == "count" else _recency_weight(age_days, window_days)
        if weight <= 0:
            continue
        for geo_tag in geos:
            g_norm = normalize_text(geo_tag.texto)
            geo_label[g_norm] = geo_tag.texto
            for tema in temas:
                t_norm = normalize_text(tema.texto)
                tema_label[t_norm] = tema.texto
                by_geo = scores.setdefault(t_norm, {})
                by_geo[g_norm] = by_geo.get(g_norm, 0.0) + weight

    geo_result = await db.execute(
        select(models.Dimension_Geografica).where(models.Dimension_Geografica.nivel == geo_nivel)
    )
    geo_by_norm = {normalize_text(g.nombre): g for g in geo_result.scalars().all()}

    unresolved: list[str] = []
    skipped_low_score = 0
    skipped_temas: list[dict[str, Any]] = []
    resolved_pairs = 0
    facts: dict[str, list[dict[str, Any]]] = {}

    for t_norm, by_geo in scores.items():
        rows: list[dict[str, Any]] = []
        for g_norm, valor in by_geo.items():
            geo = geo_by_norm.get(g_norm)
            if not geo:
                label = geo_label.get(g_norm, g_norm)
                if label not in unresolved:
                    unresolved.append(label)
                continue
            rounded = float(Decimal(str(round(valor, 2))))
            if rounded < min_score:
                skipped_low_score += 1
                continue
            rows.append(
                {
                    "geografia_id": geo.id,
                    "geo_nombre": geo_label.get(g_norm, geo.nombre),
                    "valor": rounded,
                }
            )
            resolved_pairs += 1

        tema_name = tema_label.get(t_norm, t_norm)
        if len(rows) < min_municipios:
            skipped_temas.append(
                {
                    "tema": tema_name,
                    "reason": (
                        f"solo {len(rows)} {geo_label_word}(s) con score≥{min_score} "
                        f"(mín. {min_municipios})"
                    ),
                    "municipios": len(rows),
                }
            )
            continue
        values = [r["valor"] for r in rows]
        if require_variance and min(values) >= max(values):
            skipped_temas.append(
                {
                    "tema": tema_name,
                    "reason": f"sin variación (todos={values[0]})",
                    "municipios": len(rows),
                }
            )
            continue
        facts[t_norm] = rows

    return {
        "window_days": window_days,
        "score": score_mode,
        "min_score": min_score,
        "min_municipios": min_municipios,
        "require_variance": require_variance,
        "alcance": alcance_n,
        "items_used": items_used,
        "temas": [
            {
                "tema": tema_label[t],
                "clave": _tema_clave(tema_label[t], alcance=alcance_n),
                "municipios": len(facts[t]),
                "valor_min": min(r["valor"] for r in facts[t]),
                "valor_max": max(r["valor"] for r in facts[t]),
                "hechos": facts[t],
            }
            for t in sorted(facts.keys(), key=lambda k: tema_label[k])
        ],
        "skipped_temas": skipped_temas,
        "skipped_low_score": skipped_low_score,
        "unresolved_municipios": unresolved,
        "resolved_pairs": resolved_pairs,
        "_tema_label": tema_label,
        "_facts": facts,
    }


async def publish_agenda(
    db: AsyncSession,
    *,
    window_days: int = 7,
    score: str = "count",
    min_score: float = 2.0,
    min_municipios: int = 2,
    require_variance: bool = True,
    alcance: str = "pba",
) -> dict[str, Any]:
    """Publica/actualiza métricas genéricas por tema (idempotente por nombre_clave)."""
    from datetime import date
    from decimal import Decimal

    from models import EstadoProcesamiento, TipoMetrica

    alcance_n = "nacional" if alcance == "nacional" else "pba"
    window_days = max(1, min(int(window_days), 90))
    agg = await aggregate_agenda(
        db,
        window_days=window_days,
        score=score,
        min_score=min_score,
        min_municipios=min_municipios,
        require_variance=require_variance,
        alcance=alcance_n,
    )
    facts: dict[str, list[dict[str, Any]]] = agg["_facts"]
    tema_label: dict[str, str] = agg["_tema_label"]
    published_claves: set[str] = set()
    geo_field = "provincia" if alcance_n == "nacional" else "municipio"
    scope_label = "nacional" if alcance_n == "nacional" else "PBA"

    if not facts:
        cleared = await _clear_stale_prensa_hechos(
            db, keep_claves=set(), alcance=alcance_n
        )
        await db.commit()
        return {
            "ok": False,
            "error": (
                "Nada publicó con los umbrales actuales. "
                f"Subí menciones (min score) o bajá «mín. {geo_field}s»."
            ),
            "window_days": window_days,
            "score": agg["score"],
            "min_score": agg["min_score"],
            "min_municipios": agg["min_municipios"],
            "alcance": alcance_n,
            "items_used": agg["items_used"],
            "metricas": [],
            "hechos": 0,
            "hechos_reemplazados": 0,
            "metricas_limpiadas": cleared,
            "skipped_temas": agg["skipped_temas"],
            "skipped_low_score": agg["skipped_low_score"],
            "unresolved_municipios": agg["unresolved_municipios"],
        }

    fecha_dato = date.today()
    archivo = models.Archivo(
        nombre_visible=f"Feed web agenda {scope_label} {window_days}d ({agg['score']})",
        nombre_archivo_original=f"feed_web_agenda_{alcance_n}",
        descripcion=(
            f"Agregado tema×{geo_field}; alcance={alcance_n}; "
            f"min_score={agg['min_score']}, min_geos={agg['min_municipios']}"
        ),
        estado=EstadoProcesamiento.COMPLETADO,
    )
    db.add(archivo)
    await db.flush()

    published: list[dict[str, Any]] = []
    total_hechos = 0
    total_replaced = 0
    log_lines: list[str] = []

    for t_norm, rows in facts.items():
        tema = tema_label[t_norm]
        clave = _tema_clave(tema, alcance=alcance_n)
        published_claves.add(clave)
        prefix = "Prensa nac." if alcance_n == "nacional" else "Prensa"
        amigable = f"{prefix} · {tema} ({window_days}d)"
        vals = [r["valor"] for r in rows]

        metric_result = await db.execute(
            select(models.Metricas).where(models.Metricas.nombre_clave == clave)
        )
        metric = metric_result.scalar_one_or_none()
        created = False
        if not metric:
            metric = models.Metricas(
                nombre_clave=clave,
                nombre_amigable=amigable,
                tipo=TipoMetrica.PRENSA,
                is_active=False,
                escala_rango="linear",
                mostrar_cruce=False,
                mostrar_hotspots=True,
                archivo_id=archivo.id,
            )
            db.add(metric)
            await db.flush()
            created = True
        else:
            was_prensa = metric.tipo == TipoMetrica.PRENSA
            metric.nombre_amigable = amigable
            metric.archivo_id = archivo.id
            metric.tipo = TipoMetrica.PRENSA
            if not metric.escala_rango:
                metric.escala_rango = "linear"
            if not was_prensa:
                metric.mostrar_cruce = False
                metric.mostrar_hotspots = True

        del_result = await db.execute(
            delete(models.Hechos_Datos).where(models.Hechos_Datos.metrica_id == metric.id)
        )
        replaced = del_result.rowcount or 0
        total_replaced += replaced

        for row in rows:
            db.add(
                models.Hechos_Datos(
                    geografia_id=row["geografia_id"],
                    metrica_id=metric.id,
                    archivo_id=archivo.id,
                    fecha_dato=fecha_dato,
                    valor=Decimal(str(row["valor"])),
                    dimension_extra={
                        "origen": "feed_web",
                        "preset": "que_se_esta_diciendo",
                        "alcance": alcance_n,
                        "tema": tema,
                        geo_field: row["geo_nombre"],
                        "window_days": window_days,
                        "score": agg["score"],
                    },
                )
            )
            total_hechos += 1

        published.append(
            {
                "metrica_id": metric.id,
                "clave": clave,
                "nombre_amigable": amigable,
                "created": created,
                "hechos": len(rows),
                "hechos_reemplazados": replaced,
                "is_active": bool(metric.is_active),
                "valor_min": min(vals),
                "valor_max": max(vals),
            }
        )
        log_lines.append(
            f"{clave}: {len(rows)} hechos rango {min(vals)}–{max(vals)} (reemplazados {replaced})"
        )

    cleared = await _clear_stale_prensa_hechos(
        db, keep_claves=published_claves, alcance=alcance_n
    )
    if cleared:
        log_lines.append(
            f"Limpiadas {cleared} métricas {('prensa_nac_*' if alcance_n == 'nacional' else 'prensa_*')} fuera de este publish"
        )

    for skip in agg["skipped_temas"]:
        log_lines.append(f"Omitido {skip['tema']}: {skip['reason']}")
    if agg["skipped_low_score"]:
        log_lines.append(f"Pares bajo min_score: {agg['skipped_low_score']}")
    if agg["unresolved_municipios"]:
        log_lines.append(
            f"{geo_field.capitalize()}s sin geo: "
            + ", ".join(agg["unresolved_municipios"][:20])
        )

    archivo.filas_procesadas = total_hechos
    archivo.filas_fallidas = len(agg["unresolved_municipios"]) + len(agg["skipped_temas"])
    archivo.log_procesamiento = "\n".join(log_lines) if log_lines else "OK"
    await db.commit()

    return {
        "ok": True,
        "window_days": window_days,
        "score": agg["score"],
        "min_score": agg["min_score"],
        "min_municipios": agg["min_municipios"],
        "alcance": alcance_n,
        "items_used": agg["items_used"],
        "archivo_id": archivo.id,
        "metricas": published,
        "hechos": total_hechos,
        "hechos_reemplazados": total_replaced,
        "metricas_limpiadas": cleared,
        "skipped_temas": agg["skipped_temas"],
        "skipped_low_score": agg["skipped_low_score"],
        "unresolved_municipios": agg["unresolved_municipios"],
        "log": archivo.log_procesamiento,
    }


async def _clear_stale_prensa_hechos(
    db: AsyncSession,
    keep_claves: set[str],
    *,
    alcance: str = "pba",
) -> int:
    """Borra hechos de métricas prensa del alcance que no entraron en este publish.

    PBA: claves prensa_* excepto prensa_nac_*
    Nacional: solo prensa_nac_*
    """
    result = await db.execute(
        select(models.Metricas).where(models.Metricas.nombre_clave.like("prensa_%"))
    )
    cleared = 0
    for metric in result.scalars().all():
        clave = metric.nombre_clave or ""
        is_nac = clave.startswith("prensa_nac_")
        if alcance == "nacional":
            if not is_nac:
                continue
        else:
            if is_nac:
                continue
        if clave in keep_claves:
            continue
        del_result = await db.execute(
            delete(models.Hechos_Datos).where(models.Hechos_Datos.metrica_id == metric.id)
        )
        if del_result.rowcount:
            cleared += 1
    return cleared
