from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import geografia, archivos, metricas, procesadores, auth

app = FastAPI(title="Dashboard PBA Backend")

# --- Configuración de CORS ---
# Esto es crucial para permitir que el frontend (en otro dominio/puerto)
# se comunique con el backend.
origins = [
    "http://localhost",
    "http://localhost:3000",
    # Puedes añadir aquí la URL de tu frontend en producción
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# El schema de la DB lo maneja Alembic (entrypoint: `alembic upgrade head`).
# Ver DEPLOY.md §2.4 y backend/migrations/.

# Incluir routers
app.include_router(geografia.router, prefix="/api/v1")
app.include_router(archivos.router, prefix="/api/v1")
app.include_router(metricas.router, prefix="/api/v1")
app.include_router(procesadores.router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"status": "Dashboard PBA - API Corriendo"}