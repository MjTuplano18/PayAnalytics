"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import { useData } from "@/context/DataContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { useChat } from "@/context/ChatContext";
import { Sidebar } from "@/components/Sidebar";
import { MainContent } from "@/components/MainContent";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { getUpload, listUploads, type UploadSessionDetail } from "@/lib/api";
import { ParsedData } from "@/types/data";
import { useUploadEvents } from "@/lib/useUploadEvents";

/** Silently restores session data from backend on page refresh */
function SessionRestorer() {
  const { token } = useAuth();
  const { sessionId, setSessionId, data, setData, setFileName } = useData();
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPickedRef = useRef(false);

  // Helper: build ParsedData from upload detail records
  const hydrateFromDetail = (detail: UploadSessionDetail) => {
    const payments = detail.records.map((r) => ({
      id: r.id,
      bank: r.bank,
      paymentDate: r.payment_date ?? "",
      paymentAmount: r.payment_amount,
      account: r.account,
      touchpoint: r.touchpoint ?? "",
      environment: r.environment,
      month: r.month,
    }));

    // Use integer-cents accumulation to avoid floating-point drift
    const bankMap = new Map<string, { totalAmountCents: number; paymentCount: number; accounts: Set<string> }>();
    const tpMap = new Map<string, { count: number; totalAmountCents: number }>();
    const allAccounts = new Set<string>();

    for (const p of payments) {
      allAccounts.add(p.account);
      if (!bankMap.has(p.bank)) bankMap.set(p.bank, { totalAmountCents: 0, paymentCount: 0, accounts: new Set() });
      const b = bankMap.get(p.bank)!;
      b.totalAmountCents += Math.round(p.paymentAmount * 100); b.paymentCount++; b.accounts.add(p.account);
      if (!tpMap.has(p.touchpoint)) tpMap.set(p.touchpoint, { count: 0, totalAmountCents: 0 });
      const t = tpMap.get(p.touchpoint)!;
      t.count++; t.totalAmountCents += Math.round(p.paymentAmount * 100);
    }

    // Use backend-computed total (SQL SUM on NUMERIC — exact) when available
    const totalAmount = detail.total_amount ?? 0;

    const bankAnalytics = Array.from(bankMap.entries())
      .map(([bank, d]) => {
        const bankAmount = d.totalAmountCents / 100;
        return { bank, accountCount: d.accounts.size, totalAmount: bankAmount, debtorSum: 0, percentage: totalAmount > 0 ? (bankAmount / totalAmount) * 100 : 0, paymentCount: d.paymentCount };
      })
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const touchpointAnalytics = Array.from(tpMap.entries())
      .map(([tp, d]) => {
        const tpAmount = d.totalAmountCents / 100;
        return { touchpoint: tp, count: d.count, totalAmount: tpAmount, percentage: totalAmount > 0 ? (tpAmount / totalAmount) * 100 : 0 };
      })
      .sort((a, b) => b.count - a.count);

    return { payments, bankAnalytics, touchpointAnalytics, totalAccounts: allAccounts.size, totalAmount, totalPayments: payments.length, raw: [] } as ParsedData;
  };

  // Restore existing sessionId
  useEffect(() => {
    if (!sessionId || !token || data) return;

    let cancelled = false;

    const restore = (attempt: number) => {
      getUpload(token, sessionId).then((detail) => {
        if (cancelled) return;
        setData(hydrateFromDetail(detail));
        setFileName(detail.file_name);
      }).catch((err: unknown) => {
        if (cancelled) return;
        const is404 = err instanceof Error && err.message.includes("404");
        if (is404) {
          setSessionId(null);
          return;
        }
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

  // Auto-pick the most recent upload if no sessionId is set
  useEffect(() => {
    if (sessionId || !token || data || autoPickedRef.current) return;
    autoPickedRef.current = true;

    listUploads(token).then((sessions) => {
      if (sessions.length === 0) return;
      // Sort by uploaded_at descending, pick the most recent
      const sorted = [...sessions].sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
      const latest = sorted[0];
      return getUpload(token, latest.id).then((detail) => {
        setData(hydrateFromDetail(detail));
        setFileName(detail.file_name);
        setSessionId(detail.id);
      });
    }).catch(() => {
      // Silently fail — user can upload manually
    });
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
        
        {/* Floating Chat Toggle Button */}
        <ChatToggleButton />
        
        {/* Chat Interface */}
        <ChatInterfaceWrapper />
        
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </DataProvider>
  );
}

/** Floating chat toggle button (bottom-right corner) */
function ChatToggleButton() {
  const { isChatOpen, toggleChat } = useChat();
  const pathname = usePathname();
  
  // Hide on login page
  if (pathname === "/login") return null;
  
  // Hide when chat is open (button is redundant)
  if (isChatOpen) return null;
  
  return (
    <button
      onClick={toggleChat}
      className="fixed bottom-6 right-6 z-[9999] w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 flex items-center justify-center ring-2 ring-white/20"
      style={{
        background: "linear-gradient(135deg, #5B66E2 0%, #7278e8 100%)",
      }}
      title="Open AI Assistant"
    >
      <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
    </button>
  );
}

/** Wrapper for ChatInterface with auth check */
function ChatInterfaceWrapper() {
  const { isChatOpen, toggleChat } = useChat();
  const { user } = useAuth();
  const pathname = usePathname();
  
  // Don't render on login page or when not authenticated
  if (pathname === "/login" || !user) return null;
  
  return <ChatInterface isOpen={isChatOpen} onToggle={toggleChat} />;
}
