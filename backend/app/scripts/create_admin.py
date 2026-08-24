# scripts/create_admin.py
"""Crea el usuario administrador inicial (idempotente).

Uso (desde la raíz del repo, con la DB levantada):
    docker exec -it pba_backend bash -c "PYTHONPATH=/ python -m app.scripts.create_admin"

Configura ADMIN_EMAIL y ADMIN_PASSWORD por env (defaults para desarrollo local).
"""
import asyncio
import os

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import Usuario
from ..security import hash_password


async def main() -> None:
    email = os.getenv("ADMIN_EMAIL", "admin@semia.studio").lower()
    password = os.getenv("ADMIN_PASSWORD", "admin123")

    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(Usuario).where(Usuario.email == email))
        ).scalar_one_or_none()
        if existing:
            print(f"El admin ya existe: {email}")
            return

        user = Usuario(
            email=email,
            password_hash=hash_password(password),
            nombre="Administrador",
            rol="admin",
            activo=True,
        )
        db.add(user)
        await db.commit()
        print(f"Admin creado: {email} (password: {password})")


if __name__ == "__main__":
    asyncio.run(main())
