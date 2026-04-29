"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { DollarSign, Users, FileText, Landmark, Waypoints, Hash, BarChart3, ChevronDown, Check, Globe, Info, TrendingUp, Building2, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { DynamicChart } from "@/components/DynamicChart";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { type DashboardSummary } from "@/lib/api";
import { useDashboard } from "@/lib/queries";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}
function fmtAmt(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Classify touchpoint into channel type
function channelType(tp: string): string {
  const u = tp.toUpperCase().trim();
  if (u.startsWith("IB ") || u === "IB CALL" || u === "IB EMAIL" || u === "IB SMS" || u === "IB VIBER" || u === "IB FIELD" || u === "IB WALKIN" || u === "IB WHATSAPP" || u === "IB VISIT" || u === "IB DEBIT" || u === "IB REPO AI" || u === "IB SKIPTRACE") return "Inbound";
  if (u.startsWith("OB ") || u === "OB CALL" || u === "OB EMAIL" || u === "OB SMS" || u === "OB VIBER" || u === "OB FIELD" || u === "OB WALKIN" || u === "OB DEBIT" || u === "OB REPO AI" || u === "OB SKIPTRACE" || u === "OB PAIDLIST") return "Outbound";
  if (u === "GHOST PAYMENT") return "Ghost Payment";
  if (u === "NO TOUCHPOINT") return "No Touchpoint";
  // Bare touchpoints (no IB/OB prefix) — CALL, EMAIL, SMS, VIBER, FIELD, WALKIN,
  // DEBIT, DIGITAL, VISIT, WHATSAPP, SKIPTRACE, VIBER, REPO AI, FINNONE, WALKIN, etc.
  return "With Touchpoint";
}

export default function DashboardPage() {
  const { data, sessionId, setSessionId } = useData();
  const { token, user } = useAuth();
  const router = useRouter();
  const { setIsCollapsed } = useSidebar();
  const [activeTab, setActiveTab] = useState<"summary" | "portfolio" | "channels">("summary");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const { data: apiSummary, isLoading: apiLoading, error: apiError } = useDashboard(token, sessionId);
  // isFetching is true during background refreshes; isLoading is true only when
  // there is no cached data yet. Use showSkeleton to prevent skeleton flash on
  // re-navigation when data is already in the TanStack Query cache.
  const showSkeleton = apiLoading && !apiSummary;

  const handleUploadNav = () => {
    setIsCollapsed(true);
    router.push("/upload");
  };

  // Auto-clear stale session on 404 or 500 (e.g. after DB migration / new database)
  useEffect(() => {
    if (apiError && (apiError.message.includes("404") || apiError.message.includes("Not Found") || apiError.message.includes("500") || apiError.message.includes("Internal Server Error"))) {
      setSessionId(null);
    }
  }, [apiError, setSessionId]);

  // Portfolio tab filters
  const [selectedEnvironments, setSelectedEnvironments] = useState<Set<string>>(new Set());
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const envDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedBanks, setSelectedBanks] = useState<Set<string>>(new Set());
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const [portfolioBankTopN, setPortfolioBankTopN] = useState<number | "all">(20);
  const [portfolioBankPage, setPortfolioBankPage] = useState(1);

  // Channels tab filters
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<Set<string>>(new Set());
  const [tpDropdownOpen, setTpDropdownOpen] = useState(false);
  const tpDropdownRef = useRef<HTMLDivElement>(null);

  const bankRowsPerPage = 15;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tpDropdownRef.current && !tpDropdownRef.current.contains(e.target as Node)) setTpDropdownOpen(false);
      if (envDropdownRef.current && !envDropdownRef.current.contains(e.target as Node)) setEnvDropdownOpen(false);
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) setBankDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Base filtered payments (date filter applies to all tabs)
  const payments = useMemo(() => {
    if (!data) return [];
    return filterByDateRange(data.payments, dateRange, (p) => p.paymentDate, customRange);
  }, [data, dateRange, customRange]);

  const dataStartDate = useMemo(() => {
    if (!data || data.payments.length === 0) return undefined;
    const dates = data.payments.map((p) => p.paymentDate).filter(Boolean).sort();
    if (!dates.length) return undefined;
    const [y, m, d] = dates[0].split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [data]);

  const isFiltered = dateRange !== "all";

  // ── Core analytics (used by Summary + Portfolio) ──
  const rawFa = useMemo(() => {
    // Prefer in-memory data (live, reflects sheets edits/deletes immediately)
    if (payments.length > 0) {
      const bankMap = new Map<string, { amounts: number[]; paymentCount: number; accounts: Set<string> }>();
      const tpMap = new Map<string, { count: number; amounts: number[] }>();
      const allAccounts = new Set<string>();
      const sc = (nums: number[]) => nums.reduce((s, n) => s + Math.round(n * 100), 0) / 100;
      for (const p of payments) {
        allAccounts.add(p.account);
        if (!bankMap.has(p.bank)) bankMap.set(p.bank, { amounts: [], paymentCount: 0, accounts: new Set() });
        const b = bankMap.get(p.bank)!; b.amounts.push(p.paymentAmount); b.paymentCount++; b.accounts.add(p.account);
        if (!tpMap.has(p.touchpoint)) tpMap.set(p.touchpoint, { count: 0, amounts: [] });
        const t = tpMap.get(p.touchpoint)!; t.count++; t.amounts.push(p.paymentAmount);
      }
      const totalAmount = sc(payments.map((p) => p.paymentAmount));
      const bankAnalytics = Array.from(bankMap.entries())
        .map(([bank, d]) => { const bt = sc(d.amounts); return { bank, accountCount: d.accounts.size, totalAmount: bt, debtorSum: d.paymentCount, percentage: totalAmount > 0 ? (bt / totalAmount) * 100 : 0, paymentCount: d.paymentCount }; })
        .sort((a, b) => b.totalAmount - a.totalAmount);
      const touchpointAnalytics = Array.from(tpMap.entries())
        .map(([touchpoint, d]) => { const tt = sc(d.amounts); return { touchpoint, count: d.count, totalAmount: tt, percentage: totalAmount > 0 ? (tt / totalAmount) * 100 : 0 }; })
        .sort((a, b) => b.count - a.count);
      return { bankAnalytics, touchpointAnalytics, totalAmount, totalAccounts: allAccounts.size, totalPayments: payments.length };
    }
    // Fallback to API summary when no in-memory data (e.g. after page refresh)
    if (apiSummary && !isFiltered) {
      return {
        totalAmount: apiSummary.total_amount,
        totalAccounts: apiSummary.total_accounts,
        totalPayments: apiSummary.total_payments,
        bankAnalytics: apiSummary.banks.map((b) => ({
          bank: b.bank, accountCount: b.account_count, totalAmount: b.total_amount,
          debtorSum: b.payment_count, percentage: b.percentage, paymentCount: b.payment_count,
        })),
        touchpointAnalytics: apiSummary.touchpoints.map((t) => ({
          touchpoint: t.touchpoint, count: t.count, totalAmount: t.total_amount, percentage: t.percentage,
        })),
      };
    }
    return null;
  }, [apiSummary, payments, isFiltered]);

  const fa = rawFa ?? { totalAmount: 0, totalAccounts: 0, totalPayments: 0, bankAnalytics: [], touchpointAnalytics: [] };
  const noData = !rawFa && !showSkeleton;

  // ── Monthly trend ──
  const monthlyTrend = useMemo(() => {
    // When in-memory data is available use it (supports date filtering)
    if (payments.length > 0) {
      const map = new Map<string, number>();
      for (const p of payments) {
        const raw = p.paymentDate.slice(0, 7) || "";
        if (!raw || raw === "Unknown") continue;
        map.set(raw, (map.get(raw) || 0) + p.paymentAmount);
      }
      if (map.size === 0) return [];

      const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
      const peakMonth = Array.from(map.entries()).sort(([, a], [, b]) => b - a)[0][0];
      const [py, pm] = peakMonth.split("-").map(Number);
      const peakNum = py * 12 + pm;

      return sorted
        .filter(([raw]) => {
          const [y, m] = raw.split("-").map(Number);
          return Math.abs(y * 12 + m - peakNum) <= 6;
        })
        .map(([raw, amount]) => {
          const parts = raw.split("-");
          const label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
            .toLocaleDateString("en-US", { month: "short", year: "numeric" });
          return { month: label, rawMonth: raw, amount };
        });
    }
    // Fallback to API summary monthly trend (no in-memory data, e.g. after page refresh)
    if (apiSummary?.monthly_trend?.length) {
      return apiSummary.monthly_trend.map(({ month, amount }) => {
        const parts = month.split("-");
        const label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1)
          .toLocaleDateString("en-US", { month: "short", year: "numeric" });
        return { month: label, rawMonth: month, amount };
      });
    }
    return [];
  }, [payments, apiSummary]);

  // ── Portfolio tab data ──
  const allEnvironments = useMemo(() => {
    if (apiSummary) return apiSummary.environments;
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.environment).filter(Boolean) as string[])].sort();
  }, [apiSummary, data]);

  // Banks filtered by selected environments (cascading)
  const allBanks = useMemo(() => {
    // If environments are selected, only show banks that exist in those environments
    if (selectedEnvironments.size > 0) {
      if (apiSummary?.environment_map) {
        const bankSet = new Set<string>();
        for (const envEntry of apiSummary.environment_map) {
          if (selectedEnvironments.has(envEntry.environment)) {
            envEntry.banks.forEach((b) => bankSet.add(b));
          }
        }
        return Array.from(bankSet).sort();
      }
      // In-memory fallback
      if (data) {
        const bankSet = new Set<string>();
        data.payments
          .filter((p) => selectedEnvironments.has(p.environment || "Unknown"))
          .forEach((p) => bankSet.add(p.bank));
        return Array.from(bankSet).sort();
      }
      return [];
    }
    // No environment selected — show all banks
    if (apiSummary) return apiSummary.banks.map((b) => b.bank).sort();
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.bank))].sort();
  }, [apiSummary, data, selectedEnvironments]);

  const portfolioFiltered = useMemo(() => {
    let f = payments;
    if (selectedEnvironments.size > 0) f = f.filter((p) => selectedEnvironments.has(p.environment || "Unknown"));
    if (selectedBanks.size > 0) f = f.filter((p) => selectedBanks.has(p.bank));
    return f;
  }, [payments, selectedEnvironments, selectedBanks]);

  const portfolioAnalytics = useMemo(() => {
    const src = portfolioFiltered;
    // Fallback to apiSummary when no in-memory data and no filters active
    if (src.length === 0 && apiSummary && selectedEnvironments.size === 0 && selectedBanks.size === 0) {
      const bankAnalytics = apiSummary.banks.map((b) => ({
        bank: b.bank,
        accountCount: b.account_count,
        totalAmount: b.total_amount,
        debtorSum: b.payment_count,
        percentage: b.percentage,
        paymentCount: b.payment_count,
      }));
      return { bankAnalytics, totalAmount: apiSummary.total_amount, totalAccounts: apiSummary.total_accounts, totalPayments: apiSummary.total_payments };
    }
    if (src.length === 0) return { bankAnalytics: [] as typeof fa.bankAnalytics, totalAmount: 0, totalAccounts: 0, totalPayments: 0 };
    const bankMap = new Map<string, { amounts: number[]; paymentCount: number; accounts: Set<string> }>();
    const allAccounts = new Set<string>();
    for (const p of src) {
      allAccounts.add(p.account);
      if (!bankMap.has(p.bank)) bankMap.set(p.bank, { amounts: [], paymentCount: 0, accounts: new Set() });
      const b = bankMap.get(p.bank)!; b.amounts.push(p.paymentAmount); b.paymentCount++; b.accounts.add(p.account);
    }
    const totalAmount = src.reduce((s, p) => s + Math.round(p.paymentAmount * 100), 0) / 100;
    const bankAnalytics = Array.from(bankMap.entries())
      .map(([bank, d]) => { const bt = d.amounts.reduce((s, n) => s + Math.round(n * 100), 0) / 100; return { bank, accountCount: d.accounts.size, totalAmount: bt, debtorSum: d.paymentCount, percentage: totalAmount > 0 ? (bt / totalAmount) * 100 : 0, paymentCount: d.paymentCount }; })
      .sort((a, b) => b.totalAmount - a.totalAmount);
    return { bankAnalytics, totalAmount, totalAccounts: allAccounts.size, totalPayments: src.length };
  }, [portfolioFiltered, apiSummary, selectedEnvironments, selectedBanks, fa]);

  // ── Channels tab data ──
  const allTouchpoints = useMemo(() => {
    if (apiSummary) return apiSummary.touchpoints.map((t) => t.touchpoint);
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.touchpoint || "Unknown"))].sort();
  }, [apiSummary, data]);

  const channelAnalytics = useMemo(() => {
    const src = selectedTouchpoints.size > 0
      ? payments.filter((p) => selectedTouchpoints.has(p.touchpoint || "Unknown"))
      : payments;
    // Fallback to apiSummary when no in-memory data and no filters active
    if (src.length === 0 && apiSummary && selectedTouchpoints.size === 0) {
      return apiSummary.touchpoints.map((t) => ({
        touchpoint: t.touchpoint,
        count: t.count,
        totalAmount: t.total_amount,
        percentage: t.percentage,
      }));
    }
    if (src.length === 0) return [];
    const tpMap = new Map<string, { count: number; amounts: number[] }>();
    for (const p of src) {
      const tp = p.touchpoint || "Unknown";
      if (!tpMap.has(tp)) tpMap.set(tp, { count: 0, amounts: [] });
      const t = tpMap.get(tp)!; t.count++; t.amounts.push(p.paymentAmount);
    }
    const totalAmount = src.reduce((s, p) => s + Math.round(p.paymentAmount * 100), 0) / 100;
    return Array.from(tpMap.entries())
      .map(([touchpoint, d]) => { const tt = d.amounts.reduce((s, n) => s + Math.round(n * 100), 0) / 100; return { touchpoint, count: d.count, totalAmount: tt, percentage: totalAmount > 0 ? (tt / totalAmount) * 100 : 0 }; })
      .sort((a, b) => b.count - a.count);
  }, [payments, selectedTouchpoints, apiSummary]);

  // Channel type grouping (IB / OB / Direct / Ghost / Automated / No Touchpoint)
  const channelGroupData = useMemo(() => {
    const src = selectedTouchpoints.size > 0
      ? payments.filter((p) => selectedTouchpoints.has(p.touchpoint || "Unknown"))
      : payments;
    // Fallback: derive groups from channelAnalytics (which already has apiSummary fallback)
    if (src.length === 0 && channelAnalytics.length > 0) {
      const groupMap = new Map<string, { count: number; amount: number }>();
      for (const t of channelAnalytics) {
        const g = channelType(t.touchpoint || "");
        if (!groupMap.has(g)) groupMap.set(g, { count: 0, amount: 0 });
        const e = groupMap.get(g)!; e.count += t.count; e.amount += t.totalAmount;
      }
      return Array.from(groupMap.entries())
        .map(([group, d]) => ({ group, count: d.count, amount: Math.round(d.amount * 100) / 100 }))
        .sort((a, b) => b.count - a.count);
    }
    const groupMap = new Map<string, { count: number; amount: number }>();
    for (const p of src) {
      const g = channelType(p.touchpoint || "");
      if (!groupMap.has(g)) groupMap.set(g, { count: 0, amount: 0 });
      const e = groupMap.get(g)!; e.count++; e.amount += p.paymentAmount;
    }
    return Array.from(groupMap.entries())
      .map(([group, d]) => ({ group, count: d.count, amount: Math.round(d.amount * 100) / 100 }))
      .sort((a, b) => b.count - a.count);
  }, [payments, selectedTouchpoints, channelAnalytics]);

  const tpTotal = channelAnalytics.reduce((s, t) => s + t.count, 0);
  const tpTotalAmount = channelAnalytics.reduce((s, t) => s + Math.round(t.totalAmount * 100), 0) / 100;

  // ── Shared pagination reset on tab change ──
  useEffect(() => { setPortfolioBankPage(1); }, [activeTab, selectedEnvironments, selectedBanks, dateRange]);

  const TABS = [
    { id: "summary" as const, label: "Overview", icon: TrendingUp },
    { id: "portfolio" as const, label: "Banks", icon: Building2 },
    { id: "channels" as const, label: "Environments", icon: Radio },
  ];

  const paginationBtnClass = "px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
  const dropdownBtnClass = "flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors";
  const dropdownPanelClass = "absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg";

  function MetricCard({ label, value, icon: Icon, iconBg, info }: { label: string; value: string; icon: React.ElementType; iconBg: string; info?: string }) {
    return (
      <Card className="p-5 bg-card border-border hover:shadow-lg hover:scale-[1.01] transition-all duration-300 cursor-default">
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white block">{label}</span>
            {info && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{info}</p>}
          </div>
          <div className={`p-2 ${iconBg} rounded-lg flex-shrink-0`}><Icon className="w-4 h-4 text-white" /></div>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white truncate">{value}</div>
      </Card>
    );
  }

  function SkeletonCard() {
    return (
      <Card className="p-5 bg-card border-border">
        <div className="flex items-center justify-between mb-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-8 rounded-lg" /></div>
        <Skeleton className="h-7 w-32 mt-1" />
      </Card>
    );
  }

  function Pagination({ page, setPage, total, rowsPerPage }: { page: number; setPage: (p: number) => void; total: number; rowsPerPage: number }) {
    const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
    if (totalPages <= 1) return null;
    const pages: number[] = [];
    let start = Math.max(1, page - 2); let end = Math.min(totalPages, start + 4); start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return (
      <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">Showing {fmt((page - 1) * rowsPerPage + 1)}–{fmt(Math.min(page * rowsPerPage, total))} of {fmt(total)}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className={paginationBtnClass}>First</button>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className={paginationBtnClass}>Prev</button>
          {pages.map((pg) => <button key={pg} onClick={() => setPage(pg)} className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${pg === page ? "bg-[#4a55d1] text-white border-[#4a55d1] shadow-sm" : paginationBtnClass}`}>{pg}</button>)}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className={paginationBtnClass}>Next</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={paginationBtnClass}>Last</button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Welcome{user ? `, ${user.full_name.split(" ")[0]}` : ""}!</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Environment filter — Portfolio + Channels tabs */}
          {(activeTab === "portfolio" || activeTab === "channels") && (
            <div ref={envDropdownRef} className="relative">
              <button onClick={() => setEnvDropdownOpen((v) => !v)} className={dropdownBtnClass}>
                <Globe className="h-4 w-4" />
                {selectedEnvironments.size === 0 ? "All Environments" : `${selectedEnvironments.size} selected`}
                <ChevronDown className={`h-4 w-4 transition-transform ${envDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {envDropdownOpen && (
                <div className={dropdownPanelClass}>
                  {selectedEnvironments.size > 0 && (
                    <button onClick={() => { setSelectedEnvironments(new Set()); setSelectedBanks(new Set()); setSelectedTouchpoints(new Set()); }} className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] hover:bg-muted/50 border-b border-gray-200 dark:border-gray-700">Clear selection</button>
                  )}
                  {allEnvironments.map((env) => (
                    <button key={env} onClick={() => {
                      setSelectedEnvironments((prev) => {
                        const n = new Set(prev);
                        n.has(env) ? n.delete(env) : n.add(env);
                        return n;
                      });
                      // Clear banks that may not exist in the new env selection
                      setSelectedBanks(new Set());
                    }} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 transition-colors">
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${selectedEnvironments.has(env) ? "bg-[#5B66E2] border-[#5B66E2]" : "border-gray-300 dark:border-gray-600"}`}>{selectedEnvironments.has(env) && <Check className="h-3 w-3 text-white" />}</span>
                      {env}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Bank filter — Portfolio tab only */}
          {activeTab === "portfolio" && (
            <div ref={bankDropdownRef} className="relative">
              <button onClick={() => setBankDropdownOpen((v) => !v)} className={dropdownBtnClass}>
                <Landmark className="h-4 w-4" />
                {selectedBanks.size === 0 ? "All Banks" : `${selectedBanks.size} bank${selectedBanks.size !== 1 ? "s" : ""}`}
                <ChevronDown className={`h-4 w-4 transition-transform ${bankDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {bankDropdownOpen && (
                <div className={dropdownPanelClass}>
                  {selectedBanks.size > 0 && (
                    <button onClick={() => setSelectedBanks(new Set())} className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] hover:bg-muted/50 border-b border-gray-200 dark:border-gray-700">Clear selection</button>
                  )}
                  {allBanks.map((bank) => (
                    <button key={bank} onClick={() => setSelectedBanks((prev) => { const n = new Set(prev); n.has(bank) ? n.delete(bank) : n.add(bank); return n; })} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 transition-colors">
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${selectedBanks.has(bank) ? "bg-[#5B66E2] border-[#5B66E2]" : "border-gray-300 dark:border-gray-600"}`}>{selectedBanks.has(bank) && <Check className="h-3 w-3 text-white" />}</span>
                      {bank}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Touchpoint filter — Channels tab only */}
          {activeTab === "channels" && (
            <div ref={tpDropdownRef} className="relative">
              <button onClick={() => setTpDropdownOpen((v) => !v)} className={dropdownBtnClass}>
                <Waypoints className="h-4 w-4" />
                {selectedTouchpoints.size === 0 ? "All Touchpoints" : `${selectedTouchpoints.size} selected`}
                <ChevronDown className={`h-4 w-4 transition-transform ${tpDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {tpDropdownOpen && (
                <div className={dropdownPanelClass}>
                  {selectedTouchpoints.size > 0 && (
                    <button onClick={() => setSelectedTouchpoints(new Set())} className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] hover:bg-muted/50 border-b border-gray-200 dark:border-gray-700">Clear selection</button>
                  )}
                  {allTouchpoints.map((tp) => (
                    <button key={tp} onClick={() => setSelectedTouchpoints((prev) => { const n = new Set(prev); n.has(tp) ? n.delete(tp) : n.add(tp); return n; })} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 transition-colors">
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${selectedTouchpoints.has(tp) ? "bg-[#5B66E2] border-[#5B66E2]" : "border-gray-300 dark:border-gray-600"}`}>{selectedTouchpoints.has(tp) && <Check className="h-3 w-3 text-white" />}</span>
                      {tp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <DateFilter value={dateRange} onChange={(r, c) => { setDateRange(r); setCustomRange(c); }} customRange={customRange} dataStartDate={dataStartDate} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors -mb-px ${activeTab === id ? "border-b-2 border-[#5B66E2] text-[#5B66E2] bg-[#5B66E2]/5" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB 1 — SUMMARY
      ════════════════════════════════════════════════════════ */}
      {activeTab === "summary" && (
        <>
          {noData && (
            <div className="mb-6 p-6 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-[#5B66E2] dark:text-[#8B96F2]">
                No records found. Upload a dataset to get started.
              </p>
              <button
                onClick={handleUploadNav}
                className="inline-flex items-center gap-2 rounded-full bg-[#5B66E2] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V4m0 0L8 8m4-4l4 4" />
                </svg>
                Upload File
              </button>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {showSkeleton ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            ) : (
              <>
                <MetricCard label="Total Payment Amount" value={`₱${fmt(fa.totalAmount)}`} icon={DollarSign} iconBg="bg-[#5B66E2]" info="Sum of all payments" />
                <MetricCard label="Unique Accounts" value={fmt(fa.totalAccounts)} icon={Users} iconBg="bg-[#4a55d1]" info="Distinct debtor IDs" />
                <MetricCard label="Total Transactions" value={fmt(fa.totalPayments)} icon={FileText} iconBg="bg-[#5B66E2]" info="Total payment rows" />
                <MetricCard label="Banks / Portfolios" value={fmt(fa.bankAnalytics.length)} icon={Landmark} iconBg="bg-[#4048c0]" info="Distinct banks" />
              </>
            )}
          </div>

          {/* Monthly Trend — full width */}
          <Card className="p-6 bg-card border-border mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Payment Trend by Month</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Total payment amount collected per month — shows growth or decline over time</p>
              </div>
            </div>
            {showSkeleton ? <Skeleton className="h-[220px] w-full rounded-xl" /> : monthlyTrend.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">No date data available</div>
            ) : (
              <DynamicChart data={monthlyTrend} type="line" dataKey="amount" xAxisKey="month" height={220} />
            )}
            {!showSkeleton && monthlyTrend.length >= 2 && (() => {
              const first = monthlyTrend[0];
              const last = monthlyTrend[monthlyTrend.length - 1];
              // Only show % change if first month has substantial data (> 1% of last month)
              // to avoid misleading % from outlier months
              const showPct = first.amount > (last.amount * 0.01);
              const diff = last.amount - first.amount;
              const pct = showPct && first.amount > 0 ? ((diff / first.amount) * 100).toFixed(1) : null;
              const up = diff >= 0;
              return (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Showing {first.month} – {last.month}
                  </p>
                  {pct !== null && Math.abs(Number(pct)) < 1000 && (
                    <span className={`flex items-center gap-1 text-xs font-medium ${up ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                      {up ? "▲" : "▼"} {Math.abs(Number(pct))}% vs first month
                    </span>
                  )}
                </div>
              );
            })()}
          </Card>

          {/* Row 2: Top Banks bar + Touchpoint mix donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Top Banks by Payment Amount</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Top 10 banks ranked by total amount collected</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[320px] w-full rounded-xl" /> : (() => {
                const d = fa.bankAnalytics.slice(0, 10);
                return <DynamicChart data={[...d].sort((a, b) => a.totalAmount - b.totalAmount).map((a) => ({ bank: a.bank, amount: a.totalAmount }))} type="barh" dataKey="amount" xAxisKey="bank" height={320} />;
              })()}
            </Card>
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Touchpoint Mix (Top 8)</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Distribution of transactions across the top 8 touchpoints by count</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[320px] w-full rounded-xl" /> : (
                <DynamicChart data={fa.touchpointAnalytics.slice(0, 8).map((t) => ({ touchpoint: t.touchpoint, count: t.count }))} type="donut" dataKey="count" xAxisKey="touchpoint" height={320} valueType="count" />
              )}
            </Card>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB 2 — PORTFOLIO
      ════════════════════════════════════════════════════════ */}
      {activeTab === "portfolio" && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {showSkeleton ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
              <>
                <MetricCard label="Total Payment Amount" value={`₱${fmt(portfolioAnalytics.totalAmount)}`} icon={DollarSign} iconBg="bg-[#5B66E2]" />
                <MetricCard label="Unique Accounts" value={fmt(portfolioAnalytics.totalAccounts)} icon={Users} iconBg="bg-[#4a55d1]" />
                <MetricCard label="Total Transactions" value={fmt(portfolioAnalytics.totalPayments)} icon={FileText} iconBg="bg-[#5B66E2]" />
                <MetricCard label="Total Banks" value={fmt(portfolioAnalytics.bankAnalytics.length)} icon={Landmark} iconBg="bg-[#4048c0]" />
              </>
            )}
          </div>

          {portfolioFiltered.length === 0 && !showSkeleton && (
            <div className="mb-6 p-4 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-sm text-[#5B66E2] dark:text-[#8B96F2] text-center">
              No records found for the selected filters.
            </div>
          )}

          {/* Row 1: Amount by Bank (bar) + Portfolio share (donut) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Payment Amount by Bank</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total amount collected per bank — filter by environment to drill down</p>
                </div>
                <select value={portfolioBankTopN === "all" ? "all" : String(portfolioBankTopN)} onChange={(e) => setPortfolioBankTopN(e.target.value === "all" ? "all" : parseInt(e.target.value))} className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#5B66E2]">
                  <option value="10">Top 10</option><option value="20">Top 20</option><option value="50">Top 50</option><option value="all">All</option>
                </select>
              </div>
              {showSkeleton ? <Skeleton className="h-[320px] w-full rounded-xl" /> : (() => {
                const d = portfolioBankTopN === "all" ? portfolioAnalytics.bankAnalytics : portfolioAnalytics.bankAnalytics.slice(0, portfolioBankTopN);
                const minWidth = Math.max(500, d.length * 28);
                return <div className="overflow-x-auto rounded-xl"><div style={{ minWidth }}><DynamicChart data={d.map((a) => ({ bank: a.bank, amount: a.totalAmount }))} type="bar" dataKey="amount" xAxisKey="bank" height={320} /></div></div>;
              })()}
            </Card>
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Top 8 Banks by Amount</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Which banks collected the most — by total payment amount</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[320px] w-full rounded-xl" /> : (
                <DynamicChart data={portfolioAnalytics.bankAnalytics.slice(0, 8).map((a) => ({ bank: a.bank, amount: a.totalAmount }))} type="pie" dataKey="amount" xAxisKey="bank" height={320} />
              )}
            </Card>
          </div>

          {/* Row 2: Transaction Count vs Amount — side by side horizontal bars */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Transaction Count by Bank</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Number of payment transactions per bank — high count means high volume, not necessarily high value</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[280px] w-full rounded-xl" /> : (
                <DynamicChart data={[...portfolioAnalytics.bankAnalytics].sort((a, b) => b.paymentCount - a.paymentCount).slice(0, 10).sort((a, b) => a.paymentCount - b.paymentCount).map((a) => ({ bank: a.bank, transactions: a.paymentCount }))} type="barh" dataKey="transactions" xAxisKey="bank" height={280} valueType="count" />
              )}
            </Card>
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">% Share by Bank</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Each bank's percentage of total collected amount — all banks ranked</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[280px] w-full rounded-xl" /> : (() => {
                const d = portfolioAnalytics.bankAnalytics.slice(0, portfolioBankTopN === "all" ? undefined : portfolioBankTopN);
                const minWidth = Math.max(500, d.length * 28);
                return <div className="overflow-x-auto rounded-xl"><div style={{ minWidth }}><DynamicChart data={d.map((a) => ({ bank: a.bank, percentage: Math.round(a.percentage * 10) / 10 }))} type="bar" dataKey="percentage" xAxisKey="bank" height={280} /></div></div>;
              })()}
            </Card>
          </div>

          {/* Bank Analytics Table */}
          {showSkeleton ? (
            <div className="rounded-lg border bg-card border-border mb-8 p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />)}
            </div>
          ) : (
            <div className="rounded-lg border bg-card border-border overflow-x-auto mb-8">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Bank Analytics</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Detailed breakdown per bank — unique accounts, total amount collected, transaction count and share</p>
                </div>
                <span className="text-xs text-gray-400">{fmt(portfolioAnalytics.bankAnalytics.length)} banks</span>
              </div>
              <table className="w-full min-w-[700px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bank</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Unique Accounts</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Transactions</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr className="bg-muted font-semibold">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(portfolioAnalytics.totalAccounts)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(portfolioAnalytics.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(portfolioAnalytics.totalPayments)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
                  </tr>
                  {portfolioAnalytics.bankAnalytics.slice((portfolioBankPage - 1) * bankRowsPerPage, portfolioBankPage * bankRowsPerPage).map((b) => (
                    <tr key={b.bank} className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{b.bank}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.accountCount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">₱{fmt(b.totalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.paymentCount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{b.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={portfolioBankPage} setPage={setPortfolioBankPage} total={portfolioAnalytics.bankAnalytics.length} rowsPerPage={bankRowsPerPage} />
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB 3 — CHANNELS
      ════════════════════════════════════════════════════════ */}
      {activeTab === "channels" && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {showSkeleton ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
              <>
                <MetricCard label="Total Transactions" value={fmt(tpTotal)} icon={Hash} iconBg="bg-[#5B66E2]" />
                <MetricCard label="Total Amount" value={`₱${fmt(tpTotalAmount)}`} icon={DollarSign} iconBg="bg-[#4a55d1]" />
                <MetricCard label="Active Touchpoints" value={fmt(channelAnalytics.length)} icon={Waypoints} iconBg="bg-[#5B66E2]" />
                <MetricCard label="Top Touchpoint" value={channelAnalytics[0]?.touchpoint ?? "—"} icon={BarChart3} iconBg="bg-[#4048c0]" />
              </>
            )}
          </div>

          {channelAnalytics.length === 0 && !showSkeleton && (
            <div className="mb-6 p-4 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-sm text-[#5B66E2] dark:text-[#8B96F2] text-center">
              No records found for the selected filters.
            </div>
          )}

          {/* Row 1: Channel type groups + Touchpoint donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Touchpoint Type Performance</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Inbound (IB) vs Outbound (OB) vs With Touchpoint vs Ghost Payment vs No Touchpoint — transaction count</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[280px] w-full rounded-xl" /> : (
                <DynamicChart data={channelGroupData.map((g) => ({ group: g.group, count: g.count }))} type="bar" dataKey="count" xAxisKey="group" height={280} valueType="count" />
              )}
            </Card>
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Touchpoint Type — Amount Share</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total payment amount collected per touchpoint type — shows which strategy drives the most value</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[280px] w-full rounded-xl" /> : (
                <DynamicChart data={channelGroupData.map((g) => ({ group: g.group, amount: g.amount }))} type="pie" dataKey="amount" xAxisKey="group" height={280} />
              )}
            </Card>
          </div>

          {/* Row 2: Amount by touchpoint (horizontal) + % share bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Amount by Touchpoint</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Total payment amount collected per individual touchpoint — ranked highest to lowest</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[300px] w-full rounded-xl" /> : (
                <DynamicChart data={[...channelAnalytics].sort((a, b) => a.totalAmount - b.totalAmount).slice(0, 12).map((t) => ({ touchpoint: t.touchpoint, amount: t.totalAmount }))} type="barh" dataKey="amount" xAxisKey="touchpoint" height={300} />
              )}
            </Card>
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Top Touchpoints by Amount</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Top 8 individual touchpoints by total amount — shows which specific touchpoints generate the most collections</p>
                </div>
              </div>
              {showSkeleton ? <Skeleton className="h-[300px] w-full rounded-xl" /> : (
                <DynamicChart data={channelAnalytics.slice(0, 8).map((t) => ({ touchpoint: t.touchpoint, amount: t.totalAmount }))} type="donut" dataKey="amount" xAxisKey="touchpoint" height={300} />
              )}
            </Card>
          </div>

          {/* Touchpoint Analytics Table */}
          {apiLoading ? (
            <div className="rounded-lg border bg-card border-border mb-8 p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />)}
            </div>
          ) : (
            <div className="rounded-lg border bg-card border-border overflow-x-auto mb-8">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Touchpoint Analytics</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Full breakdown per touchpoint — transaction count, amount collected, touchpoint type and share of total</p>
                </div>
                <span className="text-xs text-gray-400">{fmt(channelAnalytics.length)} touchpoints</span>
              </div>
              <table className="w-full min-w-[500px]">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Touchpoint</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Touchpoint Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Transactions</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr className="bg-muted font-semibold">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">—</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(tpTotal)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(tpTotalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
                  </tr>
                  {channelAnalytics.map((t) => (
                    <tr key={t.touchpoint} className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{t.touchpoint}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#5B66E2]/10 text-[#5B66E2] dark:text-[#8B96F2]">{channelType(t.touchpoint)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(t.count)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">₱{fmt(t.totalAmount)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{t.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

