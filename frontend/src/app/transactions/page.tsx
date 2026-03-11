"use client";

import { useState, useMemo, useEffect } from "react";
import { Download, Search } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { getTransactions, getDashboardSummary, type PaymentRecordOut } from "@/lib/api";
import { useDashboard, useTransactions } from "@/lib/queries";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function TransactionsPage() {
  const { data, sessionId, globalSearchQuery, setGlobalSearchQuery } = useData();
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [bankFilter, setBankFilter] = useState("all");
  const [tpFilter, setTpFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const rowsPerPage = 25;

  // Backend-mode state using TanStack Query (cached, no redundant Neon fetches)
  const { data: dashSummary } = useDashboard(token, sessionId);
  const apiFilters = {
    bank: bankFilter !== "all" ? bankFilter : undefined,
    touchpoint: tpFilter !== "all" ? tpFilter : undefined,
    search: searchQuery || undefined,
    page: currentPage,
    page_size: rowsPerPage,
  };
  const { data: txPage, isFetching: apiLoading } = useTransactions(token, sessionId, apiFilters);

  const apiRows = txPage?.items ?? null;
  const apiTotal = txPage?.total ?? 0;
  const apiTotalAmount = dashSummary?.total_amount ?? 0;
  const apiBanks = dashSummary?.banks.map((b) => b.bank) ?? [];
  const apiTouchpoints = dashSummary?.touchpoints.map((t) => t.touchpoint) ?? [];

  // Initialize search query from global context (e.g. nav bar search)
  useEffect(() => {
    if (globalSearchQuery) {
      setSearchQuery(globalSearchQuery);
      setGlobalSearchQuery("");
    }
  }, [globalSearchQuery, setGlobalSearchQuery]);

  // In-memory fallback (used when sessionId is null)
  const inMemoryBanks = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.bank))].sort();
  }, [data]);

  const inMemoryTouchpoints = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.touchpoint))].sort();
  }, [data]);

  const inMemoryFiltered = useMemo(() => {
    if (sessionId || !data) return [];
    const dateFiltered = filterByDateRange(data.payments, dateRange, (p) => p.paymentDate, customRange);
    return dateFiltered.filter((p) => {
      if (bankFilter !== "all" && p.bank !== bankFilter) return false;
      if (tpFilter !== "all" && p.touchpoint !== tpFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.bank.toLowerCase().includes(q) ||
          p.account.toLowerCase().includes(q) ||
          p.touchpoint.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, sessionId, bankFilter, tpFilter, searchQuery, dateRange, customRange]);

  const inMemoryFilteredTotal = useMemo(
    () => inMemoryFiltered.reduce((s, p) => s + p.paymentAmount, 0),
    [inMemoryFiltered]
  );

  const inMemoryTotalPages = Math.max(1, Math.ceil(inMemoryFiltered.length / rowsPerPage));
  const inMemoryPaginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return inMemoryFiltered.slice(start, start + rowsPerPage);
  }, [inMemoryFiltered, currentPage]);

  // Derived display values (switches between API and in-memory)
  const usingApi = !!sessionId;
  const displayBanks = usingApi ? apiBanks : inMemoryBanks;
  const displayTouchpoints = usingApi ? apiTouchpoints : inMemoryTouchpoints;
  const displayRows = usingApi
    ? (apiRows ?? []).map((r) => ({
        bank: r.bank,
        paymentDate: r.payment_date,
        paymentAmount: r.payment_amount,
        account: r.account,
        touchpoint: r.touchpoint,
      }))
    : inMemoryPaginatedRows.map((p) => ({
        bank: p.bank,
        paymentDate: p.paymentDate,
        paymentAmount: p.paymentAmount,
        account: p.account,
        touchpoint: p.touchpoint,
      }));
  const displayTotal = usingApi ? apiTotal : inMemoryFiltered.length;
  const displayTotalAmount = usingApi ? apiTotalAmount : inMemoryFilteredTotal;
  const displayTotalPages = usingApi ? Math.max(1, Math.ceil(apiTotal / rowsPerPage)) : inMemoryTotalPages;

  // Reset to page 1 when filters change
  const resetPage = () => setCurrentPage(1);

  const handleExport = () => {
    const rows = usingApi
      ? (apiRows ?? []).map((r) => [r.bank, r.payment_date, r.payment_amount.toFixed(2), r.account, r.touchpoint])
      : inMemoryFiltered.map((p) => [p.bank, p.paymentDate, p.paymentAmount.toFixed(2), p.account, p.touchpoint]);
    const csv = [
      ["Bank", "Payment Date", "Payment Amount", "Account", "Touchpoint"],
      ...rows,
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data && !sessionId) {
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen">
        <div className="p-12 rounded-lg text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
            No Data Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please upload an Excel file to view transactions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
              Transactions
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {fmt(displayTotal)} records &middot; ₱{fmt(displayTotalAmount)} total
            </p>
          </div>
          <Button
            onClick={handleExport}
            className="bg-teal-600 hover:bg-teal-700 text-white self-start sm:self-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Date Filter — only shown for in-memory mode */}
        {!usingApi && (
          <div className="mb-4">
            <DateFilter
              value={dateRange}
              onChange={(r, c) => { setDateRange(r); setCustomRange(c); resetPage(); }}
              customRange={customRange}
            />
          </div>
        )}

        {/* Filters */}
        <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search bank, account, touchpoint..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); resetPage(); }}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <select
              value={bankFilter}
              onChange={(e) => { setBankFilter(e.target.value); resetPage(); }}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Banks</option>
              {displayBanks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              value={tpFilter}
              onChange={(e) => { setTpFilter(e.target.value); resetPage(); }}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Touchpoints</option>
              {displayTouchpoints.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          {apiLoading ? (
            <div className="p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full mb-2 rounded-md" />
              ))}
            </div>
          ) : (
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Bank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Payment Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Account
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Touchpoint
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {displayRows.map((p, i) => (
                <tr
                  key={`${currentPage}-${i}`}
                  className="hover:bg-teal-50 dark:hover:bg-gray-700/60 transition-colors duration-200"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {p.bank}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {p.paymentDate}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                    ₱{fmt(p.paymentAmount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {p.account}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300">
                      {p.touchpoint}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          {/* Pagination Controls */}
          <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {fmt((currentPage - 1) * rowsPerPage + 1)}&ndash;{fmt(Math.min(currentPage * rowsPerPage, displayTotal))} of {fmt(displayTotal)} records
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>

              {/* Page number buttons */}
              {(() => {
                const pages: number[] = [];
                let start = Math.max(1, currentPage - 2);
                let end = Math.min(displayTotalPages, start + 4);
                start = Math.max(1, end - 4);
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      pg === currentPage
                        ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200"
                    }`}
                  >
                    {pg}
                  </button>
                ));
              })()}

              <button
                onClick={() => setCurrentPage((p) => Math.min(displayTotalPages, p + 1))}
                disabled={currentPage === displayTotalPages}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(displayTotalPages)}
                disabled={currentPage === displayTotalPages}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
