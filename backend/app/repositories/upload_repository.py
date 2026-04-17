from sqlalchemy import delete as sql_delete, func, select, or_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.upload import PaymentRecord, UploadSession
from app.schemas.upload import PaymentRecordIn


class UploadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_session(
        self,
        user_id: str,
        file_name: str,
        records: list[PaymentRecordIn],
    ) -> UploadSession:
        total_amount = round(sum(r.payment_amount for r in records), 2)
        upload = UploadSession(
            user_id=user_id,
            file_name=file_name,
            total_records=len(records),
            total_amount=total_amount,
        )
        self.session.add(upload)
        await self.session.flush()  # get the id before bulk insert

        payment_records = [
            PaymentRecord(
                session_id=upload.id,
                bank=r.bank,
                account=r.account,
                touchpoint=r.touchpoint,
                payment_date=r.payment_date,
                payment_amount=round(r.payment_amount, 2),
                environment=r.environment,
                month=r.month,
            )
            for r in records
        ]
        self.session.add_all(payment_records)
        await self.session.commit()
        await self.session.refresh(upload)
        return upload

    async def list_sessions(self, user_id: str) -> list[UploadSession]:
        result = await self.session.execute(
            select(UploadSession)
            .where(UploadSession.user_id == user_id)
            .order_by(UploadSession.uploaded_at.desc())
        )
        return list(result.scalars().all())

    async def list_all_sessions(self, limit: int = 500) -> list[UploadSession]:
        """Admin: list ALL upload sessions across all users, with user relationship."""
        result = await self.session.execute(
            select(UploadSession)
            .options(selectinload(UploadSession.user))
            .order_by(UploadSession.uploaded_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_session(self, session_id: str, user_id: str) -> UploadSession | None:
        result = await self.session.execute(
            select(UploadSession)
            .options(selectinload(UploadSession.records))
            .where(UploadSession.id == session_id, UploadSession.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_session_any_user(self, session_id: str) -> UploadSession | None:
        """Admin: get session regardless of owner."""
        result = await self.session.execute(
            select(UploadSession).where(UploadSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def delete_session(self, session_id: str, user_id: str) -> bool:
        """Delete a session owned by user_id. Returns True if deleted."""
        session = await self.session.execute(
            select(UploadSession).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        obj = session.scalar_one_or_none()
        if obj is None:
            return False
        await self.session.delete(obj)
        await self.session.commit()
        return True

    async def delete_session_admin(self, session_id: str) -> bool:
        """Admin: delete any session regardless of owner."""
        result = await self.session.execute(
            select(UploadSession).where(UploadSession.id == session_id)
        )
        obj = result.scalar_one_or_none()
        if obj is None:
            return False
        await self.session.delete(obj)
        await self.session.commit()
        return True

    async def delete_transaction(self, record_id: str, session_id: str, user_id: str) -> bool:
        """Delete a single payment record. Returns True if deleted."""
        # Verify session ownership
        session_check = await self.session.execute(
            select(UploadSession.id).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        if not session_check.scalar_one_or_none():
            return False
        result = await self.session.execute(
            select(PaymentRecord).where(
                PaymentRecord.id == record_id,
                PaymentRecord.session_id == session_id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            return False
        await self.session.delete(record)
        # Update session totals
        await self._update_session_totals(session_id)
        await self.session.commit()
        return True

    async def create_transaction(
        self, session_id: str, user_id: str,
        bank: str, account: str, payment_amount: float,
        touchpoint: str | None = None, payment_date: str | None = None,
        environment: str | None = None,
    ) -> PaymentRecord | None:
        """Add a single payment record to an existing session. Returns the new record or None."""
        session_check = await self.session.execute(
            select(UploadSession.id).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        if not session_check.scalar_one_or_none():
            return None
        record = PaymentRecord(
            session_id=session_id,
            bank=bank,
            account=account,
            payment_amount=payment_amount,
            touchpoint=touchpoint,
            payment_date=payment_date,
            environment=environment,
        )
        self.session.add(record)
        await self._update_session_totals(session_id)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def update_transaction(
        self, record_id: str, session_id: str, user_id: str,
        bank: str, account: str, payment_amount: float,
        touchpoint: str | None = None, payment_date: str | None = None,
        environment: str | None = None,
    ) -> PaymentRecord | None:
        """Update fields on a single payment record. Returns updated record or None."""
        session_check = await self.session.execute(
            select(UploadSession.id).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        if not session_check.scalar_one_or_none():
            return None
        result = await self.session.execute(
            select(PaymentRecord).where(
                PaymentRecord.id == record_id,
                PaymentRecord.session_id == session_id,
            )
        )
        record = result.scalar_one_or_none()
        if not record:
            return None
        record.bank = bank
        record.account = account
        record.payment_amount = payment_amount
        record.touchpoint = touchpoint
        record.payment_date = payment_date
        record.environment = environment
        await self._update_session_totals(session_id)
        await self.session.commit()
        return record

    async def delete_transactions_by_date_range(
        self, session_id: str, user_id: str, date_from: str, date_to: str
    ) -> int:
        """Delete payment records within a date range. Returns count of deleted records."""
        # Verify session ownership
        session_check = await self.session.execute(
            select(UploadSession.id).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        if not session_check.scalar_one_or_none():
            return 0
        # Count records to delete
        count_result = await self.session.execute(
            select(func.count(PaymentRecord.id)).where(
                PaymentRecord.session_id == session_id,
                PaymentRecord.payment_date >= date_from,
                PaymentRecord.payment_date <= date_to,
            )
        )
        count = count_result.scalar() or 0
        if count == 0:
            return 0
        # Delete
        await self.session.execute(
            sql_delete(PaymentRecord).where(
                PaymentRecord.session_id == session_id,
                PaymentRecord.payment_date >= date_from,
                PaymentRecord.payment_date <= date_to,
            )
        )
        # Update session totals
        await self._update_session_totals(session_id)
        await self.session.commit()
        return count

    async def _update_session_totals(self, session_id: str) -> None:
        """Recalculate and update session totals after record deletions."""
        agg = await self.session.execute(
            select(
                func.count(PaymentRecord.id),
                func.coalesce(func.sum(PaymentRecord.payment_amount), 0),
            ).where(PaymentRecord.session_id == session_id)
        )
        total_records, total_amount = agg.one()
        upload = await self.session.get(UploadSession, session_id)
        if upload:
            upload.total_records = total_records
            upload.total_amount = float(total_amount)

    async def get_transactions(
        self,
        session_id: str,
        user_id: str,
        bank: str | None = None,
        touchpoint: str | None = None,
        search: str | None = None,
        payment_date: str | None = None,
        environment: str | None = None,
        month: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[int, float, list[PaymentRecord]]:
        # Verify the session belongs to this user
        session_check = await self.session.execute(
            select(UploadSession.id).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        if not session_check.scalar_one_or_none():
            return 0, 0.0, []

        query = select(PaymentRecord).where(PaymentRecord.session_id == session_id)

        if bank:
            query = query.where(PaymentRecord.bank == bank)
        if touchpoint:
            query = query.where(PaymentRecord.touchpoint == touchpoint)
        if payment_date:
            query = query.where(PaymentRecord.payment_date == payment_date)
        if environment:
            query = query.where(PaymentRecord.environment == environment)
        if month:
            query = query.where(func.upper(PaymentRecord.month) == month.upper())
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    PaymentRecord.bank.ilike(pattern),
                    PaymentRecord.account.ilike(pattern),
                    PaymentRecord.touchpoint.ilike(pattern),
                    PaymentRecord.payment_date.ilike(pattern),
                    PaymentRecord.environment.ilike(pattern),
                    cast(PaymentRecord.payment_amount, String).ilike(pattern),
                )
            )

        # Total count and total amount for the filtered set
        sub = query.subquery()
        agg_result = await self.session.execute(
            select(func.count(), func.coalesce(func.sum(sub.c.payment_amount), 0)).select_from(sub)
        )
        total, total_amount = agg_result.one()

        # Paginated results
        offset = (page - 1) * page_size
        query = query.order_by(PaymentRecord.payment_date.desc()).offset(offset).limit(page_size)
        result = await self.session.execute(query)
        return total, float(total_amount), list(result.scalars().all())

    async def get_dashboard_summary(self, session_id: str, user_id: str) -> dict | None:
        # Verify session ownership
        session_check = await self.session.execute(
            select(UploadSession).where(
                UploadSession.id == session_id,
                UploadSession.user_id == user_id,
            )
        )
        upload = session_check.scalar_one_or_none()
        if not upload:
            return None

        # Total payments and amount
        totals = await self.session.execute(
            select(
                func.count(PaymentRecord.id),
                func.sum(PaymentRecord.payment_amount),
                func.count(func.distinct(PaymentRecord.account)),
                func.count(func.distinct(PaymentRecord.bank)),
            ).where(PaymentRecord.session_id == session_id)
        )
        total_payments, total_amount, total_accounts, total_banks = totals.one()
        total_amount = round(total_amount or 0.0, 2)

        # Bank breakdown
        bank_rows = await self.session.execute(
            select(
                PaymentRecord.bank,
                func.count(PaymentRecord.id).label("payment_count"),
                func.count(func.distinct(PaymentRecord.account)).label("account_count"),
                func.sum(PaymentRecord.payment_amount).label("total_amount"),
            )
            .where(PaymentRecord.session_id == session_id)
            .group_by(PaymentRecord.bank)
            .order_by(func.sum(PaymentRecord.payment_amount).desc())
        )
        banks = [
            {
                "bank": row.bank,
                "payment_count": row.payment_count,
                "account_count": row.account_count,
                "total_amount": round(row.total_amount or 0.0, 2),
                "percentage": round((row.total_amount or 0.0) / total_amount * 100, 2) if total_amount else 0,
            }
            for row in bank_rows.all()
        ]

        # Touchpoint breakdown
        tp_rows = await self.session.execute(
            select(
                PaymentRecord.touchpoint,
                func.count(PaymentRecord.id).label("count"),
                func.sum(PaymentRecord.payment_amount).label("total_amount"),
            )
            .where(PaymentRecord.session_id == session_id)
            .group_by(PaymentRecord.touchpoint)
            .order_by(func.count(PaymentRecord.id).desc())
        )
        touchpoints = [
            {
                "touchpoint": row.touchpoint or "Unknown",
                "count": row.count,
                "total_amount": row.total_amount or 0.0,
                "percentage": round(row.count / total_payments * 100, 2) if total_payments else 0,
            }
            for row in tp_rows.all()
        ]

        # Distinct dates
        date_rows = await self.session.execute(
            select(func.distinct(PaymentRecord.payment_date))
            .where(PaymentRecord.session_id == session_id)
            .where(PaymentRecord.payment_date.isnot(None))
            .order_by(PaymentRecord.payment_date)
        )
        dates = [row[0] for row in date_rows.all()]

        # Distinct environments
        env_rows = await self.session.execute(
            select(func.distinct(PaymentRecord.environment))
            .where(PaymentRecord.session_id == session_id)
            .where(PaymentRecord.environment.isnot(None))
            .order_by(PaymentRecord.environment)
        )
        environments = [row[0] for row in env_rows.all()]

        # Distinct months (in calendar order)
        _month_order = {
            "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4,
            "MAY": 5, "JUNE": 6, "JULY": 7, "AUGUST": 8,
            "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11, "DECEMBER": 12,
        }
        month_rows = await self.session.execute(
            select(func.distinct(func.upper(PaymentRecord.month)))
            .where(PaymentRecord.session_id == session_id)
            .where(PaymentRecord.month.isnot(None))
        )
        months_raw = [row[0] for row in month_rows.all() if row[0]]
        months = sorted(months_raw, key=lambda m: _month_order.get(m, 99))

        # Environment → bank → touchpoint mapping (for cascading filters)
        env_bank_tp_rows = await self.session.execute(
            select(
                PaymentRecord.environment,
                PaymentRecord.bank,
                PaymentRecord.touchpoint,
            )
            .where(PaymentRecord.session_id == session_id)
            .where(PaymentRecord.environment.isnot(None))
            .distinct()
            .order_by(PaymentRecord.environment, PaymentRecord.bank, PaymentRecord.touchpoint)
        )
        env_map_build: dict[str, dict[str, set[str]]] = {}
        for env, bank, touchpoint in env_bank_tp_rows.all():
            if env not in env_map_build:
                env_map_build[env] = {}
            if bank not in env_map_build[env]:
                env_map_build[env][bank] = set()
            if touchpoint:
                env_map_build[env][bank].add(touchpoint)

        environment_map = [
            {
                "environment": env,
                "banks": sorted(banks_dict.keys()),
                "touchpoints_by_bank": {
                    bank: sorted(tps)
                    for bank, tps in banks_dict.items()
                },
            }
            for env, banks_dict in sorted(env_map_build.items())
        ]

        return {
            "total_payments": total_payments or 0,
            "total_amount": total_amount,
            "total_accounts": total_accounts or 0,
            "total_banks": total_banks or 0,
            "banks": banks,
            "touchpoints": touchpoints,
            "dates": dates,
            "environments": environments,
            "months": months,
            "environment_map": environment_map,
            "session_id": session_id,
        }
