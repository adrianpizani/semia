import json
import asyncio
import unicodedata
from geoalchemy2.shape import from_shape
from shapely.geometry import shape
from sqlalchemy.future import select

# Usar importaciones relativas para que funcione dentro de la app
from ..database import AsyncSessionLocal
from ..models import Dimension_Geografica

# Diccionario de correcciones para nombres no coincidentes
# La clave es el nombre normalizado del archivo de circuitos, 
# el valor es el nombre normalizado como está en la base de datos.
SYNONYM_MAP = {
    "nueve de julio": "9 de julio",
    "veinticinco de mayo": "25 de mayo",
    "general juan madariaga": "general madariaga",
    "coronel de marina l.rosales": "coronel de marina leonardo rosales",
    "adolfo alsina": "adolfo alsina", # Ejemplo de identidad por si acaso
}

def normalize_text(text: str) -> str:
    if not text:
        return ""
    nfkd_form = unicodedata.normalize('NFD', text)
    only_ascii = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    return only_ascii.lower()

async def import_circuitos_data():
    # Seed data: backend/static/circuito-electorales-pba.geojson (COPY'd / bind-mounted at /app/static).
    geojson_path = "/app/static/circuito-electorales-pba.geojson"
    
    print(f"Iniciando importación de Circuitos GeoJSON desde: {geojson_path}")

    try:
        with open(geojson_path, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Archivo GeoJSON no encontrado en {geojson_path}")
        return
    except json.JSONDecodeError:
        print(f"Error: No se pudo decodificar el archivo GeoJSON en {geojson_path}")
        return

    async with AsyncSessionLocal() as session:
        partidos_result = await session.execute(
            select(Dimension_Geografica).filter(Dimension_Geografica.nivel == 'Partido')
        )
        partidos_map = {normalize_text(partido.nombre): partido.id for partido in partidos_result.scalars()}
        print(f"Cargados {len(partidos_map)} partidos en memoria con nombres normalizados.")

        for feature in geojson_data['features']:
            properties = feature['properties']
            geometry = feature['geometry']

            circuito_nombre_prop = properties.get('circuito')
            partido_nombre_prop = properties.get('departamen')
            
            if not circuito_nombre_prop or not partido_nombre_prop:
                print(f"Omitiendo feature por falta de 'circuito' o 'departamen': {properties}")
                continue

            nombre_completo = f"Circuito {circuito_nombre_prop} ({partido_nombre_prop})"

            existing_geo_result = await session.execute(
                select(Dimension_Geografica).filter_by(nombre=nombre_completo)
            )
            if existing_geo_result.scalar_one_or_none():
                continue

            # Lógica de corrección y búsqueda
            normalized_name = normalize_text(partido_nombre_prop)
            corrected_name = SYNONYM_MAP.get(normalized_name, normalized_name)
            parent_id = partidos_map.get(corrected_name)
            
            if not parent_id:
                print(f"ADVERTENCIA: No se encontró el partido padre '{partido_nombre_prop}' (buscado como: '{corrected_name}'). Omitiendo.")
                continue

            shapely_geometry = shape(geometry)

            db_geografia = Dimension_Geografica(
                nombre=nombre_completo,
                nivel="Circuito",
                geometria=from_shape(shapely_geometry, srid=4326),
                parent_id=parent_id
            )
            session.add(db_geografia)
            print(f"Añadido: {nombre_completo}")
        
        await session.commit()
        print("Importación de Circuitos GeoJSON completada.")

if __name__ == "__main__":
    print("Ejecutando script de importación de circuitos de forma autónoma...")
    asyncio.run(import_circuitos_data())
    print("Script finalizado.")
