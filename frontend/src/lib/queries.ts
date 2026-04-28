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
  getUnifiedAuditLog,
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
  unifiedAuditLog: (token: string) => ["unified-audit-log", token] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Fetch aggregated dashboard KPIs for a session — cached 10 minutes */
export function useDashboard(token: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(token!, sessionId!),
    queryFn: () => getDashboardSummary(token!, sessionId!),
    enabled: !!token && !!sessionId,
    staleTime: 10 * 60 * 1000,   // 10 min — don't refetch on tab switch
    gcTime: 30 * 60 * 1000,      // 30 min — keep in memory
    refetchOnWindowFocus: false,  // don't refetch when user switches browser tabs
    refetchOnMount: false,        // don't refetch if data already in cache
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
    payment_date?: string;
    environment?: string;
    page?: number;
    page_size?: number;
  } = {}
) {
  return useQuery({
    queryKey: queryKeys.transactions(token!, sessionId!, filters),
    queryFn: () => getTransactions(token!, sessionId!, filters),
    enabled: !!token && !!sessionId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });
}

/** List all upload sessions for the current user */
export function useUploads(
  token: string | null,
  options: { refetchInterval?: number } = {}
) {
  return useQuery({
    queryKey: queryKeys.uploads(token!),
    queryFn: () => listUploads(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    select: (data) =>
      [...data].sort(
        (a, b) =>
          new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      ),
    ...options,
  });
}

/** Admin: fetch audit log — cached 5 minutes */
export function useAuditLog(token: string | null, isAdmin: boolean) {
  return useQuery({
    queryKey: queryKeys.auditLog(token!),
    queryFn: () => getAuditLog(token!),
    enabled: !!token && isAdmin,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Fetch unified audit log for the current user — cached with TanStack Query */
export function useUnifiedAuditLog(token: string | null) {
  return useQuery({
    queryKey: queryKeys.unifiedAuditLog(token!),
    queryFn: () => getUnifiedAuditLog(token!),
    enabled: !!token,
    staleTime: 2 * 60 * 1000,   // 2 min — avoid re-fetching on every settings tab open
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
