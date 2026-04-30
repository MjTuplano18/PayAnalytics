"use client";

import { useState, useMemo } from "react";
import { Users, DollarSign, FileText, Info } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { DynamicChart } from "@/components/DynamicChart";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { useUploadRecords } from "@/lib/queries";
import type { PaymentRecord } from "@/types/data";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AccountsPage() {
  const { data, sessionId, sessionValidated } = useData();
  const { token } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const rowsPerPage = 25;

  // When data context is null but sessionId is set, fetch records from API (cached via TanStack Query)
  const { data: uploadDetail, isLoading: apiLoading } = useUploadRecords(
    token, data ? null : sessionId, sessionValidated
  );
  const apiPayments: PaymentRecord[] | null = uploadDetail
    ? uploadDetail.records.map((r) => ({
        id: r.id,
        bank: r.bank,
        account: r.account,
        touchpoint: r.touchpoint ?? "",
        paymentDate: r.payment_date ?? "",
        paymentAmount: r.payment_amount,
        environment: r.environment ?? undefined,
      }))
    : null;

  // Filter payments by date range first
  const sourcePayments = data?.payments ?? apiPayments ?? [];
  const payments = useMemo(() => {
    if (sourcePayments.length === 0) return [];
    return filterByDateRange(sourcePayments, dateRange, (p) => p.paymentDate, customRange);
  }, [sourcePayments, dateRange, customRange]);

  // Account-level analytics (aggregate by debtor_id/account)
  const accountData = useMemo(() => {
    if (payments.length === 0) return [];
    const map = new Map<
      string,
      { totalAmount: number; paymentCount: number; banks: Set<string> }
    >();
    for (const p of payments) {
      if (!map.has(p.account)) {
        map.set(p.account, { totalAmount: 0, paymentCount: 0, banks: new Set() });
      }
      const entry = map.get(p.account)!;
      entry.totalAmount += p.paymentAmount;
      entry.paymentCount++;
      entry.banks.add(p.bank);
    }
    return Array.from(map.entries())
      .map(([account, d]) => ({
        account,
        totalAmount: d.totalAmount,
        paymentCount: d.paymentCount,
        bankCount: d.banks.size,
        banks: [...d.banks].join(", "),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [payments]);

  if (!data && !apiPayments) {
    if (apiLoading) {
      return (
        <div className="px-4 sm:px-8 py-8 min-h-screen">
          <div className="p-12 rounded-lg text-center bg-card border border-border">
            <p className="text-gray-600 dark:text-gray-400">Loading account data…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen">
        <div className="p-12 rounded-lg text-center bg-card border border-border">
          <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
            No Data Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {sessionId
              ? "Restoring session data — please wait or go to Upload History to reload."
              : "Please upload an Excel file to view account data"}
          </p>
        </div>
      </div>
    );
  }

  const avgPayments =
    accountData.length > 0
      ? accountData.reduce((s, a) => s + a.paymentCount, 0) / accountData.length
      : 0;

  const avgAmount =
    accountData.length > 0
      ? accountData.reduce((s, a) => s + a.totalAmount, 0) / accountData.length
      : 0;

  const metrics = [
    {
      label: "Total Accounts",
      value: fmt(data?.totalAccounts ?? accountData.length),
      icon: Users,
      iconBg: "bg-[#4a55d1]",
      info: "Unique accounts in dataset",
    },
    {
      label: "Avg Payments / Account",
      value: avgPayments.toFixed(2),
      icon: FileText,
      iconBg: "bg-[#5B66E2]",
      info: "Average payment count per account",
    },
    {
      label: "Avg Amount / Account",
      value: `₱${fmt(Math.round(avgAmount))}`,
      icon: DollarSign,
      iconBg: "bg-[#5B66E2]",
      info: "Average payment amount per account",
    },
  ];

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
              Accounts
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Debtor account analytics
            </p>
          </div>
          <DateFilter
            value={dateRange}
            onChange={(r, c) => { setDateRange(r); setCustomRange(c); setCurrentPage(1); }}
            customRange={customRange}
          />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 stagger-children">
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <Card
              key={idx}
              className="flex-1 overflow-hidden bg-card border-border gap-0 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
            >
              <div className="h-1 bg-[#5B66E2]" />
              <div className="flex flex-col h-[calc(100%-4px)] px-5 pt-3 pb-4 gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {m.label}:
                  </span>
                  <div className={`p-2 mt-1 mr-0.5 ${m.iconBg} rounded-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <span className="inline-block px-6 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-lg font-bold text-gray-900 dark:text-white">
                    {m.value}
                  </span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{m.info}</span>
                  <Info className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Top 10 Accounts Chart */}
      <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <Card className="p-6 bg-card border-border">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Top 10 Accounts by Amount</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Top 10 debtor accounts ranked by total payment amount collected</p>
          <DynamicChart
            data={accountData.slice(0, 10).map((a) => ({
              account: a.account,
              amount: a.totalAmount,
            }))}
            type="bar"
            dataKey="amount"
            xAxisKey="account"
            height={350}
          />
        </Card>
      </div>

      {/* Account Details Table */}
      {(() => {
        const totalPages = Math.max(1, Math.ceil(accountData.length / rowsPerPage));
        const start = (currentPage - 1) * rowsPerPage;
        const pageRows = accountData.slice(start, start + rowsPerPage);
        const pageNums: number[] = [];
        let ps = Math.max(1, currentPage - 2);
        let pe = Math.min(totalPages, ps + 4);
        ps = Math.max(1, pe - 4);
        for (let i = ps; i <= pe; i++) pageNums.push(i);

        return (
          <div className="rounded-lg border bg-card border-border overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Account Details
              </h3>
            </div>
            <table className="w-full min-w-[600px]">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Account
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Total Amount
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Payments
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Banks
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {pageRows.map((a) => (
                  <tr
                    key={a.account}
                    className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors duration-200"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {a.account}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 font-medium">
                      ₱{fmt(a.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                      {fmt(a.paymentCount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[300px] truncate">
                      {a.banks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {fmt(start + 1)}&ndash;{fmt(Math.min(start + rowsPerPage, accountData.length))} of {fmt(accountData.length)} accounts
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                {pageNums.map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      pg === currentPage
                        ? "bg-[#4a55d1] text-white border-[#4a55d1] shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2]"
                    }`}
                  >
                    {pg}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-[#5B66E2]/5 hover:border-[#5B66E2] hover:text-[#5B66E2] dark:hover:bg-[#5B66E2]/20 dark:hover:border-[#5B66E2] dark:hover:text-[#8B96F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
