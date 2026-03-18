"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { DollarSign, Users, FileText, Landmark, Waypoints, Hash, BarChart3, ChevronDown, Check, Globe } from "lucide-react";
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
  const allTouchpoints = useMemo(() => {
    if (apiSummary) return apiSummary.touchpoints.map((t) => t.touchpoint);
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.touchpoint || "Unknown"))].sort();
  }, [apiSummary, data]);

  const toggleTouchpoint = (tp: string) => {
    setSelectedTouchpoints((prev) => {
      const next = new Set(prev);
      if (next.has(tp)) next.delete(tp);
      else next.add(tp);
      return next;
    });
  };

  const clearTpFilter = () => setSelectedTouchpoints(new Set());

  // ── Environment filter data ──
  const allEnvironments = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.environment || "Unknown"))].sort();
  }, [data]);

  const toggleEnvironment = (env: string) => {
    setSelectedEnvironments((prev) => {
      const next = new Set(prev);
      if (next.has(env)) next.delete(env);
      else next.add(env);
      return next;
    });
  };

  const clearEnvFilter = () => setSelectedEnvironments(new Set());

  const touchpointAnalytics = useMemo(() => {
    if (apiSummary && !isFiltered) {
      return apiSummary.touchpoints.map((t) => ({
        touchpoint: t.touchpoint,
        count: t.count,
        totalAmount: t.total_amount,
        percentage: t.percentage,
      }));
    }
    if (payments.length === 0) return [];
    const tpMap = new Map<string, { count: number; totalAmount: number }>();
    let totalAmount = 0;
    for (const p of payments) {
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
  }, [apiSummary, payments, isFiltered]);

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
    { label: "Total Transactions", value: fmt(tpTotalTransactions), icon: Hash, iconBg: "bg-teal-500" },
    { label: "Total Amount", value: `₱${fmt(tpTotalAmount)}`, icon: DollarSign, iconBg: "bg-teal-600" },
    { label: "Unique Touchpoints", value: fmt(tpUniqueTouchpoints), icon: Waypoints, iconBg: "bg-teal-500" },
    { label: "Top Touchpoint", value: tpTopTouchpoint, icon: BarChart3, iconBg: "bg-teal-700" },
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
    { label: "Total Payment Amount", value: `₱${fmt(envBankAnalytics.totalAmount)}`, icon: DollarSign, iconBg: "bg-teal-500" },
    { label: "Count of Accounts", value: fmt(envBankAnalytics.totalAccounts), icon: Users, iconBg: "bg-teal-600" },
    { label: "Total Transactions", value: fmt(envBankAnalytics.totalPayments), icon: FileText, iconBg: "bg-teal-500" },
    { label: "Banks / Portfolios", value: fmt(envBankAnalytics.bankAnalytics.length), icon: Landmark, iconBg: "bg-teal-700" },
  ];

  const metricCards = [
    { label: "Total Payment Amount", value: `₱${fmt(fa.totalAmount)}`, icon: DollarSign, iconBg: "bg-teal-500" },
    { label: "Count of Accounts", value: fmt(fa.totalAccounts), icon: Users, iconBg: "bg-teal-600" },
    { label: "Total Transactions", value: fmt(fa.totalPayments), icon: FileText, iconBg: "bg-teal-500" },
    { label: "Banks / Portfolios", value: fmt(fa.bankAnalytics.length), icon: Landmark, iconBg: "bg-teal-700" },
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                      className="w-full px-3 py-2 text-left text-xs text-teal-600 dark:text-teal-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700"
                    >
                      Clear selection
                    </button>
                  )}
                  {allEnvironments.map((env) => (
                    <button
                      key={env}
                      onClick={() => toggleEnvironment(env)}
                      className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${
                        selectedEnvironments.has(env)
                          ? "bg-teal-500 border-teal-500"
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                      className="w-full px-3 py-2 text-left text-xs text-teal-600 dark:text-teal-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700"
                    >
                      Clear selection
                    </button>
                  )}
                  {allTouchpoints.map((tp) => (
                    <button
                      key={tp}
                      onClick={() => toggleTouchpoint(tp)}
                      className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${
                        selectedTouchpoints.has(tp)
                          ? "bg-teal-500 border-teal-500"
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
                ? "border-b-2 border-teal-500 text-teal-500 bg-teal-500/5"
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
              <Card key={i} className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
                  className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
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
        <div className="mb-6 p-4 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 text-sm text-teal-700 dark:text-teal-300 text-center">
          No records found for the selected filters. Upload data or try a different filter.
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 stagger-children">
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Payments per Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={envBankAnalytics.bankAnalytics.map((a) => ({
                bank: a.bank,
                amount: a.totalAmount,
              }))}
              type="bar"
              dataKey="amount"
              xAxisKey="bank"
              height={350}
            />
          )}
        </div>

        <div>
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children mb-12">
        <div>
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
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            % Share by Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
            <DynamicChart
              data={envBankAnalytics.bankAnalytics.map((a) => ({
                bank: a.bank,
                percentage: Math.round(a.percentage * 10) / 10,
              }))}
              type="bar"
              dataKey="percentage"
              xAxisKey="bank"
              height={300}
            />
          )}
        </div>
      </div>

      {/* Bank Analytics Table */}
      {apiLoading ? (
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-8 p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />
          ))}
        </div>
      ) : (
      <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Bank Analytics
          </h3>
        </div>
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50 dark:bg-gray-900">
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
            <tr className="bg-gray-50 dark:bg-gray-900 font-semibold">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(envBankAnalytics.totalAccounts)}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(envBankAnalytics.totalAmount)}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(envBankAnalytics.bankAnalytics.reduce((s, b) => s + b.debtorSum, 0))}</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
              <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(envBankAnalytics.totalPayments)}</td>
            </tr>
            {envBankAnalytics.bankAnalytics.map((b) => (
              <tr key={b.bank} className="hover:bg-teal-50 dark:hover:bg-gray-700/60 transition-colors duration-200">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">{b.bank}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.accountCount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">₱{fmt(b.totalAmount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.debtorSum)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{b.percentage.toFixed(1)}%</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.paymentCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      </>
      ) : activeTab === "overview" ? (
      <>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
        {apiLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-9 w-9 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-24 mt-2" />
              </Card>
            ))
          : metricCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.label}
                  className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
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

      {/* No data notice when a date filter yields no results */}
      {noData && (
        <div className="mb-6 p-4 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 text-sm text-teal-700 dark:text-teal-300 text-center">
          No records found for the selected time range. Upload data or try a different filter.
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 stagger-children">
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Payments per Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (
          <DynamicChart
            data={fa.bankAnalytics.map((a) => ({
              bank: a.bank,
              amount: a.totalAmount,
            }))}
            type="bar"
            dataKey="amount"
            xAxisKey="bank"
            height={350}
          />
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            By Touchpoint
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[350px] w-full rounded-xl" />
          ) : (
          <DynamicChart
            data={fa.touchpointAnalytics.slice(0, 8).map((t) => ({
              touchpoint: t.touchpoint,
              count: t.count,
            }))}
            type="pie"
            dataKey="count"
            xAxisKey="touchpoint"
            height={350}
          />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children mb-12">
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Payment Trend Over Time
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
          <DynamicChart
            data={monthlyTrend}
            type="area"
            dataKey="amount"
            xAxisKey="month"
            height={300}
          />
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Amount Distribution by Bank
          </h3>
          {apiLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
          <DynamicChart
            data={fa.bankAnalytics.slice(0, 10).map((a) => ({
              bank: a.bank,
              amount: a.totalAmount,
            }))}
            type="barh"
            dataKey="amount"
            xAxisKey="bank"
            height={300}
          />
          )}
        </div>
      </div>

      {/* Period-over-Period Comparison */}
      {payments.length > 0 && !apiLoading && (
        <div className="mb-6">
          <PeriodComparison payments={payments} />
        </div>
      )}

      {/* Bank Analytics Table */}
      {apiLoading ? (
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-8 p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />
          ))}
        </div>
      ) : (
      <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Bank Analytics
          </h3>
        </div>
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50 dark:bg-gray-900">
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
            <tr className="bg-gray-50 dark:bg-gray-900 font-semibold">
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
            {fa.bankAnalytics.map((b) => (
              <tr
                key={b.bank}
                className="hover:bg-teal-50 dark:hover:bg-gray-700/60 transition-colors duration-200"
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
            ))}
          </tbody>
        </table>
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
              <Card key={i} className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
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
                  className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
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
        <div className="mb-6 p-4 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 text-sm text-teal-700 dark:text-teal-300 text-center">
          No records found for the selected time range. Upload data or try a different filter.
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 stagger-children">
        <div>
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
        </div>

        <div>
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children mb-12">
        <div>
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
        </div>

        <div>
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
        </div>
      </div>

      {/* Touchpoint Table */}
      {apiLoading ? (
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 mb-8 p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full mb-2 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto mb-8 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Touchpoint Analytics
            </h3>
          </div>
          <table className="w-full min-w-[500px]">
            <thead className="bg-gray-50 dark:bg-gray-900">
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
              <tr className="bg-gray-50 dark:bg-gray-900 font-semibold">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">Total</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(tpTotalTransactions)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(tpTotalAmount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
              </tr>
              {filteredTpAnalytics.map((t) => (
                <tr
                  key={t.touchpoint}
                  className="hover:bg-teal-50 dark:hover:bg-gray-700/60 transition-colors duration-200"
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
