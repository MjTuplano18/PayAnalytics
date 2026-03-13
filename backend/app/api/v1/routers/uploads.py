from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.routers.events import broadcast_new_upload
from app.db.session import get_db
from app.models.user import User
from app.repositories.upload_repository import UploadRepository
from app.schemas.upload import (
    AuditLogEntry,
    DashboardSummary,
    PaginatedTransactions,
    PaymentRecordOut,
    UploadSessionCreate,
    UploadSessionDetail,
    UploadSessionOut,
)

router = APIRouter(prefix="/uploads", tags=["Uploads"])


@router.post("", response_model=UploadSessionOut, status_code=status.HTTP_201_CREATED)
async def create_upload(
    payload: UploadSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadSessionOut:
    """Save an uploaded dataset (records parsed from Excel/CSV on the frontend)."""
    repo = UploadRepository(db)
    session = await repo.create_session(
        user_id=current_user.id,
        file_name=payload.file_name,
        records=payload.records,
    )
    # Notify all SSE-connected clients so their uploads list auto-refreshes
    await broadcast_new_upload(session.id, session.file_name)
    return UploadSessionOut.model_validate(session)


@router.get("", response_model=list[UploadSessionOut])
async def list_uploads(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UploadSessionOut]:
    """List all upload sessions for the current user."""
    repo = UploadRepository(db)
    sessions = await repo.list_sessions(user_id=current_user.id)
    return [UploadSessionOut.model_validate(s) for s in sessions]


@router.get("/{session_id}", response_model=UploadSessionDetail)
async def get_upload(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadSessionDetail:
    """Get a single upload session with all its records."""
    repo = UploadRepository(db)
    session = await repo.get_session(session_id=session_id, user_id=current_user.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")
    return UploadSessionDetail.model_validate(session)


@router.get("/{session_id}/transactions", response_model=PaginatedTransactions)
async def get_transactions(
    session_id: str,
    bank: str | None = None,
    touchpoint: str | None = None,
    search: str | None = None,
    payment_date: str | None = None,
    environment: str | None = None,
    page: int = 1,
    page_size: int = 25,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedTransactions:
    """Get paginated, filtered payment records for an upload session."""
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 200:
        page_size = 25

    repo = UploadRepository(db)
    total, total_amount, records = await repo.get_transactions(
        session_id=session_id,
        user_id=current_user.id,
        bank=bank,
        touchpoint=touchpoint,
        search=search,
        payment_date=payment_date,
        environment=environment,
        page=page,
        page_size=page_size,
    )
    return PaginatedTransactions(
        total=total,
        total_amount=total_amount,
        page=page,
        page_size=page_size,
        items=[PaymentRecordOut.model_validate(r) for r in records],
    )


@router.get("/{session_id}/dashboard", response_model=DashboardSummary)
async def get_dashboard(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    """Get aggregated KPI summary for an upload session."""
    repo = UploadRepository(db)
    summary = await repo.get_dashboard_summary(session_id=session_id, user_id=current_user.id)
    if not summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")
    return DashboardSummary(**summary)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an upload session. Admins can delete any session; users can only delete their own."""
    repo = UploadRepository(db)
    if current_user.is_superuser:
        deleted = await repo.delete_session_admin(session_id)
    else:
        deleted = await repo.delete_session(session_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload session not found or you are not authorized to delete it.",
        )


@router.get("/admin/audit-log", response_model=list[AuditLogEntry])
async def get_audit_log(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogEntry]:
    """Admin only: list all upload sessions across all users."""
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only.")
    repo = UploadRepository(db)
    sessions = await repo.list_all_sessions()
    return [
        AuditLogEntry(
            id=s.id,
            file_name=s.file_name,
            total_records=s.total_records,
            total_amount=s.total_amount,
            uploaded_at=s.uploaded_at,
            user_id=s.user_id,
            user_email=s.user.email if s.user else "unknown",
            user_name=s.user.full_name if s.user else "unknown",
        )
        for s in sessions
    ]
