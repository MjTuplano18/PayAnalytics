"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { Waypoints, DollarSign, Hash, BarChart3, ChevronDown, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { DynamicChart } from "@/components/DynamicChart";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { useDashboard } from "@/lib/queries";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function TouchpointsDashboardPage() {
  const { data, sessionId } = useData();
  const { token, user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<Set<string>>(new Set());
  const [tpDropdownOpen, setTpDropdownOpen] = useState(false);
  const tpDropdownRef = useRef<HTMLDivElement>(null);
  const { data: apiSummary, isLoading: apiLoading } = useDashboard(token, sessionId);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tpDropdownRef.current && !tpDropdownRef.current.contains(e.target as Node)) {
        setTpDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const payments = useMemo(() => {
    if (!data) return [];
    return filterByDateRange(data.payments, dateRange, (p) => p.paymentDate, customRange);
  }, [data, dateRange, customRange]);

  const isFiltered = dateRange !== "all";

  // All available touchpoint names (for the filter dropdown)
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

  // Apply touchpoint filter on top of the analytics
  const filteredAnalytics = useMemo(() => {
    if (selectedTouchpoints.size === 0) return touchpointAnalytics;
    return touchpointAnalytics.filter((t) => selectedTouchpoints.has(t.touchpoint));
  }, [touchpointAnalytics, selectedTouchpoints]);

  const totalTransactions = filteredAnalytics.reduce((s, t) => s + t.count, 0);
  const totalAmount = filteredAnalytics.reduce((s, t) => s + t.totalAmount, 0);
  const uniqueTouchpoints = filteredAnalytics.length;
  const topTouchpoint = filteredAnalytics[0]?.touchpoint ?? "—";

  

  const noData = filteredAnalytics.length === 0 && !apiLoading;

  const metricCards = [
    { label: "Total Transactions", value: fmt(totalTransactions), icon: Hash, iconBg: "bg-[#5B66E2]" },
    { label: "Total Amount", value: `₱${fmt(totalAmount)}`, icon: DollarSign, iconBg: "bg-[#4a55d1]" },
    { label: "Unique Touchpoints", value: fmt(uniqueTouchpoints), icon: Waypoints, iconBg: "bg-[#5B66E2]" },
    { label: "Top Touchpoint", value: topTouchpoint, icon: BarChart3, iconBg: "bg-[#4048c0]" },
  ];

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Welcome{user ? `, ${user.full_name.split(" ")[0]}` : ""}!
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Touchpoints Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Touchpoint multi-select filter */}
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
          <DateFilter
            value={dateRange}
            onChange={(r, c) => { setDateRange(r); setCustomRange(c); }}
            customRange={customRange}
          />
        </div>
      </div>

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
          : metricCards.map((card) => {
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

      {noData && (
        <div className="mb-6 p-4 rounded-lg border border-[#5B66E2]/30 bg-[#5B66E2]/10 text-sm text-[#5B66E2] dark:text-[#8B96F2] text-center">
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
              data={filteredAnalytics.map((t) => ({
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
              data={filteredAnalytics.slice(0, 8).map((t) => ({
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
              data={filteredAnalytics.map((t) => ({
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
              data={filteredAnalytics.map((t) => ({
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
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{fmt(totalTransactions)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₱{fmt(totalAmount)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">100.0%</td>
              </tr>
              {filteredAnalytics.map((t) => (
                <tr key={t.touchpoint} className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200">
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
    </div>
  );
}
