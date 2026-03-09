from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, user_id: str) -> User | None:
        result = await self._db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self._db.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[User]:
        result = await self._db.execute(select(User).order_by(User.created_at.desc()))
        return list(result.scalars().all())

    async def create(self, user: User) -> User:
        self._db.add(user)
        await self._db.flush()
        await self._db.refresh(user)
        return user

    async def update(self, user: User) -> User:
        await self._db.flush()
        await self._db.refresh(user)
        return user
