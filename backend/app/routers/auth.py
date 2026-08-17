# routers/auth.py
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import schemas
import security
from database import get_db
from dependencies import get_current_user, require_admin

router = APIRouter(prefix="/auth", tags=["Auth"])


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=security.COOKIE_NAME,
        value=token,
        httponly=True,
        secure=security.COOKIE_SECURE,  # True en producción con HTTPS
        samesite="lax",
        max_age=security.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


@router.post("/login", response_model=schemas.Token)
async def login(
    payload: schemas.LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Autentica un usuario por email+password y setea la cookie httpOnly JWT."""
    email = payload.email.lower()
    result = await db.execute(select(models.Usuario).where(models.Usuario.email == email))
    user = result.scalar_one_or_none()

    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas"
        )
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Usuario desactivado"
        )

    token = security.create_access_token(subject=user.email, rol=user.rol)
    _set_auth_cookie(response, token)

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/logout")
async def logout(response: Response):
    """Cierra la sesión borrando la cookie JWT."""
    response.delete_cookie(security.COOKIE_NAME, path="/")
    return {"detail": "Sesión cerrada"}


@router.get("/me", response_model=schemas.Usuario)
async def me(current_user: models.Usuario = Depends(get_current_user)):
    """Devuelve el usuario de la sesión actual. Útil para validar el token en el frontend."""
    return current_user


@router.post("/register", response_model=schemas.Usuario)
async def register(
    payload: schemas.UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    _admin: models.Usuario = Depends(require_admin),
):
    """Crea un usuario. Solo accesible para administradores."""
    email = payload.email.lower()
    existing = (
        await db.execute(select(models.Usuario).where(models.Usuario.email == email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    user = models.Usuario(
        email=email,
        password_hash=security.hash_password(payload.password),
        nombre=payload.nombre,
        rol=payload.rol,
        activo=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
