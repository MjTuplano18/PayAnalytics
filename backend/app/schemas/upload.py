from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class PaymentRecordIn(BaseModel):
    bank: str
    account: str
    touchpoint: str | None = None
    payment_date: str | None = None
    payment_amount: float
    environment: str | None = None
    month: str | None = None


class PaymentRecordOut(PaymentRecordIn):
    id: str
    session_id: str

    model_config = {"from_attributes": True}


class UploadSessionCreate(BaseModel):
    file_name: str
    records: list[PaymentRecordIn]


class UploadSessionOut(BaseModel):
    id: str
    user_id: str
    file_name: str
    total_records: int
    total_amount: float
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class UploadSessionDetail(UploadSessionOut):
    records: list[PaymentRecordOut] = []


class PaginatedTransactions(BaseModel):
    total: int
    total_amount: float
    page: int
    page_size: int
    items: list[PaymentRecordOut]


class BankSummary(BaseModel):
    bank: str
    payment_count: int
    account_count: int
    total_amount: float
    percentage: float


class TouchpointSummary(BaseModel):
    touchpoint: str
    count: int
    total_amount: float
    percentage: float


class EnvironmentCampaignMap(BaseModel):
    """Maps each environment to its banks, and each bank to its touchpoints."""
    environment: str
    banks: list[str]
    touchpoints_by_bank: dict[str, list[str]]


class MonthlyTrendPoint(BaseModel):
    month: str
    amount: float


class DashboardSummary(BaseModel):
    total_payments: int
    total_amount: float
    total_accounts: int
    total_banks: int
    banks: list[BankSummary]
    touchpoints: list[TouchpointSummary]
    dates: list[str] = []
    environments: list[str] = []
    months: list[str] = []
    environment_map: list[EnvironmentCampaignMap] = []
    monthly_trend: list[MonthlyTrendPoint] = []
    session_id: str | None = None


class AuditLogEntry(BaseModel):
    id: str
    file_name: str
    total_records: int
    total_amount: float
    uploaded_at: datetime
    user_id: str
    user_email: str
    user_name: str

    model_config = {"from_attributes": True}


class UnifiedAuditLogEntry(BaseModel):
    id: str
    user_id: str
    user_email: str
    user_name: str
    action: str
    file_name: str
    session_id: str | None = None
    record_count: int
    total_amount: float
    details: str | None = None
    is_undone: bool = False
    can_undo: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class BulkDeleteRequest(BaseModel):
    ids: list[str] = Field(..., max_length=5_000, description="IDs of records to delete (max 5,000 per request)")


# Allowed action values that can be submitted via the external audit endpoint.
_ALLOWED_AUDIT_ACTIONS = frozenset(
    {
        "file_upload",
        "file_delete",
        "record_create",
        "record_update",
        "record_delete",
        "record_bulk_delete",
    }
)


class AuditLogCreate(BaseModel):
    action: str
    file_name: str
    session_id: str | None = None
    record_count: int = 0
    total_amount: float = 0.0
    details: str | None = None
    snapshot_data: str | None = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        if v not in _ALLOWED_AUDIT_ACTIONS:
            raise ValueError(
                f"Invalid action '{v}'. Must be one of: {', '.join(sorted(_ALLOWED_AUDIT_ACTIONS))}"
            )
        return v
