import json
import uuid
from decimal import Decimal


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o: object) -> object:
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies.auth import get_current_user
from app.core.cache import cache_get, cache_set, cache_invalidate
from app.api.v1.routers.events import broadcast_new_upload, broadcast_upload_progress
from app.db.session import get_db
from app.models.user import User
from app.models.upload import UploadSession, PaymentRecord
from app.repositories.audit_log_repository import AuditLogRepository
from app.repositories.upload_repository import UploadRepository
from app.schemas.upload import (
    AuditLogEntry,
    BulkDeleteRequest,
    DashboardSummary,
    PaginatedTransactions,
    PaymentRecordIn,
    PaymentRecordOut,
    UnifiedAuditLogEntry,
    UploadSessionCreate,
    UploadSessionDetail,
    UploadSessionOut,
    AuditLogCreate,
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
    audit_repo = AuditLogRepository(db)
    session = await repo.create_session(
        user_id=current_user.id,
        file_name=payload.file_name,
        records=payload.records,
        on_progress=broadcast_upload_progress,
    )
    await audit_repo.log_action(
        user_id=current_user.id,
        action="file_upload",
        file_name=payload.file_name,
        session_id=session.id,
        record_count=session.total_records,
        total_amount=session.total_amount,
    )
    # Notify all SSE-connected clients so their uploads list auto-refreshes
    await broadcast_new_upload(session.id, session.file_name)
    return UploadSessionOut.model_validate(session)


MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv"}


@router.post("/file", response_model=UploadSessionOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadSessionOut:
    """
    Upload an Excel/CSV file for server-side streaming parse.

    The file is parsed row-by-row using openpyxl read-only mode to keep
    peak memory low (important for 512 MB Render free tier).
    SSE progress events are broadcast during batch inserts.
    """
    import os
    from app.utils.file_parser import stream_xlsx, stream_csv

    file_name = file.filename or "upload"
    ext = os.path.splitext(file_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Read file with size guard
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit.",
        )

    # Stream-parse into records
    if ext == ".csv":
        records = list(stream_csv(contents))
    else:
        records = list(stream_xlsx(contents))

    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file contains no data rows.",
        )

    repo = UploadRepository(db)
    audit_repo = AuditLogRepository(db)
    session = await repo.create_session(
        user_id=current_user.id,
        file_name=file_name,
        records=records,
        on_progress=broadcast_upload_progress,
    )
    await audit_repo.log_action(
        user_id=current_user.id,
        action="file_upload",
        file_name=file_name,
        session_id=session.id,
        record_count=session.total_records,
        total_amount=session.total_amount,
    )
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


@router.get("/unified-audit-log", response_model=list[UnifiedAuditLogEntry])
async def get_unified_audit_log(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UnifiedAuditLogEntry]:
    """List file actions for the current user (up to 50 entries)."""
    audit_repo = AuditLogRepository(db)
    logs = await audit_repo.list_user_logs(current_user.id, limit=50)

    # Determine which entries can be undone: 3 most recent non-undone entries that have snapshot_data
    undoable_ids: set[str] = set()
    count = 0
    for log in logs:  # already sorted by created_at desc
        if count >= 3:
            break
        if not log.is_undone and log.snapshot_data:
            undoable_ids.add(log.id)
            count += 1

    return [
        UnifiedAuditLogEntry(
            id=log.id,
            user_id=log.user_id or "unknown",
            user_email=log.user.email if log.user else "unknown",
            user_name=log.user.full_name if log.user else "unknown",
            action=log.action,
            file_name=log.file_name,
            session_id=log.session_id,
            record_count=log.record_count,
            total_amount=log.total_amount,
            details=log.details,
            is_undone=log.is_undone,
            can_undo=log.id in undoable_ids,
            created_at=log.created_at,
        )
        for log in logs
    ]


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
    # Recompute total from SQL SUM (exact on NUMERIC columns) instead of
    # relying on the stored value which may have floating-point drift.
    from sqlalchemy import func as sa_func, select as sa_select
    from app.models.upload import PaymentRecord
    agg = await db.execute(
        sa_select(sa_func.coalesce(sa_func.sum(PaymentRecord.payment_amount), 0))
        .where(PaymentRecord.session_id == session_id)
    )
    session.total_amount = float(agg.scalar_one())
    return UploadSessionDetail.model_validate(session)


@router.get("/{session_id}/transactions", response_model=PaginatedTransactions)
async def get_transactions(
    session_id: str,
    bank: str | None = None,
    touchpoint: str | None = None,
    search: str | None = None,
    payment_date: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
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
        raise HTTPException(status_code=422, detail="page_size must be between 1 and 200.")

    repo = UploadRepository(db)
    total, total_amount, records = await repo.get_transactions(
        session_id=session_id,
        user_id=current_user.id,
        bank=bank,
        touchpoint=touchpoint,
        search=search,
        payment_date=payment_date,
        date_from=date_from,
        date_to=date_to,
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


@router.get("/{session_id}/export/records", response_model=list[PaymentRecordOut])
async def export_all_records(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PaymentRecordOut]:
    """Return ALL payment records for a session in a single response (no pagination).
    Intended for client-side export. Use /transactions for normal paginated access."""
    repo = UploadRepository(db)
    records = await repo.get_all_records_for_export(session_id, current_user.id)
    if not records:
        # Check whether session exists vs. truly empty
        session = await repo.get_session_metadata(session_id, current_user.id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")
    return [PaymentRecordOut.model_validate(r) for r in records]


@router.get("/{session_id}/dashboard", response_model=DashboardSummary)
async def get_dashboard(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    """Get aggregated KPI summary for an upload session (cached 5 min)."""
    cache_key = f"dashboard:{session_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return DashboardSummary(**cached)

    repo = UploadRepository(db)
    summary = await repo.get_dashboard_summary(session_id=session_id, user_id=current_user.id)
    if not summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")
    cache_set(cache_key, summary, ttl=300)
    return DashboardSummary(**summary)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_upload(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an upload session. Admins can delete any session; users can only delete their own."""
    repo = UploadRepository(db)
    audit_repo = AuditLogRepository(db)

    # Fetch session metadata only (no records) to avoid OOM on large datasets
    if current_user.is_superuser:
        session_obj = await repo.get_session_any_user(session_id)
    else:
        # Use a lightweight query — do NOT load records
        session_obj = await repo.get_session_any_user(session_id)
        if session_obj and session_obj.user_id != current_user.id:
            session_obj = None

    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Upload session not found or you are not authorized to delete it.",
        )

    # Lightweight snapshot — metadata only, no individual records (avoids OOM)
    snapshot = json.dumps({
        "user_id": session_obj.user_id,
        "file_name": session_obj.file_name,
        "total_records": session_obj.total_records,
        "total_amount": session_obj.total_amount,
    }, cls=_DecimalEncoder)

    # Log the deletion before actually deleting
    await audit_repo.log_action(
        user_id=current_user.id,
        action="file_delete",
        file_name=session_obj.file_name,
        session_id=session_obj.id,
        record_count=session_obj.total_records,
        total_amount=session_obj.total_amount,
        snapshot_data=snapshot,
    )

    if current_user.is_superuser:
        await repo.delete_session_admin(session_id)
    else:
        await repo.delete_session(session_id, current_user.id)
    cache_invalidate(f"dashboard:{session_id}")


@router.post("/{session_id}/transactions", response_model=PaymentRecordOut, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    session_id: str,
    payload: PaymentRecordIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentRecordOut:
    """Add a single transaction record to an existing upload session."""
    repo = UploadRepository(db)
    record = await repo.create_transaction(
        session_id=session_id,
        user_id=current_user.id,
        bank=payload.bank,
        account=payload.account,
        payment_amount=payload.payment_amount,
        touchpoint=payload.touchpoint,
        payment_date=payload.payment_date,
        environment=payload.environment,
        month=payload.month,
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")
    # Log creation of a single record
    audit_repo = AuditLogRepository(db)
    session_obj = await repo.get_session_metadata(session_id, current_user.id)
    # compact snapshot of the created record
    snapshot = json.dumps({
        "session_id": session_id,
        "record": {
            "id": getattr(record, "id", None),
            "bank": record.bank,
            "account": record.account,
            "touchpoint": record.touchpoint,
            "payment_date": record.payment_date,
            "payment_amount": record.payment_amount,
            "environment": record.environment,
        },
    }, cls=_DecimalEncoder)

    await audit_repo.log_action(
        user_id=current_user.id,
        action="record_create",
        file_name=session_obj.file_name if session_obj else "unknown",
        session_id=session_id,
        record_count=1,
        details=f"Created record {getattr(record, 'id', 'unknown')}",
        snapshot_data=snapshot,
    )
    cache_invalidate(f"dashboard:{session_id}")
    return PaymentRecordOut.model_validate(record)


@router.put("/{session_id}/transactions/{record_id}", response_model=PaymentRecordOut)
async def update_transaction(
    session_id: str,
    record_id: str,
    payload: PaymentRecordIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaymentRecordOut:
    """Update a single transaction record."""
    repo = UploadRepository(db)
    # Capture existing record snapshot (compact) before update
    before_record = await repo.get_record(record_id, session_id, current_user.id)
    before_rec = None
    if before_record:
        before_rec = {
            "id": before_record.id,
            "bank": before_record.bank,
            "account": before_record.account,
            "touchpoint": before_record.touchpoint,
            "payment_date": before_record.payment_date,
            "payment_amount": before_record.payment_amount,
            "environment": before_record.environment,
            "month": before_record.month,
        }

    updated = await repo.update_transaction(
        record_id=record_id,
        session_id=session_id,
        user_id=current_user.id,
        bank=payload.bank,
        account=payload.account,
        payment_amount=payload.payment_amount,
        touchpoint=payload.touchpoint,
        payment_date=payload.payment_date,
        environment=payload.environment,
        month=payload.month,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    # Log update of a single record
    audit_repo = AuditLogRepository(db)
    # compact snapshot containing before and after
    after_rec = {
        "id": getattr(updated, "id", None),
        "bank": updated.bank,
        "account": updated.account,
        "touchpoint": updated.touchpoint,
        "payment_date": updated.payment_date,
        "payment_amount": updated.payment_amount,
        "environment": updated.environment,
        "month": updated.month,
    }
    snapshot = json.dumps({"session_id": session_id, "before": before_rec, "after": after_rec}, cls=_DecimalEncoder)
    session_obj = await repo.get_session_metadata(session_id, current_user.id)
    await audit_repo.log_action(
        user_id=current_user.id,
        action="record_update",
        file_name=session_obj.file_name if session_obj else "unknown",
        session_id=session_id,
        record_count=1,
        details=f"Updated record {record_id}",
        snapshot_data=snapshot,
    )
    cache_invalidate(f"dashboard:{session_id}")
    return PaymentRecordOut.model_validate(updated)


@router.post("/{session_id}/transactions/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_transactions(
    session_id: str,
    payload: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete multiple transaction records by ID in a single operation."""
    if not payload.ids:
        return {"deleted": 0}
    repo = UploadRepository(db)
    audit_repo = AuditLogRepository(db)

    # Get session info for audit log
    session_obj = await repo.get_session_metadata(session_id, current_user.id)
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    # Fetch only the specific records being deleted (not all records)
    matching_records = await repo.get_records_by_ids(session_id, current_user.id, payload.ids)
    snapshot = None
    if matching_records:
        snapshot = json.dumps({
            "session_id": session_id,
            "records": [
                {
                    "id": r.id,
                    "bank": r.bank,
                    "account": r.account,
                    "touchpoint": r.touchpoint,
                    "payment_date": r.payment_date,
                    "payment_amount": r.payment_amount,
                    "environment": r.environment,
                }
                for r in matching_records
            ],
        }, cls=_DecimalEncoder)

    count = await repo.delete_transactions_bulk(
        session_id=session_id, user_id=current_user.id, record_ids=payload.ids
    )

    if count > 0:
        await audit_repo.log_action(
            user_id=current_user.id,
            action="record_bulk_delete",
            file_name=session_obj.file_name,
            session_id=session_id,
            record_count=count,
            details=f"Bulk deleted {count} records by ID",
            snapshot_data=snapshot,
        )

    cache_invalidate(f"dashboard:{session_id}")
    return {"deleted": count}


@router.delete("/{session_id}/transactions/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    session_id: str,
    record_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a single transaction record."""
    repo = UploadRepository(db)
    audit_repo = AuditLogRepository(db)

    # Fetch only the specific record (not all records)
    target_record = await repo.get_record(record_id, session_id, current_user.id)
    session_obj = await repo.get_session_metadata(session_id, current_user.id)
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    snapshot = None
    if target_record:
        snapshot = json.dumps({
            "session_id": session_id,
            "record": {
                "bank": target_record.bank,
                "account": target_record.account,
                "touchpoint": target_record.touchpoint,
                "payment_date": target_record.payment_date,
                "payment_amount": target_record.payment_amount,
                "environment": target_record.environment,
            },
        }, cls=_DecimalEncoder)

    deleted = await repo.delete_transaction(record_id=record_id, session_id=session_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")

    await audit_repo.log_action(
        user_id=current_user.id,
        action="record_delete",
        file_name=session_obj.file_name,
        session_id=session_id,
        record_count=1,
        details=f"Deleted record {record_id}",
        snapshot_data=snapshot,
    )
    cache_invalidate(f"dashboard:{session_id}")


@router.delete("/{session_id}/transactions", status_code=status.HTTP_200_OK)
async def delete_transactions_by_date_range(
    session_id: str,
    date_from: str = "",
    date_to: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Mass delete transactions within a date range. Returns count of deleted records."""
    if not date_from or not date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="date_from and date_to are required.")
    repo = UploadRepository(db)
    audit_repo = AuditLogRepository(db)

    # Lightweight session check (no records loaded)
    session_obj = await repo.get_session_metadata(session_id, current_user.id)
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    # Lightweight snapshot — just metadata about the date range (avoids loading all records)
    count = await repo.delete_transactions_by_date_range(
        session_id=session_id, user_id=current_user.id, date_from=date_from, date_to=date_to
    )

    if count > 0:
        snapshot = json.dumps({
            "session_id": session_id,
            "date_from": date_from,
            "date_to": date_to,
            "deleted_count": count,
        }, cls=_DecimalEncoder)
        await audit_repo.log_action(
            user_id=current_user.id,
            action="record_bulk_delete",
            file_name=session_obj.file_name,
            session_id=session_id,
            record_count=count,
            details=f"Bulk deleted {count} records ({date_from} to {date_to})",
            snapshot_data=snapshot,
        )

    cache_invalidate(f"dashboard:{session_id}")
    return {"deleted": count}


@router.post("/audit", status_code=status.HTTP_201_CREATED)
async def create_audit_entry(
    payload: AuditLogCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a custom audit log entry for the current user."""
    audit_repo = AuditLogRepository(db)
    await audit_repo.log_action(
        user_id=current_user.id,
        action=payload.action,
        file_name=payload.file_name,
        session_id=payload.session_id,
        record_count=payload.record_count,
        total_amount=payload.total_amount,
        details=payload.details,
        snapshot_data=payload.snapshot_data,
    )
    return {"detail": "logged"}


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


@router.post("/audit-log/{entry_id}/undo", status_code=status.HTTP_200_OK)
async def undo_audit_entry(
    entry_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Undo/revert an audit log entry (restore deleted data or remove uploaded data). Users can undo their own entries."""
    audit_repo = AuditLogRepository(db)
    entry = await audit_repo.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log entry not found.")
    if entry.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only undo your own actions.")
    if entry.is_undone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This action has already been undone.")
    if not entry.snapshot_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No snapshot data available for undo.")

    # Verify this entry is among the 3 most recent undoable entries for this user
    logs = await audit_repo.list_user_logs(current_user.id, limit=10)
    undoable_ids: set[str] = set()
    count = 0
    for log in logs:
        if count >= 3:
            break
        if not log.is_undone and log.snapshot_data:
            undoable_ids.add(log.id)
            count += 1
    if entry_id not in undoable_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only the 3 most recent entries can be undone.")

    snapshot = json.loads(entry.snapshot_data)

    if entry.action == "file_delete":
        # Restore the deleted session and all its records
        session_data = snapshot.get("session", {})
        records_data = snapshot.get("records", [])
        restored_session = UploadSession(
            id=session_data.get("id", str(uuid.uuid4())),
            user_id=session_data.get("user_id", entry.user_id),
            file_name=session_data.get("file_name", entry.file_name),
            total_records=session_data.get("total_records", len(records_data)),
            total_amount=session_data.get("total_amount", 0.0),
        )
        db.add(restored_session)
        await db.flush()
        for rec in records_data:
            record = PaymentRecord(
                id=rec.get("id", str(uuid.uuid4())),
                session_id=restored_session.id,
                bank=rec.get("bank", ""),
                account=rec.get("account", ""),
                touchpoint=rec.get("touchpoint", ""),
                payment_date=rec.get("payment_date", ""),
                payment_amount=rec.get("payment_amount", 0.0),
                environment=rec.get("environment", ""),
                month=rec.get("month", ""),
            )
            db.add(record)

    elif entry.action == "record_delete":
        # Restore a single deleted record
        record_data = snapshot.get("record", {})
        session_id = snapshot.get("session_id", entry.session_id)
        record = PaymentRecord(
            session_id=session_id,
            bank=record_data.get("bank", ""),
            account=record_data.get("account", ""),
            touchpoint=record_data.get("touchpoint", ""),
            payment_date=record_data.get("payment_date", ""),
            payment_amount=record_data.get("payment_amount", 0.0),
            environment=record_data.get("environment", ""),
            month=record_data.get("month", ""),
        )
        db.add(record)
        await db.flush()
        # Update session totals
        repo = UploadRepository(db)
        await repo._update_session_totals(session_id)

    elif entry.action == "record_bulk_delete":
        # Restore bulk deleted records
        records_data = snapshot.get("records", [])
        session_id = snapshot.get("session_id", entry.session_id)
        for rec in records_data:
            record = PaymentRecord(
                session_id=session_id,
                bank=rec.get("bank", ""),
                account=rec.get("account", ""),
                touchpoint=rec.get("touchpoint", ""),
                payment_date=rec.get("payment_date", ""),
                payment_amount=rec.get("payment_amount", 0.0),
                environment=rec.get("environment", ""),
                month=rec.get("month", ""),
            )
            db.add(record)
        await db.flush()
        # Update session totals
        repo = UploadRepository(db)
        await repo._update_session_totals(session_id)

    elif entry.action == "file_upload":
        # Undo an upload = delete the session
        if entry.session_id:
            repo = UploadRepository(db)
            await repo.delete_session_admin(entry.session_id)

    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Undo not supported for action: {entry.action}")

    await audit_repo.mark_undone(entry)
    await db.commit()
    # Invalidate dashboard cache for the affected session
    affected_session_id = snapshot.get("session_id") or entry.session_id
    if affected_session_id:
        cache_invalidate(f"dashboard:{affected_session_id}")
    return {"detail": f"Successfully undone: {entry.action} — {entry.file_name}"}
