# dependencies.py
"""Dependencias de autenticación reutilizables por los routers."""
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models
import security
from database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No autenticado",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: str | None = Depends(oauth2_scheme),
) -> models.Usuario:
    """Valida el JWT (cookie httpOnly o header Authorization) y devuelve el usuario."""
    token = token or request.cookies.get(security.COOKIE_NAME)
    if not token:
        raise _credentials_error

    try:
        payload = security.decode_token(token)
        email = payload.get("sub")
        if not email:
            raise _credentials_error
    except jwt.PyJWTError:
        raise _credentials_error

    result = await db.execute(select(models.Usuario).where(models.Usuario.email == email))
    user = result.scalar_one_or_none()
    if user is None or not user.activo:
        raise _credentials_error
    return user


async def require_admin(current_user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
    """Requiere un usuario autenticado con rol 'admin'."""
    if current_user.rol != "admin":
        raise HTTPException(
            status_code=403, detail="Se requieren permisos de administrador"
        )
    return current_user
