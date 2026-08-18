# /backend/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

# DATABASE_URL = "postgresql+asyncpg://tu_usuario:tu_password@localhost/pba_dashboard"
# Docker usará su DNS interno para encontrar el contenedor 'db'
DATABASE_URL = "postgresql+asyncpg://root:root@db/pba_dashboard"

# 2. El "motor" asincrónico. echo=True inunda los logs en prod (queries del mapa).
_ECHO = os.getenv("SQL_ECHO", "false").lower() == "true"
engine = create_async_engine(DATABASE_URL, echo=_ECHO)

# 3. El creador de sesiones
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# 4. La "Base" de la que heredarán todos tus modelos
Base = declarative_base()

# Función de "dependencia" para usar en los endpoints
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session