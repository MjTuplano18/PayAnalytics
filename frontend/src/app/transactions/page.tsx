"use client";

import { useState, useMemo } from "react";
import { Download, Search } from "lucide-react";
import { useData } from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import { DateFilter, DateRange, filterByDateRange } from "@/components/DateFilter";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function TransactionsPage() {
  const { data } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [bankFilter, setBankFilter] = useState("all");
  const [tpFilter, setTpFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const rowsPerPage = 25;

  const banks = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.bank))].sort();
  }, [data]);

  const touchpoints = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.touchpoint))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const dateFiltered = filterByDateRange(data.payments, dateRange, (p) => p.paymentDate);
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
  }, [data, bankFilter, tpFilter, searchQuery, dateRange]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, p) => s + p.paymentAmount, 0),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, currentPage]);

  // Reset to page 1 when filters change
  const resetPage = () => setCurrentPage(1);

  const handleExport = () => {
    const csv = [
      ["Bank", "Payment Date", "Payment Amount", "Account", "Touchpoint"],
      ...filtered.map((p) => [
        p.bank,
        p.paymentDate,
        p.paymentAmount.toFixed(2),
        p.account,
        p.touchpoint,
      ]),
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

  if (!data) {
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
              {fmt(filtered.length)} records &middot; ₱{fmt(filteredTotal)} total
            </p>
          </div>
          <Button
            onClick={handleExport}
            className="bg-purple-600 hover:bg-purple-700 text-white self-start sm:self-auto"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Date Filter */}
        <div className="mb-4">
          <DateFilter value={dateRange} onChange={(r) => { setDateRange(r); resetPage(); }} />
        </div>

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
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <select
              value={bankFilter}
              onChange={(e) => { setBankFilter(e.target.value); resetPage(); }}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Banks</option>
              {banks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              value={tpFilter}
              onChange={(e) => { setTpFilter(e.target.value); resetPage(); }}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Touchpoints</option>
              {touchpoints.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
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
              {paginatedRows.map((p, i) => (
                <tr
                  key={`${currentPage}-${i}`}
                  className="hover:bg-purple-50 dark:hover:bg-gray-700/60 transition-colors duration-200"
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
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                      {p.touchpoint}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination Controls */}
          <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {fmt((currentPage - 1) * rowsPerPage + 1)}&ndash;{fmt(Math.min(currentPage * rowsPerPage, filtered.length))} of {fmt(filtered.length)} records
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

              {/* Page number buttons */}
              {(() => {
                const pages: number[] = [];
                let start = Math.max(1, currentPage - 2);
                let end = Math.min(totalPages, start + 4);
                start = Math.max(1, end - 4);
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((pg) => (
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
                ));
              })()}

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
      </div>
    </div>
  );
}
