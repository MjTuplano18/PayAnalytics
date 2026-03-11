/**
 * Centralized TanStack Query hooks for PayAnalytics API calls.
 *
 * Using TanStack Query avoids redundant Neon DB round-trips:
 *  - staleTime: 5 min  → data from a recent navigation reuse is served from cache
 *  - gcTime:   10 min  → unused cache entries are kept for fast back-navigation
 *  - placeholderData   → pagination keeps showing previous page while new one loads
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getDashboardSummary,
  getTransactions,
  listUploads,
  getAuditLog,
} from "@/lib/api";

// ── Query key factory ────────────────────────────────────────────────────────
export const queryKeys = {
  uploads: (token: string) => ["uploads", token] as const,
  dashboard: (token: string, sessionId: string) =>
    ["dashboard", sessionId, token] as const,
  transactions: (
    token: string,
    sessionId: string,
    filters: {
      bank?: string;
      touchpoint?: string;
      search?: string;
      page?: number;
      page_size?: number;
    }
  ) => ["transactions", sessionId, filters, token] as const,
  auditLog: (token: string) => ["audit-log", token] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Fetch aggregated dashboard KPIs for a session — cached 5 minutes */
export function useDashboard(token: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(token!, sessionId!),
    queryFn: () => getDashboardSummary(token!, sessionId!),
    enabled: !!token && !!sessionId,
  });
}

/** Fetch paginated + filtered transactions — keeps previous page while loading */
export function useTransactions(
  token: string | null,
  sessionId: string | null,
  filters: {
    bank?: string;
    touchpoint?: string;
    search?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  return useQuery({
    queryKey: queryKeys.transactions(token!, sessionId!, filters),
    queryFn: () => getTransactions(token!, sessionId!, filters),
    enabled: !!token && !!sessionId,
    placeholderData: keepPreviousData, // smooth page transitions
  });
}

/** List all upload sessions for the current user — cached 5 minutes */
export function useUploads(token: string | null) {
  return useQuery({
    queryKey: queryKeys.uploads(token!),
    queryFn: () => listUploads(token!),
    enabled: !!token,
  });
}

/** Admin: fetch audit log — cached 5 minutes */
export function useAuditLog(token: string | null, isAdmin: boolean) {
  return useQuery({
    queryKey: queryKeys.auditLog(token!),
    queryFn: () => getAuditLog(token!),
    enabled: !!token && isAdmin,
  });
}
