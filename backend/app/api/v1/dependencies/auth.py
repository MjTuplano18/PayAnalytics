from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import AuthService

http_bearer = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(http_bearer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """FastAPI dependency to extract and validate the current authenticated user."""
    service = AuthService(db)
    return await service.get_current_user(credentials.credentials)


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Require the current user to be a superuser/admin."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user
