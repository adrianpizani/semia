from pydantic import BaseModel, Field, ConfigDict
from datetime import date
from typing import List, Literal, Union, Tuple
from models import EstadoProcesamiento, TipoMetrica # Importar los Enums

# --- Geografía ---

# Schema para CREAR una geografía (lo que entra por la API)
class GeografiaCreate(BaseModel):
    nombre: str
    nivel: str
    parent_id: int | None = None # Opcional al crear

# Schema para LEER una geografía (lo que sale de la API)
class Geografia(BaseModel):
    id: int
    nombre: str
    nivel: str
    parent_id: int | None

    model_config = ConfigDict(from_attributes=True)

# --- Archivo ---

class ArchivoBase(BaseModel):
    nombre_visible: str
    # El nombre original no se necesita en el schema base, se genera en el backend
    descripcion: str | None = None

class ArchivoCreate(BaseModel):
    # No se incluye en la creación, se asigna en el endpoint
    pass

class Archivo(BaseModel):
    id: int
    nombre_visible: str
    nombre_archivo_original: str
    fecha_de_carga: date
    descripcion: str | None
    
    # Nuevos campos de estado
    estado: EstadoProcesamiento
    log_procesamiento: str | None
    filas_procesadas: int | None
    filas_fallidas: int | None

    model_config = ConfigDict(from_attributes=True)

# --- Metrica ---

# Schema para mostrar info básica del archivo dentro de una métrica
class ArchivoForMetrica(BaseModel):
    id: int
    nombre_visible: str
    model_config = ConfigDict(from_attributes=True)

class Metrica(BaseModel):
    id: int
    nombre_amigable: str
    is_active: bool
    tipo: TipoMetrica # Campo añadido
    archivo: ArchivoForMetrica | None

    model_config = ConfigDict(from_attributes=True)

# --- Filtros Genéricos ---

class FiltroBase(BaseModel):
    metrica_id: int

class FiltroCategorico(FiltroBase):
    tipo: Literal["categoria"] = "categoria"
    # Dimensión de `dimension_extra` sobre la que filtra.
    # Default 'agrupacion_nombre' (partido) para compatibilidad; también puede ser 'año' o 'votos_tipo'.
    dimension: str = "agrupacion_nombre"
    valores: list[str] # e.g., ["PARTIDO_A", "FRENTE_DE_TODOS"]

class FiltroRango(FiltroBase):
    tipo: Literal["rango"] = "rango"
    rango: tuple[float, float] # e.g., [min_pbg, max_pbg]

# Union de todos los tipos de filtro posibles
AnyFiltro = Union[FiltroCategorico, FiltroRango]

# --- GeoData Request ---

class GeoDataRequest(BaseModel):
    metrica_ids: list[int]
    agregacion: str = "sum"
    filtros: list[AnyFiltro] | None = None

class FilterRequest(BaseModel):
    filtros: list[AnyFiltro] | None = None

# Opciones disponibles de dimensiones para poblar los selectores de filtro del frontend.
class MetricaOpciones(BaseModel):
    partidos: list[str] = []
    años: list[str] = []
    votos_tipos: list[str] = []

# --- Electoral Metric Data ---

class ResultadoPartido(BaseModel):
    partido: str
    votos: float

class GeoDataElectoral(BaseModel):
    geografia_id: int
    nombre: str
    resultados: list[ResultadoPartido]
    ganador: ResultadoPartido | None

class GenericData(BaseModel):
        geografia_id: int
        geografia_nombre: str
        metrica_id: int
        metrica_nombre: str
        valor: float | None
        
        model_config = ConfigDict(from_attributes=True)

# --- Procesador Match Request ---
class ProcesadorMatchRequest(BaseModel):
    headers: list[str]
    tipo_archivo: str | None = None
    nivel_geografico: str | None = None
    metric_name: str | None = None # Nuevo campo    
# --- Procesador ---
class ProcesadorBase(BaseModel):
    nombre: str
    tipo_archivo: str
    nivel_geografico: str
    metric_name: str # Nuevo campo
    mapeo_columnas: dict[str, str]

class ProcesadorCreate(ProcesadorBase):
    pass

class Procesador(ProcesadorBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
    