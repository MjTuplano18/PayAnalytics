"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { DollarSign, Users, FileText, Landmark, Waypoints, Hash, BarChart3, ChevronDown, Check, Globe, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { DynamicChart } from "@/components/DynamicChart";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { PeriodComparison } from "@/components/PeriodComparison";
import { type DashboardSummary } from "@/lib/api";
import { useDashboard } from "@/lib/queries";

/** Format number with commas */
function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function DashboardPage() {
  const { data, sessionId } = useData();
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "touchpoints" | "environments">("overview");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const { data: apiSummary, isLoading: apiLoading } = useDashboard(token, sessionId);

  // Touchpoints tab state
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<Set<string>>(new Set());
  const [tpDropdownOpen, setTpDropdownOpen] = useState(false);
  const tpDropdownRef = useRef<HTMLDivElement>(null);

  // Environment filter state
  const [selectedEnvironments, setSelectedEnvironments] = useState<Set<string>>(new Set());
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const envDropdownRef = useRef<HTMLDivElement>(null);

  // Top-N bank chart limit
  const [bankTopN, setBankTopN] = useState<number | "all">(20);
  const [envBankTopN, setEnvBankTopN] = useState<number | "all">(20);

  // Bank Analytics table pagination
  const [bankPage, setBankPage] = useState(1);
  const [envBankPage, setEnvBankPage] = useState(1);
  const bankRowsPerPage = 15;

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tpDropdownRef.current && !tpDropdownRef.current.contains(e.target as Node)) {
        setTpDropdownOpen(false);
      }
      if (envDropdownRef.current && !envDropdownRef.current.contains(e.target as Node)) {
        setEnvDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const payments = useMemo(() => {
    if (!data) return [];
    return filterByDateRange(data.payments, dateRange, (p) => p.paymentDate, customRange);
  }, [data, dateRange, customRange]);

  // Monthly trend from in-memory data (API doesn't aggregate by month yet)
  const monthlyTrend = useMemo(() => {
    if (payments.length === 0) return [];
    const map = new Map<string, number>();
    for (const p of payments) {
      const month = p.paymentDate.slice(0, 7) || "Unknown";
      map.set(month, (map.get(month) || 0) + p.paymentAmount);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
  }, [payments]);

  // Use backend summary only when showing all data (no date filter active)
  // When a date filter is active, always compute in-memory from filtered payments
  const isFiltered = dateRange !== "all";

  const rawFa = useMemo(() => {
    if (apiSummary && !isFiltered) {
      return {
        totalAmount: apiSummary.total_amount,
        totalAccounts: apiSummary.total_accounts,
        totalPayments: apiSummary.total_payments,
        bankAnalytics: apiSummary.banks.map((b) => {
          // compute debtorSum from in-memory data for this bank
          const bankPayments = (data?.payments ?? []).filter((p) => p.bank === b.bank);
          const debtorSum = bankPayments.reduce((s, p) => s + (Number(p.account) || 0), 0);
          return {
            bank: b.bank,
            accountCount: b.account_count,
            totalAmount: b.total_amount,
            debtorSum,
            percentage: b.percentage,
            paymentCount: b.payment_count,
          };
        }),
        touchpointAnalytics: apiSummary.touchpoints.map((t) => ({
          touchpoint: t.touchpoint,
          count: t.count,
          totalAmount: t.total_amount,
          percentage: t.percentage,
        })),
      };
    }
    if (payments.length === 0) return null;
    const bankMap = new Map<string, { accountCount: number; totalAmount: number; debtorSum: number; paymentCount: number; accounts: Set<string> }>();
    const tpMap = new Map<string, { count: number; totalAmount: number }>();
    let totalAmount = 0;
    const allAccounts = new Set<string>();

    for (const p of payments) {
      totalAmount += p.paymentAmount;
      allAccounts.add(p.account);

      if (!bankMap.has(p.bank)) bankMap.set(p.bank, { accountCount: 0, totalAmount: 0, debtorSum: 0, paymentCount: 0, accounts: new Set() });
      const bEntry = bankMap.get(p.bank)!;
      bEntry.totalAmount += p.paymentAmount;
      bEntry.debtorSum += parseInt(p.account) || 0;
      bEntry.paymentCount++;
      bEntry.accounts.add(p.account);

      if (!tpMap.has(p.touchpoint)) tpMap.set(p.touchpoint, { count: 0, totalAmount: 0 });
      const tEntry = tpMap.get(p.touchpoint)!;
      tEntry.count++;
      tEntry.totalAmount += p.paymentAmount;
    }

    const bankAnalytics = Array.from(bankMap.entries())
      .map(([bank, d]) => ({ bank, accountCount: d.accounts.size, totalAmount: d.totalAmount, debtorSum: d.debtorSum, percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0, paymentCount: d.paymentCount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const touchpointAnalytics = Array.from(tpMap.entries())
      .map(([touchpoint, d]) => ({ touchpoint, count: d.count, totalAmount: d.totalAmount, percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    return { bankAnalytics, touchpointAnalytics, totalAmount, totalAccounts: allAccounts.size, totalPayments: payments.length };
  }, [apiSummary, payments, isFiltered]);

  // Fallback empty analytics object so layout always renders
  const fa = rawFa ?? {
    totalAmount: 0,
    totalAccounts: 0,
    totalPayments: 0,
    bankAnalytics: [],
    touchpointAnalytics: [],
  };

  const noData = !rawFa && !apiLoading;

  // ── Touchpoints tab data ──
  // ── Environment filter data ──
  const allEnvironments = useMemo(() => {
    if (apiSummary) return apiSummary.environments;
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.environment).filter(Boolean) as string[])].sort();
  }, [apiSummary, data]);

  const toggleEnvironment = (env: string) => {
    setSelectedEnvironments((prev) => {
      const next = new Set(prev);
      if (next.has(env)) next.delete(env);
      else next.add(env);
      // Reset touchpoint selection when env changes
      setSelectedTouchpoints(new Set());
      return next;
    });
  };

  const clearEnvFilter = () => {
    setSelectedEnvironments(new Set());
    setSelectedTouchpoints(new Set());
  };

  // Touchpoints available based on selected environments (cascading)
  const allTouchpoints = useMemo(() => {
    if (apiSummary) {
      const envMap = apiSummary.environment_map ?? [];
      if (selectedEnvironments.size > 0 && envMap.length > 0) {
        const tpSet = new Set<string>();
        for (const envEntry of envMap) {
          if (selectedEnvironments.has(envEntry.environment)) {
            for (const tps of Object.values(envEntry.touchpoints_by_bank)) {
              tps.forEach((tp) => tpSet.add(tp));
            }
          }
        }
        return Array.from(tpSet).sort();
      }
      return apiSummary.touchpoints.map((t) => t.touchpoint);
    }
    if (!data) return [];
    const filteredPayments = selectedEnvironments.size > 0
      ? data.payments.filter((p) => selectedEnvironments.has(p.environment || "Unknown"))
      : data.payments;
    return [...new Set(filteredPayments.map((p) => p.touchpoint || "Unknown"))].sort();
  }, [apiSummary, data, selectedEnvironments]);

  const toggleTouchpoint = (tp: string) => {
    setSelectedTouchpoints((prev) => {
      const next = new Set(prev);
      if (next.has(tp)) next.delete(tp);
      else next.add(tp);
      return next;
    });
  };

  const clearTpFilter = () => setSelectedTouchpoints(new Set());

  const touchpointAnalytics = useMemo(() => {
    // When environments are selected, always use in-memory filtering for accuracy
    const envFiltered = selectedEnvironments.size > 0
      ? payments.filter((p) => selectedEnvironments.has(p.environment || "Unknown"))
      : payments;

    if (apiSummary && !isFiltered && selectedEnvironments.size === 0) {
      return apiSummary.touchpoints.map((t) => ({
        touchpoint: t.touchpoint,
        count: t.count,
        totalAmount: t.total_amount,
        percentage: t.percentage,
      }));
    }
    if (envFiltered.length === 0) return [];
    const tpMap = new Map<string, { count: number; totalAmount: number }>();
    let totalAmount = 0;
    for (const p of envFiltered) {
      totalAmount += p.paymentAmount;
      const tp = p.touchpoint || "Unknown";
      if (!tpMap.has(tp)) tpMap.set(tp, { count: 0, totalAmount: 0 });
      const entry = tpMap.get(tp)!;
      entry.count++;
      entry.totalAmount += p.paymentAmount;
    }
    return Array.from(tpMap.entries())
      .map(([touchpoint, d]) => ({
        touchpoint,
        count: d.count,
        totalAmount: d.totalAmount,
        percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [apiSummary, payments, isFiltered, selectedEnvironments]);

  const filteredTpAnalytics = useMemo(() => {
    if (selectedTouchpoints.size === 0) return touchpointAnalytics;
    return touchpointAnalytics.filter((t) => selectedTouchpoints.has(t.touchpoint));
  }, [touchpointAnalytics, selectedTouchpoints]);

  const tpTotalTransactions = filteredTpAnalytics.reduce((s, t) => s + t.count, 0);
  const tpTotalAmount = filteredTpAnalytics.reduce((s, t) => s + t.totalAmount, 0);
  const tpUniqueTouchpoints = filteredTpAnalytics.length;
  const tpTopTouchpoint = filteredTpAnalytics[0]?.touchpoint ?? "—";
  const tpNoData = filteredTpAnalytics.length === 0 && !apiLoading;

  const tpMetricCards = [
    { label: "Total Transactions", value: fmt(tpTotalTransactions), icon: Hash, iconBg: "bg-[#5B66E2]" },
    { label: "Total Amount", value: `₱${fmt(tpTotalAmount)}`, icon: DollarSign, iconBg: "bg-[#4a55d1]" },
    { label: "Unique Touchpoints", value: fmt(tpUniqueTouchpoints), icon: Waypoints, iconBg: "bg-[#5B66E2]" },
    { label: "Top Touchpoint", value: tpTopTouchpoint, icon: BarChart3, iconBg: "bg-[#4048c0]" },
  ];

  // ── Environments tab data (bank-only, filtered by environment) ──
  const envFilteredPayments = useMemo(() => {
    if (selectedEnvironments.size === 0) return payments;
    return payments.filter((p) => selectedEnvironments.has(p.environment || "Unknown"));
  }, [payments, selectedEnvironments]);

  const envBankAnalytics = useMemo(() => {
    const src = envFilteredPayments;
    if (src.length === 0) return { bankAnalytics: [] as typeof fa.bankAnalytics, totalAmount: 0, totalAccounts: 0, totalPayments: 0 };
    const bankMap = new Map<string, { accountCount: number; totalAmount: number; debtorSum: number; paymentCount: number; accounts: Set<string> }>();
    let totalAmount = 0;
    const allAccounts = new Set<string>();
    for (const p of src) {
      totalAmount += p.paymentAmount;
      allAccounts.add(p.account);
      if (!bankMap.has(p.bank)) bankMap.set(p.bank, { accountCount: 0, totalAmount: 0, debtorSum: 0, paymentCount: 0, accounts: new Set() });
      const bEntry = bankMap.get(p.bank)!;
      bEntry.totalAmount += p.paymentAmount;
      bEntry.debtorSum += parseInt(p.account) || 0;
      bEntry.paymentCount++;
      bEntry.accounts.add(p.account);
    }
    const bankAnalytics = Array.from(bankMap.entries())
      .map(([bank, d]) => ({ bank, accountCount: d.accounts.size, totalAmount: d.totalAmount, debtorSum: d.debtorSum, percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0, paymentCount: d.paymentCount }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
    return { bankAnalytics, totalAmount, totalAccounts: allAccounts.size, totalPayments: src.length };
  }, [envFilteredPayments]);

  const envNoData = envFilteredPayments.length === 0 && !apiLoading;

  const envMetricCards = [
    { label: "Total Payment Amount", value: `₱${fmt(envBankAnalytics.totalAmount)}`, icon: DollarSign, iconBg: "bg-[#5B66E2]" },
    { label: "Count of Accounts", value: fmt(envBankAnalytics.totalAccounts), icon: Users, iconBg: "bg-[#4a55d1]" },
    { label: "Total Transactions", value: fmt(envBankAnalytics.totalPayments), icon: FileText, iconBg: "bg-[#5B66E2]" },
    { label: "Banks / Portfolios", value: fmt(envBankAnalytics.bankAnalytics.length), icon: Landmark, iconBg: "bg-[#4048c0]" },
  ];

  const metricCards = [
    { label: "Total Payment Amount", value: `₱${fmt(fa.totalAmount)}`, icon: DollarSign, iconBg: "bg-[#5B66E2]", info: "Sum of all payment amounts" },
    { label: "Count of Accounts", value: fmt(fa.totalAccounts), icon: Users, iconBg: "bg-[#4a55d1]", info: "Unique accounts in dataset" },
    { label: "Total Transactions", value: fmt(fa.totalPayments), icon: FileText, iconBg: "bg-[#5B66E2]", info: "Total number of payments" },
    { label: "Banks / Portfolios", value: fmt(fa.bankAnalytics.length), icon: Landmark, iconBg: "bg-[#4048c0]", info: "Distinct banks or portfolios" },
  ];

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Welcome{user ? `, ${user.full_name.split(" ")[0]}` : ""}!
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Environment filter (on touchpoints & environments tabs) */}
          {(activeTab === "touchpoints" || activeTab === "environments") && (
            <div ref={envDropdownRef} className="relative">
              <button
                onClick={() => setEnvDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
              >
                <Globe className="h-4 w-4" />
                {selectedEnvironments.size === 0
                  ? "All Environments"
                  : `${selectedEnvironments.size} selected`}
                <ChevronDown className={`h-4 w-4 transition-transform ${envDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {envDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {selectedEnvironments.size > 0 && (
                    <button
                      onClick={clearEnvFilter}
                      className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] dark:text-[#8B96F2] hover:bg-muted/50 dark:hover:bg-muted border-b border-gray-200 dark:border-gray-700"
                    >
                      Clear selection
                    </button>
                  )}
                  {allEnvironments.map((env) => (
                    <button
                      key={env}
                      onClick={() => toggleEnvironment(env)}
                      className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
                    >
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${
                        selectedEnvironments.has(env)
                          ? "bg-[#5B66E2] border-[#5B66E2]"
                          : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {selectedEnvironments.has(env) && <Check className="h-3 w-3 text-white" />}
                      </span>
                      {env}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Touchpoint filter (only on touchpoints tab) */}
          {activeTab === "touchpoints" && (
            <div ref={tpDropdownRef} className="relative">
              <button
                onClick={() => setTpDropdownOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
              >
                <Waypoints className="h-4 w-4" />
                {selectedTouchpoints.size === 0
                  ? "All Touchpoints"
                  : `${selectedTouchpoints.size} selected`}
                <ChevronDown className={`h-4 w-4 transition-transform ${tpDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {tpDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                  {selectedTouchpoints.size > 0 && (
                    <button
                      onClick={clearTpFilter}
                      className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] dark:text-[#8B96F2] hover:bg-muted/50 dark:hover:bg-muted border-b border-gray-200 dark:border-gray-700"
                    >
                      Clear selection
                    </button>
                  )}
                  {allTouchpoints.map((tp) => (
                    <button
                      key={tp}
                      onClick={() => toggleTouchpoint(tp)}
                      className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
                    >
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${
                        selectedTouchpoints.has(tp)
                          ? "bg-[#5B66E2] border-[#5B66E2]"
                          : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {selectedTouchpoints.has(tp) && <Check className="h-3 w-3 text-white" />}
                      </span>
                      {tp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <DateFilter
            value={dateRange}
            onChange={(r, c) => { setDateRange(r); setCustomRange(c); }}
            customRange={customRange}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-6">
        {(["overview", "touchpoints", "environments"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium transition-colors -mb-px ${
              activeTab === tab
                ? "border-b-2 border-[#5B66E2] text-[#5B66E2] bg-[#5B66E2]/5"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "touchpoints" ? "Touchpoints" : "Environments"}
          </button>
        ))}
      </div>

      {activeTab === "environments" ? (
      /* ── Environments Tab (Bank-only stats) ── */
      <>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        {apiLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-6 bg-card border-border">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-24 mt-2" />
              </Card>
            ))
          : envMetricCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.label}
                  className="p-6 bg-card border-border hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {card.label}
                    </span>
                    <div className={`p-2 ${card.iconBg} rounded-lg`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {card.value}
                  </div>
                </Card>
              );
            })}
      </div>

      {envNoData && (
        <div className="mb-6 p-4 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-sm text-[#5B66E2] dark:text-[#8B96F2] text-center">
          No records found for the selected filters. Upload data or try a different filter.
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 stagger-children">
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Payments per Bank
            </h3>
            <select
              value={envBankTopN === "all" ? "all" : String(envBankTopN)}
              onChange={(e) => setEnvBankTopN(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#5B66E2]"
            >
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="all">All</option>
            </select>
          </div>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (() => {
            const envBankData = envBankTopN === "all"
              ? envBankAnalytics.bankAnalytics
              : envBankAnalytics.bankAnalytics.slice(0, envBankTopN);
            const minWidth = Math.max(550, envBankData.length * 28);
            return (
              <div className="overflow-x-auto rounded-xl">
                <div style={{ minWidth }}>
                  <DynamicChart
                    data={envBankData.map((a) => ({ bank: a.bank, amount: a.totalAmount }))}
                    type="bar"
                    dataKey="amount"
                    xAxisKey="bank"
                    height={350}
                  />
                </div>
              </div>
            );
          })()}
        </Card>

        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Bank Distribution
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={envBankAnalytics.bankAnalytics.slice(0, 8).map((a) => ({
                bank: a.bank,
                amount: a.totalAmount,
              }))}
              type="pie"
              dataKey="amount"
              xAxisKey="bank"
              height={350}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children mb-12">
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Amount Distribution by Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={envBankAnalytics.bankAnalytics.slice(0, 10).map((a) => ({
                bank: a.bank,
                amount: a.totalAmount,
              }))}
              type="barh"
              dataKey="amount"
              xAxisKey="bank"
              height={300}
            />
          )}
        </Card>

        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            % Share by Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (() => {
            const shareData = envBankTopN === "all"
              ? envBankAnalytics.bankAnalytics
              : envBankAnalytics.bankAnalytics.slice(0, envBankTopN);
            const minWidth = Math.max(550, shareData.length * 28);
            return (
              <div className="overflow-x-auto rounded-xl">
                <div style={{ minWidth }}>
                  <DynamicChart
                    data={shareData.map((a) => ({ bank: a.bank, percentage: Math.round(a.percentage * 10) / 10 }))}
                    type="bar"
                    dataKey="percentage"
                    xAxisKey="bank"
                    height={300}
                  />
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Bank Analytics Table */}
      {apiLoading ? (
        <div className="rounded-lg border bg-card border-border mb-8 p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />
          ))}
        </div>
      ) : (
      <div className="rounded-lg border bg-card border-border overflow-x-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Bank Analytics
          </h3>
        </div>
        <table className="w-full min-w-[700px]">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bank</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Count of Account</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sum of Amount</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sum of Debtor ID</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% of Total</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            <tr className="bg-muted font-semibold">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(envBankAnalytics.totalAccounts)}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(envBankAnalytics.totalAmount)}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(envBankAnalytics.bankAnalytics.reduce((s, b) => s + b.debtorSum, 0))}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(envBankAnalytics.totalPayments)}</td>
            </tr>
            {(() => {
              const allRows = envBankAnalytics.bankAnalytics;
              const totalPages = Math.max(1, Math.ceil(allRows.length / bankRowsPerPage));
              const paged = allRows.slice((envBankPage - 1) * bankRowsPerPage, envBankPage * bankRowsPerPage);
              return paged.map((b) => (
              <tr key={b.bank} className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{b.bank}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.accountCount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">₱{fmt(b.totalAmount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.debtorSum)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{b.percentage.toFixed(1)}%</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.paymentCount)}</td>
              </tr>
              ));
            })()}
          </tbody>
        </table>
        {/* Env Bank Analytics Pagination */}
        {(() => {
          const totalRows = envBankAnalytics.bankAnalytics.length;
          const totalPages = Math.max(1, Math.ceil(totalRows / bankRowsPerPage));
          if (totalPages <= 1) return null;
          const pages: number[] = [];
          let start = Math.max(1, envBankPage - 2);
          let end = Math.min(totalPages, start + 4);
          start = Math.max(1, end - 4);
          for (let i = start; i <= end; i++) pages.push(i);
          return (
            <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {fmt((envBankPage - 1) * bankRowsPerPage + 1)}&ndash;{fmt(Math.min(envBankPage * bankRowsPerPage, totalRows))} of {fmt(totalRows)} banks
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setEnvBankPage(1)} disabled={envBankPage === 1} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">First</button>
                <button onClick={() => setEnvBankPage((p) => Math.max(1, p - 1))} disabled={envBankPage === 1} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Prev</button>
                {pages.map((pg) => (
                  <button key={pg} onClick={() => setEnvBankPage(pg)} className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${pg === envBankPage ? "bg-[#4a55d1] text-white border-[#4a55d1] shadow-sm" : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2]"}`}>{pg}</button>
                ))}
                <button onClick={() => setEnvBankPage((p) => Math.min(totalPages, p + 1))} disabled={envBankPage === totalPages} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
                <button onClick={() => setEnvBankPage(totalPages)} disabled={envBankPage === totalPages} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Last</button>
              </div>
            </div>
          );
        })()}
      </div>
      )}
      </>
      ) : activeTab === "overview" ? (
      <>
      {/* No data notice when a date filter yields no results */}
      {noData && (
        <div className="mb-6 p-4 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-sm text-[#5B66E2] dark:text-[#8B96F2] text-center">
          No records found for the selected time range. Upload data or try a different filter.
        </div>
      )}

      {/* Row 1: Bar chart (wide) + 2 stacked metric cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 mb-6 overflow-hidden">
        {/* Bar chart */}
        <Card className="p-4 bg-card border-border overflow-hidden min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Payments per Bank
            </h3>
            <select
              value={bankTopN === "all" ? "all" : String(bankTopN)}
              onChange={(e) => setBankTopN(e.target.value === "all" ? "all" : parseInt(e.target.value))}
              className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#5B66E2]"
            >
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="all">All</option>
            </select>
          </div>
          {apiLoading ? (
            <Skeleton className="h-[280px] w-full rounded-xl" />
          ) : (() => {
            const bankData = bankTopN === "all"
              ? fa.bankAnalytics
              : fa.bankAnalytics.slice(0, bankTopN);
            const minWidth = Math.max(550, bankData.length * 28);
            return (
              <div className="overflow-x-auto rounded-xl">
                <div style={{ minWidth }}>
                  <DynamicChart
                    data={bankData.map((a) => ({ bank: a.bank, amount: a.totalAmount }))}
                    type="bar"
                    dataKey="amount"
                    xAxisKey="bank"
                    height={280}
                  />
                </div>
              </div>
            );
          })()}
        </Card>

        {/* Card 1 + Card 2 stacked */}
        <div className="flex flex-col gap-4">
          {apiLoading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="flex-1 overflow-hidden bg-card border-border gap-0">
                  <div className="h-1 bg-[#5B66E2]" />
                  <div className="p-4">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-8 w-full rounded-full" />
                  </div>
                </Card>
              ))
            : metricCards.slice(0, 2).map((card) => {
                const Icon = card.icon;
                return (
                  <Card
                    key={card.label}
                    className="flex-1 overflow-hidden bg-card border-border gap-0 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
                  >
                    <div className="h-1 bg-[#5B66E2]" />
                    <div className="flex flex-col h-[calc(100%-4px)] px-4 pt-1 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {card.label}:
                        </span>
                        <div className={`p-2 mt-1 mr-0.5 ${card.iconBg} rounded-lg`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <span className="inline-block px-6 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-900 dark:text-white">
                          {card.value}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{card.info}</span>
                        <Info className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                      </div>
                    </div>
                  </Card>
                );
              })}
        </div>
      </div>

      {/* Row 2: Pie chart + Horizontal bar chart + 2 stacked metric cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_400px] gap-6 mb-6">
        {/* Pie chart */}
        <Card className="p-4 bg-card border-border">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            By Touchpoint
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[280px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={fa.touchpointAnalytics.slice(0, 8).map((t) => ({
                touchpoint: t.touchpoint,
                count: t.count,
              }))}
              type="pie"
              dataKey="count"
              xAxisKey="touchpoint"
              height={280}
            />
          )}
        </Card>

        {/* Horizontal bar chart */}
        <Card className="p-4 bg-card border-border">
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            Amount Distribution by Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[280px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={fa.bankAnalytics.slice(0, 10).map((a) => ({
                bank: a.bank,
                amount: a.totalAmount,
              }))}
              type="barh"
              dataKey="amount"
              xAxisKey="bank"
              height={280}
            />
          )}
        </Card>

        {/* Card 3 + Card 4 stacked */}
        <div className="flex flex-col gap-4">
          {apiLoading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Card key={i} className="flex-1 overflow-hidden bg-card border-border gap-0">
                  <div className="h-1 bg-[#5B66E2]" />
                  <div className="p-4">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-8 w-full rounded-full" />
                  </div>
                </Card>
              ))
            : metricCards.slice(2, 4).map((card) => {
                const Icon = card.icon;
                return (
                  <Card
                    key={card.label}
                    className="flex-1 overflow-hidden bg-card border-border gap-0 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
                  >
                    <div className="h-1 bg-[#5B66E2]" />
                    <div className="flex flex-col h-[calc(100%-4px)] px-4 pt-1 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          {card.label}:
                        </span>
                        <div className={`p-2 mt-1 mr-0.5 ${card.iconBg} rounded-lg`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        <span className="inline-block px-6 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-900 dark:text-white">
                          {card.value}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{card.info}</span>
                        <Info className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                      </div>
                    </div>
                  </Card>
                );
              })}
        </div>
      </div>

      {/* Row 3: Bank Analytics Table (full width) */}
      {apiLoading ? (
        <div className="rounded-lg border bg-card border-border mb-8 p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />
          ))}
        </div>
      ) : (
      <div className="rounded-lg border bg-card border-border overflow-x-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Bank Analytics
          </h3>
        </div>
        <table className="w-full min-w-[700px]">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Bank
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Count of Account
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Sum of Amount
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Sum of Debtor ID
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                % of Total
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Payments
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {/* Totals row - at the top */}
            <tr className="bg-muted font-semibold">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                Total
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                {fmt(fa.totalAccounts)}
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                ₱{fmt(fa.totalAmount)}
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                {fmt(fa.bankAnalytics.reduce((s, b) => s + b.debtorSum, 0))}
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                100.0%
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">
                {fmt(fa.totalPayments)}
              </td>
            </tr>
            {(() => {
              const allRows = fa.bankAnalytics;
              const totalPages = Math.max(1, Math.ceil(allRows.length / bankRowsPerPage));
              const paged = allRows.slice((bankPage - 1) * bankRowsPerPage, bankPage * bankRowsPerPage);
              return paged.map((b) => (
              <tr
                key={b.bank}
                className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  {b.bank}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                  {fmt(b.accountCount)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                  ₱{fmt(b.totalAmount)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                  {fmt(b.debtorSum)}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                  {b.percentage.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                  {fmt(b.paymentCount)}
                </td>
              </tr>
              ));
            })()}
          </tbody>
        </table>
        {/* Bank Analytics Pagination */}
        {(() => {
          const totalRows = fa.bankAnalytics.length;
          const totalPages = Math.max(1, Math.ceil(totalRows / bankRowsPerPage));
          if (totalPages <= 1) return null;
          const pages: number[] = [];
          let start = Math.max(1, bankPage - 2);
          let end = Math.min(totalPages, start + 4);
          start = Math.max(1, end - 4);
          for (let i = start; i <= end; i++) pages.push(i);
          return (
            <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {fmt((bankPage - 1) * bankRowsPerPage + 1)}&ndash;{fmt(Math.min(bankPage * bankRowsPerPage, totalRows))} of {fmt(totalRows)} banks
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setBankPage(1)} disabled={bankPage === 1} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">First</button>
                <button onClick={() => setBankPage((p) => Math.max(1, p - 1))} disabled={bankPage === 1} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Prev</button>
                {pages.map((pg) => (
                  <button key={pg} onClick={() => setBankPage(pg)} className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${pg === bankPage ? "bg-[#4a55d1] text-white border-[#4a55d1] shadow-sm" : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2]"}`}>{pg}</button>
                ))}
                <button onClick={() => setBankPage((p) => Math.min(totalPages, p + 1))} disabled={bankPage === totalPages} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next</button>
                <button onClick={() => setBankPage(totalPages)} disabled={bankPage === totalPages} className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Last</button>
              </div>
            </div>
          );
        })()}
      </div>
      )}
      </>
      ) : (
      /* ── Touchpoints Tab ── */
      <>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        {apiLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-6 bg-card border-border">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-24 mt-2" />
              </Card>
            ))
          : tpMetricCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.label}
                  className="p-6 bg-card border-border hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {card.label}
                    </span>
                    <div className={`p-2 ${card.iconBg} rounded-lg`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {card.value}
                  </div>
                </Card>
              );
            })}
      </div>

      {tpNoData && (
        <div className="mb-6 p-4 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-sm text-[#5B66E2] dark:text-[#8B96F2] text-center">
          No records found for the selected time range. Upload data or try a different filter.
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 stagger-children">
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Transactions per Touchpoint
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={filteredTpAnalytics.map((t) => ({
                touchpoint: t.touchpoint,
                count: t.count,
              }))}
              type="bar"
              dataKey="count"
              xAxisKey="touchpoint"
              height={350}
            />
          )}
        </Card>

        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Touchpoint Distribution
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={filteredTpAnalytics.slice(0, 8).map((t) => ({
                touchpoint: t.touchpoint,
                count: t.count,
              }))}
              type="pie"
              dataKey="count"
              xAxisKey="touchpoint"
              height={350}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children mb-12">
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Amount by Touchpoint
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={filteredTpAnalytics.map((t) => ({
                touchpoint: t.touchpoint,
                amount: t.totalAmount,
              }))}
              type="barh"
              dataKey="amount"
              xAxisKey="touchpoint"
              height={300}
            />
          )}
        </Card>

        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            % Share by Touchpoint
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={filteredTpAnalytics.map((t) => ({
                touchpoint: t.touchpoint,
                percentage: Math.round(t.percentage * 10) / 10,
              }))}
              type="bar"
              dataKey="percentage"
              xAxisKey="touchpoint"
              height={300}
            />
          )}
        </Card>
      </div>

      {/* Touchpoint Table */}
      {apiLoading ? (
        <div className="rounded-lg border bg-card border-border mb-8 p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card border-border overflow-x-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Touchpoint Analytics
            </h3>
          </div>
          <table className="w-full min-w-[500px]">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Touchpoint
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Transactions
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {/* Totals row */}
              <tr className="bg-muted font-semibold">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(tpTotalTransactions)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(tpTotalAmount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
              </tr>
              {filteredTpAnalytics.map((t) => (
                <tr
                  key={t.touchpoint}
                  className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {t.touchpoint}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {fmt(t.count)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    ₱{fmt(t.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {t.percentage.toFixed(1)}%
                  </td>
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
