"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
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
import { useUploadEvents } from "@/lib/useUploadEvents";

/** Silently restores session data from backend on page refresh */
function SessionRestorer() {
  const { token } = useAuth();
  const { sessionId, setSessionId, data, setData, setFileName } = useData();
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId || !token || data) return; // nothing to do

    let cancelled = false;

    const restore = (attempt: number) => {
      getUpload(token, sessionId).then((detail) => {
        if (cancelled) return;
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
      }).catch((err: unknown) => {
        if (cancelled) return;
        // Only clear sessionId on 404 (session actually deleted on server)
        const is404 = err instanceof Error && err.message.includes("404");
        if (is404) {
          setSessionId(null);
          return;
        }
        // Retry up to 3 times with increasing delay for transient errors (401 during token refresh, network issues)
        if (attempt < 3) {
          retryRef.current = setTimeout(() => restore(attempt + 1), 1500 * (attempt + 1));
        }
      });
    };

    restore(0);

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [sessionId, token, data]);  // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Use dark as default to match the defaultTheme="dark" in ThemeProvider,
  // preventing a hydration mismatch since resolvedTheme is undefined on the server.
  const bgImage = !mounted || resolvedTheme === "dark" ? "/BKGRD.svg" : "/BKGRD%20INV.svg";

  const isLoginPage = pathname === "/login";

  // Show a full-page skeleton while checking auth
  if (isLoading && !isLoginPage) {
    return (
      <div className="relative flex min-h-screen bg-[#070D12]">
        {/* Blurred background */}
        <div className="fixed inset-0 z-0 overflow-hidden">
          <Image
            src={bgImage}
            alt=""
            fill
            className="object-cover opacity-60"
            style={{ filter: "blur(8px)", transform: "scale(1.05)" }}
            priority
          />
        </div>
        {/* Sidebar skeleton */}
        <div className="relative z-10 hidden md:flex h-screen w-64 flex-col border-r bg-[rgba(7,13,18,0.85)] border-white/10 p-6 gap-6 backdrop-blur-xl">
          <Skeleton className="h-8 w-36 bg-white/10" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-white/10" />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="relative z-10 flex-1">
          {/* Top bar skeleton */}
          <div className="h-16 border-b border-white/10 bg-[rgba(7,13,18,0.75)] backdrop-blur-xl flex items-center px-8">
            <Skeleton className="h-5 w-32 bg-white/10" />
            <div className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-full bg-white/10" />
          </div>
          {/* Page skeleton */}
          <div className="p-8 space-y-6">
            <Skeleton className="h-8 w-48 bg-white/10" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg bg-white/10" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-lg bg-white/10" />
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
      <div className="flex min-h-screen items-center justify-center bg-[#070D12]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5B66E2] border-t-transparent" />
      </div>
    );
  }

/** Subscribes to backend SSE to auto-invalidate the upload list cache. */
function UploadEventListener() {
  const { token } = useAuth();
  useUploadEvents(token);
  return null;
}

// Authenticated layout
  return (
    <DataProvider>
      <SessionRestorer />
      <UploadEventListener />
      <SidebarProvider>
        {/* Fixed blurred background – always behind everything */}
        <div className="fixed inset-0 z-0 overflow-hidden bg-[#070D12] dark:bg-[#070D12]" style={{ backgroundColor: resolvedTheme === "dark" ? "#070D12" : "#f4f7f9" }}>
          <Image
            src={bgImage}
            alt=""
            fill
            className="object-cover opacity-60"
            style={{ filter: "blur(8px)", transform: "scale(1.05)" }}
            priority
          />
        </div>
        <div className="relative z-10 min-h-screen">
          <Sidebar />
          <MainContent>{children}</MainContent>
        </div>
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </DataProvider>
  );
}
