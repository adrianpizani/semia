import re
import unicodedata
from io import StringIO
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from models import Archivo as ArchivoModel, TipoMetrica, Metricas, Hechos_Datos, Dimension_Geografica
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from services.processors.normalizaciones import homologar

# Tamaño de lote para insertar en la DB (dataset pesado: ~1M filas) sin retener todo en memoria.
BATCH_SIZE = 5000

# Función auxiliar para normalizar texto (pasar a minúsculas y quitar acentos)
def _normalize_text(text: str) -> str:
    if not isinstance(text, str):
        return str(text).lower()
    text = text.lower()
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
    return text

async def process_generic_csv(
    db: AsyncSession,
    db_archivo: ArchivoModel,
    file_content: bytes,
    mapeo_columnas: dict[str, str],
    tipo_metrica: TipoMetrica,
    nivel_geografico: str,
    metric_name: str # Nuevo parámetro
) -> dict:
    """
    Procesador genérico de archivos CSV.
    Utiliza un mapeo de columnas y un nivel geográfico para renombrar y procesar datos.
    """
    filas_procesadas = 0
    filas_fallidas = 0
    log_entries = []

    try:
        # Decodificar el contenido del archivo y leer con pandas
        s_io = StringIO(file_content.decode('utf-8'))
        df = pd.read_csv(s_io)

        # Crea un diccionario de renombrado solo para las columnas que existen en el DataFrame
        rename_dict = {k: v for k, v in mapeo_columnas.items() if k in df.columns}
        df.rename(columns=rename_dict, inplace=True)
        
        # Después de renombrar, filtra el DataFrame para que solo contenga esas columnas
        df_mapped = df[list(rename_dict.values())]

        # Obtener métricas y geografías existentes de forma eficiente
        stmt_metricas = select(Metricas).filter(Metricas.nombre_clave == metric_name).filter(Metricas.tipo == tipo_metrica)
        result_metricas = await db.execute(stmt_metricas)
        metricas_existentes_por_nombre = {m.nombre_clave: m for m in result_metricas.scalars().all()}

        # Asegurar que la métrica principal exista o crearla
        metric = metricas_existentes_por_nombre.get(metric_name)
        if not metric:
            new_metrica = Metricas(
                nombre_clave=metric_name,
                nombre_amigable=metric_name, # Usar el nombre de la métrica como nombre amigable
                tipo=tipo_metrica,
                is_active=True,
                archivo_id=db_archivo.id
            )
            db.add(new_metrica)
            await db.flush() # Para obtener el ID
            metricas_existentes_por_nombre[metric_name] = new_metrica
            metric = new_metrica
            log_entries.append(f"Métrica principal '{metric_name}' creada.")

        stmt_geografias = select(Dimension_Geografica).where(Dimension_Geografica.nivel == nivel_geografico)
        result_geografias = await db.execute(stmt_geografias)
        
        geografias_existentes = {}
        for g in result_geografias.scalars().all():
            key = g.nombre  # Clave por defecto (normalizado)
            if nivel_geografico == 'Circuito':
                match = re.search(r'(\d+)', g.nombre)
                if match:
                    key = match.group(1) # Usar el número del circuito como clave (sin normalizar en este caso para coincidir con CSV)
            # Normalizar la clave para la búsqueda
            geografias_existentes[_normalize_text(key)] = g

        # --- INICIO: LOGS DE DEPURACIÓN ---
        print("--- DEPURANDO INCOMPATIBILIDAD GEOGRÁFICA ---")
        try:
            # Muestra de claves del diccionario de la base de datos (normalizadas)
            db_geo_keys_sample = list(geografias_existentes.keys())
            print(f"Total de geografías en BD para nivel '{nivel_geografico}': {len(db_geo_keys_sample)}")
            print(f"Muestra de 5 claves de la BD (normalizadas): {db_geo_keys_sample[:5]}")

            # Muestra de valores únicos del archivo CSV (normalizados)
            if "geography_identifier" in df_mapped.columns:
                csv_geo_values = df_mapped["geography_identifier"].astype(str).unique()
                normalized_csv_geo_values = [_normalize_text(str(v)) for v in csv_geo_values]
                print(f"Total de identificadores geográficos únicos en CSV: {len(normalized_csv_geo_values)}")
                print(f"Muestra de 5 valores del CSV (normalizados): {normalized_csv_geo_values[:5]}")
            else:
                print("ADVERTENCIA: La columna 'geography_identifier' no se encontró en el DataFrame mapeado.")
        except Exception as debug_exc:
            print(f"Error durante la depuración: {debug_exc}")
        print("--- FIN DEPURACIÓN ---")
        # --- FIN: LOGS DE DEPURACIÓN ---


        # Identificar el nombre de la columna que contiene el valor numérico
        value_column_mapped_name = None
        for k, v in mapeo_columnas.items():
            if v == "value_identifier":
                value_column_mapped_name = k # Esto es el nombre original que el usuario dio
                break
        
        if not value_column_mapped_name:
            raise ValueError("No se encontró la columna de valor designada para el mapeo 'value_identifier'.")

        # Lote de hechos pendientes de insertar (evita retener ~1M objetos y un commit gigante).
        batch = []

        for index, row in df_mapped.iterrows():
            try:
                # 1. Obtener geography_id
                circuito_nombre_raw = row.get("geography_identifier")
                circuito_nombre_normalized = _normalize_text(str(circuito_nombre_raw)) 
                geografia_id = None
                if circuito_nombre_raw:
                    geo = geografias_existentes.get(circuito_nombre_normalized)
                    if geo:
                        geografia_id = geo.id
                    else:
                        log_entries.append(f"Fila {index + 2}: Geografía '{circuito_nombre_raw}' (normalizada: '{circuito_nombre_normalized}') no encontrada para el nivel '{nivel_geografico}'.")
                        filas_fallidas += 1
                        continue
                else:
                    log_entries.append(f"Fila {index + 2}: No se encontró la columna de 'geography_identifier' en la fila o está vacía.")
                    filas_fallidas += 1
                    continue
                
                # 2. Obtener el valor de la columna designada para el valor
                valor_bruto = row.get("value_identifier") # Ahora el nombre ya fue renombrado
                
                valor_numerico = None
                try:
                    valor_numerico = float(valor_bruto)
                except (ValueError, TypeError):
                    log_entries.append(f"Fila {index + 2}: El valor '{valor_bruto}' de la columna de valor no es numérico.")
                    filas_fallidas += 1
                    continue
                
                # 3. Recopilar dimensiones extra
                dimension_extra = {}
                for col_name, col_value in row.items():
                    # Excluir los identificadores clave y la fecha_dato
                    if col_name not in ["geography_identifier", "value_identifier", "fecha_dato"]:
                        # Convertir valores no nulos a string para almacenamiento JSON
                        dimension_extra[col_name] = homologar(col_name, str(col_value)) if pd.notna(col_value) else None
                
                # 4. Crear Hechos_Datos
                hecho = Hechos_Datos(
                    geografia_id=geografia_id,
                    metrica_id=metric.id, # Usar la única métrica principal
                    archivo_id=db_archivo.id,
                    fecha_dato=pd.to_datetime(row.get("fecha_dato")) if row.get("fecha_dato") else None, # Asumiendo 'fecha_dato' si está presente
                    valor=valor_numerico, # Asegurar tipo numérico
                    dimension_extra=dimension_extra if dimension_extra else None
                )
                batch.append(hecho)
                filas_procesadas += 1

                # Commit por lotes para dataset pesado
                if len(batch) >= BATCH_SIZE:
                    db.add_all(batch)
                    await db.commit()
                    batch = []

            except Exception as e:
                log_entries.append(f"Error en fila {index + 2}: {e}. Datos: {row.to_dict()}")
                filas_fallidas += 1
        
        # Commit del lote restante
        if batch:
            db.add_all(batch)
            await db.commit()

        log_entries.append(f"Procesamiento finalizado. Filas procesadas: {filas_procesadas}, Filas fallidas: {filas_fallidas}.")

    except pd.errors.EmptyDataError:
        log_entries.append("Error: El archivo CSV está vacío.")
        filas_fallidas = 1
    except pd.errors.ParserError as e:
        log_entries.append(f"Error de parseo del CSV: {e}")
        filas_fallidas = 1
    except Exception as e:
        log_entries.append(f"Error inesperado durante la lectura o mapeo del CSV: {e}")
        filas_fallidas = 1

    return {
        "filas_procesadas": filas_procesadas,
        "filas_fallidas": filas_fallidas,
        "log": "\n".join(log_entries)
    }