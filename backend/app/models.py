import enum
from sqlalchemy import Column, Integer, String, Numeric, Date, ForeignKey, JSON, func, Enum, Text, Boolean, DateTime
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from database import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    nombre = Column(String, nullable=True)
    rol = Column(String, default="viewer", nullable=False)  # 'admin' | 'viewer'
    activo = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

class EstadoProcesamiento(enum.Enum):
    PENDIENTE = "PENDIENTE"
    PROCESANDO = "PROCESANDO"
    COMPLETADO = "COMPLETADO"
    FALLIDO = "FALLIDO"

class Archivo(Base):
    __tablename__ = "archivos"

    id = Column(Integer, primary_key=True, index=True)
    nombre_visible = Column(String, nullable=False)
    nombre_archivo_original = Column(String, nullable=False)
    fecha_de_carga = Column(Date, server_default=func.now())
    descripcion = Column(String, nullable=True)
    
    # Campos para seguimiento de procesamiento
    estado = Column(Enum(EstadoProcesamiento), default=EstadoProcesamiento.PENDIENTE, nullable=False)
    log_procesamiento = Column(Text, nullable=True)
    filas_procesadas = Column(Integer, default=0)
    filas_fallidas = Column(Integer, default=0)

    # Relación con la tabla de hechos
    hechos = relationship("Hechos_Datos", back_populates="archivo", cascade="all, delete-orphan")
    metricas = relationship("Metricas", back_populates="archivo", cascade="all, delete-orphan") # Añadir relación inversa

class Dimension_Geografica(Base):
    __tablename__ = "dimension_geografica"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, unique=True, index=True, nullable=False)
    nivel = Column(String, index=True, nullable=False) # "Pais", "Provincia", "Partido", "Circuito"
    
    # Columna PostGIS (SRID 4326 es el estándar de lat/lon)
    geometria = Column(Geometry(geometry_type='MULTIPOLYGON', srid=4326), nullable=True) 
    
    parent_id = Column(Integer, ForeignKey("dimension_geografica.id"), nullable=True)
    
    # Relaciones (para que SQLAlchemy entienda la jerarquía)
    parent = relationship("Dimension_Geografica", remote_side=[id], back_populates="children")
    children = relationship("Dimension_Geografica", back_populates="parent")
    
    hechos = relationship("Hechos_Datos", back_populates="geografia")

class TipoMetrica(enum.Enum):
    ELECTORAL = "ELECTORAL"
    DEMOGRAFICA = "DEMOGRAFICA"
    GEOGRAFICA = "GEOGRAFICA"
    TEMPORAL = "TEMPORAL"
    ECONOMICA = "ECONOMICA"

class Metricas(Base):
    __tablename__ = "metricas"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre_clave = Column(String, unique=True, index=True, nullable=False)
    nombre_amigable = Column(String)
    tipo = Column(Enum(TipoMetrica), nullable=False, default=TipoMetrica.ELECTORAL) # Nuevo campo
    is_active = Column(Boolean, default=False, nullable=False)
    # 'log' | 'linear' | NULL (automática según dispersión de la muestra)
    escala_rango = Column(String, nullable=True)
    archivo_id = Column(Integer, ForeignKey("archivos.id"), nullable=True)
    
    hechos = relationship("Hechos_Datos", back_populates="metrica")
    archivo = relationship("Archivo", back_populates="metricas")

class Hechos_Datos(Base):
    __tablename__ = "hechos_datos"
    
    id = Column(Integer, primary_key=True, index=True) # Usa BigInteger si esperás millones de filas
    geografia_id = Column(Integer, ForeignKey("dimension_geografica.id"), index=True)
    metrica_id = Column(Integer, ForeignKey("metricas.id"), index=True)
    archivo_id = Column(Integer, ForeignKey("archivos.id"), index=True, nullable=False)
    fecha_dato = Column(Date, index=True)
    valor = Column(Numeric(15, 2)) # 15 dígitos totales, 2 decimales
    dimension_extra = Column(JSON, nullable=True)
    
    geografia = relationship("Dimension_Geografica", back_populates="hechos")
    metrica = relationship("Metricas", back_populates="hechos")
    archivo = relationship("Archivo", back_populates="hechos")
    
class Procesador(Base):
    __tablename__ = "procesadores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False, unique=True)
    tipo_archivo = Column(String, nullable=False) # ej: 'socioeconomico', 'electoral'
    nivel_geografico = Column(String, nullable=False) # ej: 'Circuito', 'Partido'
    metric_name = Column(String, nullable=False) # Nombre de la métrica principal que este procesador generará
    mapeo_columnas = Column(JSON, nullable=False) # ej: {"COL_A": "dni", "COL_B": "votos"}


class FeedSocioEstado(enum.Enum):
    BORRADOR = "BORRADOR"
    PUBLICADO = "PUBLICADO"


class AglomeradoEph(Base):
    __tablename__ = "aglomerado_eph"

    codigo = Column(Integer, primary_key=True)
    nombre = Column(String, nullable=False)
    region_macro = Column(Integer, nullable=True)

    pesos = relationship("AglomeradoPartidoPeso", back_populates="aglomerado")
    staging = relationship("FeedSocioStaging", back_populates="aglomerado")


class AglomeradoPartidoPeso(Base):
    __tablename__ = "aglomerado_partido_peso"

    id = Column(Integer, primary_key=True, index=True)
    aglomerado_cod = Column(Integer, ForeignKey("aglomerado_eph.codigo"), index=True, nullable=False)
    partido_nombre = Column(String, nullable=False)
    peso = Column(Numeric(10, 6), nullable=False)
    fuente = Column(String, nullable=True)

    aglomerado = relationship("AglomeradoEph", back_populates="pesos")


class FeedSocioStaging(Base):
    __tablename__ = "feed_socio_staging"

    id = Column(Integer, primary_key=True, index=True)
    aglomerado_cod = Column(Integer, ForeignKey("aglomerado_eph.codigo"), nullable=False)
    indicador_clave = Column(String, nullable=False, index=True)
    fecha_dato = Column(Date, nullable=False, index=True)
    valor = Column(Numeric(15, 4), nullable=False)
    estado = Column(Enum(FeedSocioEstado), default=FeedSocioEstado.BORRADOR, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    aglomerado = relationship("AglomeradoEph", back_populates="staging")
    