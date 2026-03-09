const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
