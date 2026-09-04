"""Feed socioeconómico INDEC: ingest CSV por aglomerado → staging → publicar a partidos."""
import csv
import io
import unicodedata
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from models import EstadoProcesamiento, FeedSocioConfig, FeedSocioEstado, TipoMetrica

INDICADOR_POBREZA = "pobreza_eph_indec_pct"
INDICADOR_POBREZA_AMIGABLE = "Pobreza EPH (INDEC %)"

# Columnas del CSV wide de pobreza continua → código aglomerado EPH
POVERTY_WIDE_COLUMNS: dict[str, int] = {
    "poblacion_pobre_pct_partidos_gran_buenos_aires_continua": 33,
    "poblacion_pobre_pct_gran_la_plata_continua": 2,
    "poblacion_pobre_pct_mar_plata_batan_continua": 34,
    "poblacion_pobre_pct_bahia_blanca_cerri_continua": 3,
    "poblacion_pobre_pct_san_nicolas_villa_constitucion_continua": 38,
}


def fecha_to_periodo(fecha: date) -> str:
    trimestre = {1: 1, 4: 2, 7: 3, 10: 4}.get(fecha.month, 1)
    return f"{fecha.year}-T{trimestre}"


async def get_or_create_feed_socio_config(db: AsyncSession) -> FeedSocioConfig:
    result = await db.execute(select(FeedSocioConfig).where(FeedSocioConfig.id == 1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = FeedSocioConfig(id=1, borrar_trimestre_anterior_al_publicar=False)
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


async def update_feed_socio_config(
    db: AsyncSession,
    borrar_trimestre_anterior_al_publicar: bool,
) -> FeedSocioConfig:
    cfg = await get_or_create_feed_socio_config(db)
    cfg.borrar_trimestre_anterior_al_publicar = borrar_trimestre_anterior_al_publicar
    await db.commit()
    await db.refresh(cfg)
    return cfg


async def _set_trimestre_referencia(db: AsyncSession, periodo: str | None) -> None:
    if not periodo:
        return
    cfg = await get_or_create_feed_socio_config(db)
    cfg.trimestre_referencia = periodo
    await db.commit()


def _normalize_text(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    text = text.lower().strip()
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("utf-8")


def _parse_percentage(raw: str | float | None) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    # CSV INDEC en proporción 0–1; Semia usa puntos porcentuales (ej. 32.2)
    if abs(val) <= 1.5:
        val *= 100
    return round(val, 4)


def _parse_fecha(raw: str) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw.strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _detect_csv_kind(fieldnames: list[str] | None) -> str | None:
    if not fieldnames:
        return None
    normalized = {_normalize_text(c) for c in fieldnames}
    if "codusu" in normalized and "aglomerado" in normalized:
        return "eph_microdata_hogar"
    if "indice_tiempo" in normalized:
        return "indec_series_wide"
    return None


def _ingest_error_message(fieldnames: list[str] | None) -> str:
    kind = _detect_csv_kind(fieldnames)
    if kind == "eph_microdata_hogar":
        return (
            "Este archivo parece microdatos EPH (usu_hogar / usu_individual), no la serie "
            "publicada de pobreza por aglomerado. El upload de Feed APIs v1 solo acepta el CSV "
            "wide de pobreza continua (columna indice_tiempo + columnas por aglomerado). "
            "Los microdatos van en la Etapa 5 (agregación con PONDERA)."
        )
    if kind == "indec_series_wide":
        return (
            "CSV de series INDEC reconocido, pero sin columnas de los 5 aglomerados PBA "
            "(pobreza continua). Usa el archivo de ejemplo o un CSV con columnas como "
            "poblacion_pobre_pct_gran_la_plata_continua."
        )
    return (
        "No se encontraron columnas de aglomerado PBA. Se espera el CSV wide de pobreza "
        "continua INDEC (indice_tiempo + columnas poblacion_pobre_pct_*_continua)."
    )


async def ingest_poverty_csv_wide(
    db: AsyncSession,
    file_content: bytes,
    indicador_clave: str = INDICADOR_POBREZA,
    replace_borrador: bool = True,
) -> dict:
    """Parsea CSV wide de pobreza continua y crea filas staging por aglomerado."""
    text = file_content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {"inserted": 0, "skipped": 0, "error": "CSV sin columnas"}

    col_map = {
        col: POVERTY_WIDE_COLUMNS[col]
        for col in reader.fieldnames
        if col in POVERTY_WIDE_COLUMNS
    }
    if not col_map:
        return {
            "inserted": 0,
            "skipped": 0,
            "error": _ingest_error_message(reader.fieldnames),
        }

    if replace_borrador:
        await db.execute(
            delete(models.FeedSocioStaging).where(
                models.FeedSocioStaging.indicador_clave == indicador_clave,
                models.FeedSocioStaging.estado == FeedSocioEstado.BORRADOR,
            )
        )

    inserted = 0
    skipped = 0
    for row in reader:
        fecha = _parse_fecha(row.get("indice_tiempo", ""))
        if not fecha:
            skipped += 1
            continue
        for col, agl_cod in col_map.items():
            pct = _parse_percentage(row.get(col))
            if pct is None:
                continue
            db.add(
                models.FeedSocioStaging(
                    aglomerado_cod=agl_cod,
                    indicador_clave=indicador_clave,
                    fecha_dato=fecha,
                    valor=Decimal(str(pct)),
                    estado=FeedSocioEstado.BORRADOR,
                )
            )
            inserted += 1

    await db.commit()
    return {"inserted": inserted, "skipped": skipped, "columnas": list(col_map.keys())}


async def list_staging(
    db: AsyncSession,
    indicador_clave: str | None = None,
    estado: FeedSocioEstado = FeedSocioEstado.BORRADOR,
) -> list[dict]:
    stmt = (
        select(models.FeedSocioStaging, models.AglomeradoEph)
        .join(models.AglomeradoEph, models.FeedSocioStaging.aglomerado_cod == models.AglomeradoEph.codigo)
        .where(models.FeedSocioStaging.estado == estado)
    )
    if indicador_clave:
        stmt = stmt.where(models.FeedSocioStaging.indicador_clave == indicador_clave)
    stmt = stmt.order_by(
        models.FeedSocioStaging.fecha_dato.desc(),
        models.FeedSocioStaging.indicador_clave,
        models.AglomeradoEph.codigo,
    )
    result = await db.execute(stmt)
    rows = []
    for staging, agl in result.all():
        rows.append(
            {
                "id": staging.id,
                "aglomerado_cod": staging.aglomerado_cod,
                "aglomerado_nombre": agl.nombre,
                "indicador_clave": staging.indicador_clave,
                "fecha_dato": staging.fecha_dato.isoformat(),
                "valor": float(staging.valor),
                "estado": staging.estado.value,
            }
        )
    return rows


async def preview_publish(
    db: AsyncSession,
    indicador_clave: str | None = None,
) -> dict:
    """Cuenta partidos que recibirían valor al publicar borradores actuales."""
    staging_rows = await list_staging(db, indicador_clave, FeedSocioEstado.BORRADOR)
    peso_result = await db.execute(select(models.AglomeradoPartidoPeso))
    pesos = peso_result.scalars().all()
    pesos_by_agl: dict[int, list] = {}
    for p in pesos:
        pesos_by_agl.setdefault(p.aglomerado_cod, []).append(p)

    partido_rows = 0
    for s in staging_rows:
        partido_rows += len(pesos_by_agl.get(s["aglomerado_cod"], []))

    return {
        "staging_rows": len(staging_rows),
        "partido_hechos_estimados": partido_rows,
        "indicador_clave": indicador_clave or "todos",
    }


async def _commit_eph_staging(db: AsyncSession, result: dict) -> dict:
    from services.eph_microdata_service import EPH_INDICATORS

    if result.get("error"):
        return {"inserted": 0, "skipped": 0, "error": result["error"]}

    indicadores = list(EPH_INDICATORS.keys())
    await db.execute(
        delete(models.FeedSocioStaging).where(
            models.FeedSocioStaging.indicador_clave.in_(indicadores),
            models.FeedSocioStaging.estado == FeedSocioEstado.BORRADOR,
        )
    )

    for row in result["staging_preview"]:
        db.add(
            models.FeedSocioStaging(
                aglomerado_cod=row["aglomerado_cod"],
                indicador_clave=row["indicador_clave"],
                fecha_dato=row["fecha_dato"],
                valor=Decimal(str(row["valor"])),
                estado=FeedSocioEstado.BORRADOR,
            )
        )

    await db.commit()
    if result.get("periodo"):
        await _set_trimestre_referencia(db, result["periodo"])
    out = {
        "inserted": result["inserted"],
        "skipped": 0,
        "indicadores": result["indicadores"],
        "periodo": result["periodo"],
        "fecha_dato": result["fecha_dato"],
    }
    if result.get("source"):
        out["source"] = result["source"]
    if result.get("motor"):
        out["motor"] = result["motor"]
    return out


async def ingest_eph_trimestre(
    db: AsyncSession,
    hogar_content: bytes,
    individual_content: bytes,
) -> dict:
    from services.eph_microdata_service import aggregate_eph_trimestre

    result = aggregate_eph_trimestre(hogar_content, individual_content)
    return await _commit_eph_staging(db, result)


async def ingest_eph_latest(db: AsyncSession) -> dict:
    from services.pyeph_adapter import download_and_aggregate_latest

    result = download_and_aggregate_latest()
    return await _commit_eph_staging(db, result)


async def publish_all_staging(
    db: AsyncSession,
    delete_previous_trimestre: bool | None = None,
) -> dict:
    """Publica todos los indicadores con borrador en staging."""
    result = await db.execute(
        select(models.FeedSocioStaging.indicador_clave)
        .where(models.FeedSocioStaging.estado == FeedSocioEstado.BORRADOR)
        .distinct()
    )
    claves = [row[0] for row in result.all()]
    if not claves:
        return {"error": "No hay borradores para publicar", "hechos": 0, "publicados": []}

    total_hechos = 0
    total_fallidas = 0
    total_eliminados = 0
    publicados = []
    for clave in claves:
        r = await publish_staging(db, clave, delete_previous_trimestre=delete_previous_trimestre)
        if r.get("error"):
            continue
        total_hechos += r["hechos"]
        total_fallidas += r["fallidas"]
        total_eliminados += r.get("hechos_eliminados", 0)
        publicados.append(clave)

    return {
        "hechos": total_hechos,
        "fallidas": total_fallidas,
        "hechos_eliminados": total_eliminados,
        "publicados": publicados,
        "metrica_clave": ", ".join(publicados),
        "metrica_id": 0,
        "archivo_id": 0,
        "log": f"Publicados: {', '.join(publicados)}",
    }


async def publish_staging(
    db: AsyncSession,
    indicador_clave: str = INDICADOR_POBREZA,
    nombre_amigable: str | None = None,
    delete_previous_trimestre: bool | None = None,
) -> dict:
    """Expande staging aglomerado → hechos_datos por partido (mismo % por aglomerado)."""
    from services.eph_microdata_service import EPH_INDICATORS

    meta = EPH_INDICATORS.get(indicador_clave)
    if meta and not nombre_amigable:
        nombre_amigable = meta["nombre_amigable"]
    elif not nombre_amigable:
        nombre_amigable = INDICADOR_POBREZA_AMIGABLE
    origen = "semia_eph" if meta else "indec_oficial"
    staging_result = await db.execute(
        select(models.FeedSocioStaging).where(
            models.FeedSocioStaging.indicador_clave == indicador_clave,
            models.FeedSocioStaging.estado == FeedSocioEstado.BORRADOR,
        )
    )
    staging_rows = staging_result.scalars().all()
    if not staging_rows:
        return {"error": "No hay borradores para publicar", "hechos": 0}

    fecha_vigente = staging_rows[0].fecha_dato
    periodo_vigente = fecha_to_periodo(fecha_vigente)

    if delete_previous_trimestre is None:
        cfg = await get_or_create_feed_socio_config(db)
        delete_previous_trimestre = cfg.borrar_trimestre_anterior_al_publicar

    agl_result = await db.execute(select(models.AglomeradoEph))
    agl_by_cod = {a.codigo: a for a in agl_result.scalars().all()}

    peso_result = await db.execute(select(models.AglomeradoPartidoPeso))
    pesos_by_agl: dict[int, list[models.AglomeradoPartidoPeso]] = {}
    for p in peso_result.scalars().all():
        pesos_by_agl.setdefault(p.aglomerado_cod, []).append(p)

    geo_result = await db.execute(
        select(models.Dimension_Geografica).where(models.Dimension_Geografica.nivel == "Partido")
    )
    geo_by_name = {_normalize_text(g.nombre): g for g in geo_result.scalars().all()}

    archivo = models.Archivo(
        nombre_visible=f"Feed socio INDEC — {indicador_clave}",
        nombre_archivo_original="feed_socio_indec",
        descripcion="Generado por Feed APIs (socioeconómico INDEC)",
        estado=EstadoProcesamiento.COMPLETADO,
    )
    db.add(archivo)
    await db.flush()

    metric_result = await db.execute(
        select(models.Metricas).where(models.Metricas.nombre_clave == indicador_clave)
    )
    metric = metric_result.scalar_one_or_none()
    if not metric:
        tipo_metrica = TipoMetrica.ECONOMICA
        if meta and meta.get("tipo") in TipoMetrica.__members__:
            tipo_metrica = TipoMetrica[meta["tipo"]]
        metric = models.Metricas(
            nombre_clave=indicador_clave,
            nombre_amigable=nombre_amigable,
            tipo=tipo_metrica,
            is_active=False,
            archivo_id=archivo.id,
        )
        db.add(metric)
        await db.flush()
    else:
        metric.archivo_id = archivo.id

    hechos_eliminados = 0
    if delete_previous_trimestre:
        del_result = await db.execute(
            delete(models.Hechos_Datos).where(
                models.Hechos_Datos.metrica_id == metric.id,
                models.Hechos_Datos.fecha_dato != fecha_vigente,
            )
        )
        hechos_eliminados = del_result.rowcount or 0

    hechos_count = 0
    fallidas = 0
    log_lines: list[str] = []

    for staging in staging_rows:
        agl = agl_by_cod.get(staging.aglomerado_cod)
        pesos = pesos_by_agl.get(staging.aglomerado_cod, [])
        if not pesos:
            log_lines.append(f"Sin pesos para aglomerado {staging.aglomerado_cod}")
            fallidas += 1
            continue

        imputado = len(pesos) > 1 or staging.aglomerado_cod == 33
        valor_pct = float(staging.valor)

        for peso in pesos:
            geo = geo_by_name.get(_normalize_text(peso.partido_nombre))
            if not geo:
                log_lines.append(f"Partido no encontrado: {peso.partido_nombre}")
                fallidas += 1
                continue

            db.add(
                models.Hechos_Datos(
                    geografia_id=geo.id,
                    metrica_id=metric.id,
                    archivo_id=archivo.id,
                    fecha_dato=staging.fecha_dato,
                    valor=Decimal(str(valor_pct)),
                    dimension_extra={
                        "origen": origen,
                        "indicador": indicador_clave,
                        "periodo": periodo_vigente,
                        "aglomerado_cod": staging.aglomerado_cod,
                        "aglomerado_nombre": agl.nombre if agl else None,
                        "imputado_desde_aglomerado": imputado,
                    },
                )
            )
            hechos_count += 1

        staging.estado = FeedSocioEstado.PUBLICADO

    archivo.filas_procesadas = hechos_count
    archivo.filas_fallidas = fallidas
    archivo.log_procesamiento = "\n".join(log_lines) if log_lines else "OK"

    cfg = await get_or_create_feed_socio_config(db)
    cfg.trimestre_referencia = periodo_vigente

    await db.commit()

    return {
        "hechos": hechos_count,
        "fallidas": fallidas,
        "hechos_eliminados": hechos_eliminados,
        "periodo": periodo_vigente,
        "metrica_id": metric.id,
        "metrica_clave": metric.nombre_clave,
        "archivo_id": archivo.id,
        "log": archivo.log_procesamiento,
    }
