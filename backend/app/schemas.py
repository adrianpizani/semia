from pydantic import BaseModel, Field, ConfigDict, EmailStr, AfterValidator
from datetime import date, datetime
from typing import Annotated, List, Literal, Union, Tuple
import email_validator
from models import EstadoProcesamiento, TipoMetrica # Importar los Enums


def _validar_email(value: str) -> str:
    """Valida el email permitiendo dominios de uso especial/reservados (p. ej. `.local`
    de desarrollo), que `EmailStr` rechazaría por defecto."""
    email_validator.validate_email(
        value,
        check_deliverability=False,
        allow_special_use_domains=True,
    )
    return value.lower()


# Tipo email del proyecto: igual de estricto que EmailStr, pero admite `.local`.
Email = Annotated[str, AfterValidator(_validar_email)]

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
    escala_rango: Literal["log", "linear"] | None = None
    archivo: ArchivoForMetrica | None
    # Feed EPH trimestral (calculado al listar; null en métricas no-EPH)
    periodo_publicado: str | None = None
    trimestre_referencia: str | None = None
    es_trimestre_vigente: bool | None = None

    model_config = ConfigDict(from_attributes=True)


class MetricaEscalaUpdate(BaseModel):
    escala_rango: Literal["log", "linear"] | None = None

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

# --- Serie histórica por municipio (sparkline) ---

class SerieHistoricaPunto(BaseModel):
    """Un punto de la serie: votos agregados por partido en un año, para un municipio."""
    anio: str
    partido: str
    votos: float

class SerieHistorica(BaseModel):
    """Serie histórica de votos por (año, partido) para un municipio.
    Pensada para renderizar una sparkline compacta (~80x24px)."""
    geografia_id: int
    puntos: list[SerieHistoricaPunto]

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

# --- Autenticación ---

class UsuarioCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    nombre: str | None = None
    rol: Literal["admin", "viewer"] = "viewer"


class Usuario(BaseModel):
    id: int
    email: EmailStr
    nombre: str | None
    rol: str
    activo: bool

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Usuario


# --- Feed socioeconómico INDEC ---

class FeedSocioStagingRow(BaseModel):
    id: int
    aglomerado_cod: int
    aglomerado_nombre: str
    indicador_clave: str
    fecha_dato: str
    valor: float
    estado: str


class FeedSocioIngestResult(BaseModel):
    inserted: int
    skipped: int
    columnas: list[str] | None = None
    indicadores: list[str] | None = None
    periodo: str | None = None
    fecha_dato: str | None = None
    source: str | None = None
    motor: str | None = None
    error: str | None = None


class FeedSocioPreview(BaseModel):
    staging_rows: int
    partido_hechos_estimados: int
    indicador_clave: str


class FeedSocioConfig(BaseModel):
    borrar_trimestre_anterior_al_publicar: bool = False
    trimestre_referencia: str | None = None


class FeedSocioConfigUpdate(BaseModel):
    borrar_trimestre_anterior_al_publicar: bool


class FeedSocioPublishResult(BaseModel):
    hechos: int
    fallidas: int
    metrica_id: int
    metrica_clave: str
    archivo_id: int
    log: str
    publicados: list[str] | None = None
    hechos_eliminados: int | None = None
    periodo: str | None = None
    error: str | None = None