import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Environment(Base):
    """Deployment environment (e.g. ENV1, ENV2, …)."""

    __tablename__ = "environments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)

    campaigns: Mapped[list["Campaign"]] = relationship(
        "Campaign", back_populates="environment", cascade="all, delete-orphan", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Environment id={self.id} name={self.name}>"


class Campaign(Base):
    """A campaign (bank / client) belonging to a specific environment."""

    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    environment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("environments.id", ondelete="CASCADE"), nullable=False, index=True
    )

    environment: Mapped["Environment"] = relationship("Environment", back_populates="campaigns")

    def __repr__(self) -> str:
        return f"<Campaign id={self.id} name={self.name} env={self.environment_id}>"


class Touchpoint(Base):
    """Shared touchpoint type used across all environments."""

    __tablename__ = "touchpoints"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<Touchpoint id={self.id} name={self.name}>"
