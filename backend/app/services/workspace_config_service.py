"""Configuración unificada del workspace (defaults + políticas de feeds).

Un solo documento JSON por tenant (hoy singleton id=1). Las listas crecientes
(RSS, hashtags) irán a `feed_sources`; secretos a env; métricas por fila siguen
en `metricas`.
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models

WORKSPACE_CONFIG_ID = 1

# Paths que ya tienen efecto real en producto (el resto es schema listo / UI preview).
LIVE_PATHS: frozenset[str] = frozenset(
    {
        "feeds.socio.borrar_trimestre_anterior_al_publicar",
        "feeds.socio.trimestre_referencia",
        "feeds.web.fetch_interval_min",
        "feeds.web.retention_days",
        "feeds.web.classify_territorial",
        "feeds.web.import_untagged",
    }
)

DEFAULT_WORKSPACE_CONFIG: dict[str, Any] = {
    "version": 1,
    "defaults": {
        "mapa": {
            "primary_metric_clave": None,
            "secondary_metric_claves": [],
            "partido": None,
            "anio": None,
            "votos_tipo": "positivo",
            "map_style": "osm",
            "intensity_mode": "relative",
            "show_panel": True,
            "show_legend": True,
        },
        "analisis": {
            "columnas_secundarias": [],
            "orden": "share-desc",
            "cruce_metric_clave": None,
            "highlight_threshold_pct": 35,
            "export_format": "xlsx",
        },
        "metricas": {
            "max_secondaries": 4,
            "feeds_publish_policy": "borrador",
            "homologaciones_partido": {},
        },
    },
    "feeds": {
        "socio": {
            "borrar_trimestre_anterior_al_publicar": False,
            "trimestre_referencia": None,
        },
        "web": {
            "fetch_interval_min": 30,
            "retention_days": 30,
            "classify_territorial": True,
            "import_untagged": False,
        },
        "social": {
            "ingest_interval_min": 15,
            "publish_policy": "borrador",
        },
        "ia": {
            "model": "gpt-4o-mini",
            "temperature": 0.3,
            "min_confidence_pct": 75,
            "eligible_tipos": ["ELECTORAL", "ECONOMICA", "DEMOGRAFICA"],
            "publish_policy": "borrador",
            "daily_limit": 50,
        },
    },
    "archivos": {
        "auto_suggest_processor": True,
        "preview_before_process": True,
        "failed_retention_days": 30,
    },
    "storage": {
        "staging_ttl_days": 30,
        "historical_hechos_months": 36,
        "feed_raw_retention_days": 90,
    },
}


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Merge recursivo: dicts se combinan; el resto se reemplaza."""
    out = copy.deepcopy(base)
    for key, value in patch.items():
        if key in out and isinstance(out[key], dict) and isinstance(value, dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _with_defaults(document: dict[str, Any] | None) -> dict[str, Any]:
    return deep_merge(DEFAULT_WORKSPACE_CONFIG, document or {})


async def _migrate_legacy_feed_socio(db: AsyncSession, document: dict[str, Any]) -> dict[str, Any]:
    """Copia una vez desde feed_socio_config si el doc aún no tiene valores útiles."""
    socio = document.get("feeds", {}).get("socio", {})
    already = socio.get("borrar_trimestre_anterior_al_publicar") or socio.get("trimestre_referencia")
    if already:
        return document

    try:
        result = await db.execute(
            select(models.FeedSocioConfig).where(models.FeedSocioConfig.id == 1)
        )
        legacy = result.scalar_one_or_none()
    except Exception:
        return document

    if not legacy:
        return document

    return deep_merge(
        document,
        {
            "feeds": {
                "socio": {
                    "borrar_trimestre_anterior_al_publicar": bool(
                        legacy.borrar_trimestre_anterior_al_publicar
                    ),
                    "trimestre_referencia": legacy.trimestre_referencia,
                }
            }
        },
    )


async def get_or_create_workspace_row(db: AsyncSession) -> models.WorkspaceConfig:
    result = await db.execute(
        select(models.WorkspaceConfig).where(models.WorkspaceConfig.id == WORKSPACE_CONFIG_ID)
    )
    row = result.scalar_one_or_none()
    if row:
        return row

    row = models.WorkspaceConfig(
        id=WORKSPACE_CONFIG_ID,
        document=copy.deepcopy(DEFAULT_WORKSPACE_CONFIG),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_workspace_document(db: AsyncSession) -> dict[str, Any]:
    row = await get_or_create_workspace_row(db)
    document = _with_defaults(row.document if isinstance(row.document, dict) else {})
    migrated = await _migrate_legacy_feed_socio(db, document)
    if migrated != document:
        row.document = migrated
        row.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(row)
        document = _with_defaults(row.document)
    elif not row.document or row.document == {}:
        row.document = copy.deepcopy(DEFAULT_WORKSPACE_CONFIG)
        row.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(row)
        document = _with_defaults(row.document)
    return document


async def patch_workspace_document(db: AsyncSession, patch: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(patch, dict):
        raise ValueError("El body debe ser un objeto JSON")
    # No permitir pisar version a algo inválido desde el cliente de forma accidental
    patch = {k: v for k, v in patch.items() if k != "version"}
    row = await get_or_create_workspace_row(db)
    current = _with_defaults(row.document if isinstance(row.document, dict) else {})
    merged = deep_merge(current, patch)
    merged["version"] = DEFAULT_WORKSPACE_CONFIG["version"]
    row.document = merged
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _with_defaults(row.document)


def get_path(document: dict[str, Any], dotted: str, default: Any = None) -> Any:
    node: Any = document
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return node


async def get_feed_socio_settings(db: AsyncSession) -> dict[str, Any]:
    doc = await get_workspace_document(db)
    socio = get_path(doc, "feeds.socio", {}) or {}
    return {
        "borrar_trimestre_anterior_al_publicar": bool(
            socio.get("borrar_trimestre_anterior_al_publicar", False)
        ),
        "trimestre_referencia": socio.get("trimestre_referencia"),
    }


async def update_feed_socio_settings(
    db: AsyncSession,
    *,
    borrar_trimestre_anterior_al_publicar: bool | None = None,
    trimestre_referencia: str | None = None,
    set_trimestre: bool = False,
) -> dict[str, Any]:
    patch: dict[str, Any] = {"feeds": {"socio": {}}}
    if borrar_trimestre_anterior_al_publicar is not None:
        patch["feeds"]["socio"]["borrar_trimestre_anterior_al_publicar"] = (
            borrar_trimestre_anterior_al_publicar
        )
    if set_trimestre:
        patch["feeds"]["socio"]["trimestre_referencia"] = trimestre_referencia
    await patch_workspace_document(db, patch)
    return await get_feed_socio_settings(db)
