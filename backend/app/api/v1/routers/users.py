from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user, require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import ChangePasswordRequest, UserCreate, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[UserResponse]:
    """List all users (admin only)."""
    service = AuthService(db)
    users = await service.list_users()
    return [UserResponse.model_validate(u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Create a new user account (admin only)."""
    service = AuthService(db)
    user = await service.register(data)
    return UserResponse.model_validate(user)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Change the current user's password."""
    service = AuthService(db)
    await service.change_password(current_user, data.current_password, data.new_password)
