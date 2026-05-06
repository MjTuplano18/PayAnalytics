from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user, require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import ChangePasswordRequest, SetAdminRequest, UserCreate, UserResponse
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


@router.patch("/{user_id}/admin", response_model=UserResponse)
async def set_user_admin(
    user_id: str,
    payload: SetAdminRequest,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Grant or revoke admin (superuser) privileges for a user (admin only)."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot modify their own admin status.",
        )
    service = AuthService(db)
    user = await service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    # Prevent any admin from revoking the protected superadmin's privileges.
    if (
        user.email.lower() == settings.PROTECTED_ADMIN_EMAIL.lower()
        and not payload.is_superuser
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The original admin account's privileges cannot be revoked.",
        )
    user.is_superuser = payload.is_superuser
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a user account (admin only)."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot delete their own account.",
        )

    service = AuthService(db)
    user = await service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if user.email.lower() == settings.PROTECTED_ADMIN_EMAIL.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The original admin account cannot be deleted.",
        )

    await db.delete(user)
    await db.commit()


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    data: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Change the current user's password."""
    service = AuthService(db)
    await service.change_password(current_user, data.current_password, data.new_password)
