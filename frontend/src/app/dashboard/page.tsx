"use client";

import { useMemo, useState } from "react";
import { DollarSign, Users, FileText, Landmark } from "lucide-react";
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
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const { data: apiSummary, isLoading: apiLoading } = useDashboard(token, sessionId);

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

  const metricCards = [
    { label: "Total Payment Amount", value: `₱${fmt(fa.totalAmount)}`, icon: DollarSign, iconBg: "bg-teal-500" },
    { label: "Count of Accounts", value: fmt(fa.totalAccounts), icon: Users, iconBg: "bg-teal-600" },
    { label: "Total Transactions", value: fmt(fa.totalPayments), icon: FileText, iconBg: "bg-teal-500" },
    { label: "Banks / Portfolios", value: fmt(fa.bankAnalytics.length), icon: Landmark, iconBg: "bg-teal-700" },
  ];

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      {/* Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Welcome{user ? `, ${user.full_name.split(" ")[0]}` : ""}!
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        </div>
        <DateFilter
          value={dateRange}
          onChange={(r, c) => { setDateRange(r); setCustomRange(c); }}
          customRange={customRange}
        />
      </div>

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
    </div>
  );
}
