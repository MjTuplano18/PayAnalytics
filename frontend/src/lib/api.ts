const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `Request failed (${res.status})`);
  }

  // Handle 204 No Content (empty body)
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export function login(email: string, password: string) {
  return apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshTokens(refreshToken: string) {
  return apiFetch<TokenResponse>("/api/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function getMe(token: string) {
  return apiFetch<UserResponse>("/api/v1/auth/me", { token });
}

export function listUsers(token: string) {
  return apiFetch<UserResponse[]>("/api/v1/users", { token });
}

export function createUser(
  token: string,
  data: { email: string; full_name: string; password: string }
) {
  return apiFetch<UserResponse>("/api/v1/users", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function changePassword(
  token: string,
  data: { current_password: string; new_password: string }
) {
  return apiFetch<void>("/api/v1/users/me/change-password", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

// ─── Upload / Persistence API ────────────────────────────────────────────────

export interface PaymentRecordIn {
  bank: string;
  account: string;
  touchpoint?: string;
  payment_date?: string;
  payment_amount: number;
  environment?: string;
}

export interface PaymentRecordOut extends PaymentRecordIn {
  id: string;
  session_id: string;
}

export interface UploadSessionOut {
  id: string;
  user_id: string;
  file_name: string;
  total_records: number;
  total_amount: number;
  uploaded_at: string;
}

export interface UploadSessionDetail extends UploadSessionOut {
  records: PaymentRecordOut[];
}

export interface PaginatedTransactions {
  total: number;
  total_amount: number;
  page: number;
  page_size: number;
  items: PaymentRecordOut[];
}

export interface BankSummary {
  bank: string;
  payment_count: number;
  account_count: number;
  total_amount: number;
  percentage: number;
}

export interface TouchpointSummary {
  touchpoint: string;
  count: number;
  total_amount: number;
  percentage: number;
}

export interface DashboardSummary {
  total_payments: number;
  total_amount: number;
  total_accounts: number;
  total_banks: number;
  banks: BankSummary[];
  touchpoints: TouchpointSummary[];
  dates: string[];
  environments: string[];
  session_id: string | null;
}

export function saveUpload(
  token: string,
  payload: { file_name: string; records: PaymentRecordIn[] }
) {
  return apiFetch<UploadSessionOut>("/api/v1/uploads", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function listUploads(token: string) {
  return apiFetch<UploadSessionOut[]>("/api/v1/uploads", { token });
}

export function getUpload(token: string, sessionId: string) {
  return apiFetch<UploadSessionDetail>(`/api/v1/uploads/${sessionId}`, { token });
}

export function getTransactions(
  token: string,
  sessionId: string,
  params: { bank?: string; touchpoint?: string; search?: string; payment_date?: string; environment?: string; page?: number; page_size?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.bank) qs.set("bank", params.bank);
  if (params.touchpoint) qs.set("touchpoint", params.touchpoint);
  if (params.search) qs.set("search", params.search);
  if (params.payment_date) qs.set("payment_date", params.payment_date);
  if (params.environment) qs.set("environment", params.environment);
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch<PaginatedTransactions>(`/api/v1/uploads/${sessionId}/transactions${query}`, { token });
}

export function getDashboardSummary(token: string, sessionId: string) {
  return apiFetch<DashboardSummary>(`/api/v1/uploads/${sessionId}/dashboard`, { token });
}

export interface AuditLogEntry {
  id: string;
  file_name: string;
  total_records: number;
  total_amount: number;
  uploaded_at: string;
  user_id: string;
  user_email: string;
  user_name: string;
}

export function getAuditLog(token: string) {
  return apiFetch<AuditLogEntry[]>("/api/v1/uploads/admin/audit-log", { token });
}

export interface DeletionAuditLogEntry {
  id: string;
  session_id: string;
  file_name: string;
  total_records: number;
  total_amount: number;
  owner_user_id: string;
  deleted_by_user_id: string;
  deleted_by_email: string;
  deleted_by_name: string;
  deleted_at: string;
}

export function getDeletionAuditLog(token: string) {
  return apiFetch<DeletionAuditLogEntry[]>("/api/v1/uploads/admin/deletion-log", { token });
}

export interface UnifiedAuditLogEntry {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: string;
  file_name: string;
  session_id: string | null;
  record_count: number;
  total_amount: number;
  details: string | null;
  is_undone: boolean;
  can_undo: boolean;
  created_at: string;
}

export function getUnifiedAuditLog(token: string) {
  return apiFetch<UnifiedAuditLogEntry[]>("/api/v1/uploads/unified-audit-log", { token });
}

export function undoAuditEntry(token: string, entryId: string) {
  return apiFetch<{ detail: string }>(`/api/v1/uploads/audit-log/${entryId}/undo`, {
    method: "POST",
    token,
  });
}

export function deleteUpload(token: string, sessionId: string) {
  return apiFetch<void>(`/api/v1/uploads/${sessionId}`, { method: "DELETE", token });
}

export function deleteTransaction(token: string, sessionId: string, recordId: string) {
  return apiFetch<void>(`/api/v1/uploads/${sessionId}/transactions/${recordId}`, { method: "DELETE", token });
}

export function deleteTransactionsByDateRange(token: string, sessionId: string, dateFrom: string, dateTo: string) {
  const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return apiFetch<{ deleted: number }>(`/api/v1/uploads/${sessionId}/transactions?${qs}`, { method: "DELETE", token });
}
