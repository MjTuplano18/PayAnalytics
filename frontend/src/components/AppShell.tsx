"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import { useData } from "@/context/DataContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { Sidebar } from "@/components/Sidebar";
import { MainContent } from "@/components/MainContent";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { getUpload } from "@/lib/api";
import { ParsedData } from "@/types/data";

/** Silently restores session data from backend on page refresh */
function SessionRestorer() {
  const { token } = useAuth();
  const { sessionId, setSessionId, data, setData, setFileName } = useData();

  useEffect(() => {
    if (!sessionId || !token || data) return; // nothing to do

    getUpload(token, sessionId).then((detail) => {
      const payments = detail.records.map((r) => ({
        bank: r.bank,
        paymentDate: r.payment_date ?? "",
        paymentAmount: r.payment_amount,
        account: r.account,
        touchpoint: r.touchpoint ?? "",
        environment: r.environment,
      }));

      const bankMap = new Map<string, { totalAmount: number; paymentCount: number; accounts: Set<string> }>();
      const tpMap = new Map<string, { count: number; totalAmount: number }>();
      let totalAmount = 0;
      const allAccounts = new Set<string>();

      for (const p of payments) {
        totalAmount += p.paymentAmount;
        allAccounts.add(p.account);
        if (!bankMap.has(p.bank)) bankMap.set(p.bank, { totalAmount: 0, paymentCount: 0, accounts: new Set() });
        const b = bankMap.get(p.bank)!;
        b.totalAmount += p.paymentAmount; b.paymentCount++; b.accounts.add(p.account);
        if (!tpMap.has(p.touchpoint)) tpMap.set(p.touchpoint, { count: 0, totalAmount: 0 });
        const t = tpMap.get(p.touchpoint)!;
        t.count++; t.totalAmount += p.paymentAmount;
      }

      const bankAnalytics = Array.from(bankMap.entries())
        .map(([bank, d]) => ({ bank, accountCount: d.accounts.size, totalAmount: d.totalAmount, debtorSum: 0, percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0, paymentCount: d.paymentCount }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      const touchpointAnalytics = Array.from(tpMap.entries())
        .map(([tp, d]) => ({ touchpoint: tp, count: d.count, totalAmount: d.totalAmount, percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);

      const parsed: ParsedData = { payments, bankAnalytics, touchpointAnalytics, totalAccounts: allAccounts.size, totalAmount, totalPayments: payments.length, raw: [] };
      setData(parsed);
      setFileName(detail.file_name);
    }).catch(() => {
      // Session no longer valid — clear the stale id
      setSessionId(null);
    });
  }, [sessionId, token, data]);  // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  const isLoginPage = pathname === "/login";

  // Show a full-page skeleton while checking auth
  if (isLoading && !isLoginPage) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar skeleton */}
        <div className="hidden lg:flex h-screen w-64 flex-col border-r bg-gray-900 border-gray-800 p-6 gap-6">
          <Skeleton className="h-8 w-36 bg-gray-800" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-gray-800" />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1">
          {/* Top bar skeleton */}
          <div className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-8">
            <Skeleton className="h-5 w-32" />
            <div className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          {/* Page skeleton */}
          <div className="p-8 space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Login page — no sidebar, no topbar
  if (isLoginPage) {
    return (
      <>
        {children}
        <Toaster position="bottom-right" />
      </>
    );
  }

  // Not authenticated and not on login — show skeleton while redirect happens
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
      </div>
    );
  }

  // Authenticated layout
  return (
    <DataProvider>
      <SessionRestorer />
      <SidebarProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Sidebar />
          <MainContent>{children}</MainContent>
        </div>
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </DataProvider>
  );
}
