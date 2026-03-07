"use client";

import { useState, useMemo } from "react";
import { Users, DollarSign, FileText } from "lucide-react";
import { useData } from "@/context/DataContext";
import { Card } from "@/components/ui/card";
import { DynamicChart } from "@/components/DynamicChart";
import { DateFilter, DateRange, filterByDateRange } from "@/components/DateFilter";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function AccountsPage() {
  const { data } = useData();
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const rowsPerPage = 25;

  // Filter payments by date range first
  const payments = useMemo(() => {
    if (!data) return [];
    return filterByDateRange(data.payments, dateRange, (p) => p.paymentDate);
  }, [data, dateRange]);

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

  if (!data) {
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen">
        <div className="p-12 rounded-lg text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
            No Data Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please upload an Excel file to view account data
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
      value: fmt(data.totalAccounts),
      icon: Users,
      iconBg: "bg-blue-500",
    },
    {
      label: "Avg Payments / Account",
      value: avgPayments.toFixed(1),
      icon: FileText,
      iconBg: "bg-green-500",
    },
    {
      label: "Avg Amount / Account",
      value: `₱${fmt(Math.round(avgAmount))}`,
      icon: DollarSign,
      iconBg: "bg-purple-500",
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
          <DateFilter value={dateRange} onChange={(r) => { setDateRange(r); setCurrentPage(1); }} />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 stagger-children">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.label}
              className="p-6 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-default"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {m.label}
                </span>
                <div className={`p-2 ${m.iconBg} rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {m.value}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Top 10 Accounts Chart */}
      <div className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Top 10 Accounts by Amount
        </h3>
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
          <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Account Details
              </h3>
            </div>
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50 dark:bg-gray-900">
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
                    className="hover:bg-purple-50 dark:hover:bg-gray-700/60 transition-colors duration-200"
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
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                {pageNums.map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      pg === currentPage
                        ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-200"
                    }`}
                  >
                    {pg}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
