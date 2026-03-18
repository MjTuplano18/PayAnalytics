from datetime import datetime

from pydantic import BaseModel


class PaymentRecordIn(BaseModel):
    bank: str
    account: str
    touchpoint: str | None = None
    payment_date: str | None = None
    payment_amount: float
    environment: str | None = None


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


class DashboardSummary(BaseModel):
    total_payments: int
    total_amount: float
    total_accounts: int
    total_banks: int
    banks: list[BankSummary]
    touchpoints: list[TouchpointSummary]
    dates: list[str] = []
    environments: list[str] = []
    environment_map: list[EnvironmentCampaignMap] = []
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
