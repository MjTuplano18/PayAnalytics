"use client";

import { useState, useMemo } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { PaymentRecord } from "@/types/data";

interface DrillDownModalProps {
  title: string;
  dimension: string; // The value clicked (e.g. bank name, touchpoint name)
  dimensionKey: "bank" | "touchpoint";
  payments: PaymentRecord[];
  onClose: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

type SortKey = "account" | "totalAmount" | "count" | "date";
type SortDir = "asc" | "desc";

export function DrillDownModal({ title, dimension, dimensionKey, payments, onClose }: DrillDownModalProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalAmount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filter records for this dimension
  const filtered = useMemo(
    () => payments.filter((p) => (dimensionKey === "bank" ? p.bank : p.touchpoint) === dimension),
    [payments, dimension, dimensionKey]
  );

  // Summary stats
  const stats = useMemo(() => {
    const total = filtered.reduce((s, p) => s + p.paymentAmount, 0);
    const accounts = new Set(filtered.map((p) => p.account));
    const dates = filtered.map((p) => p.paymentDate).filter(Boolean).sort();
    return {
      totalAmount: total,
      totalPayments: filtered.length,
      uniqueAccounts: accounts.size,
      avgPayment: filtered.length > 0 ? total / filtered.length : 0,
      dateRange: dates.length > 0 ? `${dates[0]} — ${dates[dates.length - 1]}` : "—",
    };
  }, [filtered]);

  // Group by account for the breakdown table
  const accountBreakdown = useMemo(() => {
    const map = new Map<string, { totalAmount: number; count: number; lastDate: string }>();
    for (const p of filtered) {
      if (!map.has(p.account)) map.set(p.account, { totalAmount: 0, count: 0, lastDate: "" });
      const entry = map.get(p.account)!;
      entry.totalAmount += p.paymentAmount;
      entry.count++;
      if (p.paymentDate > entry.lastDate) entry.lastDate = p.paymentDate;
    }
    const rows = Array.from(map.entries()).map(([account, d]) => ({
      account,
      totalAmount: d.totalAmount,
      count: d.count,
      date: d.lastDate,
    }));

    rows.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  // Secondary breakdown: by touchpoint if drilling from bank, or by bank if drilling from touchpoint
  const secondaryBreakdown = useMemo(() => {
    const key = dimensionKey === "bank" ? "touchpoint" : "bank";
    const map = new Map<string, { amount: number; count: number }>();
    for (const p of filtered) {
      const val = key === "bank" ? p.bank : p.touchpoint;
      if (!map.has(val)) map.set(val, { amount: 0, count: 0 });
      const entry = map.get(val)!;
      entry.amount += p.paymentAmount;
      entry.count++;
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, amount: d.amount, count: d.count, pct: stats.totalAmount > 0 ? (d.amount / stats.totalAmount) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered, dimensionKey, stats.totalAmount]);

  const totalPages = Math.max(1, Math.ceil(accountBreakdown.length / pageSize));
  const pageRows = accountBreakdown.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Drill-down: {dimension}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total Amount", value: `₱${fmt(stats.totalAmount)}` },
              { label: "Transactions", value: fmt(stats.totalPayments) },
              { label: "Unique Accounts", value: fmt(stats.uniqueAccounts) },
              { label: "Avg / Transaction", value: `₱${fmt(stats.avgPayment)}` },
              { label: "Date Range", value: stats.dateRange },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 truncate">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Secondary Breakdown (by touchpoint/bank) */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              By {dimensionKey === "bank" ? "Touchpoint" : "Bank"}
            </h4>
            <div className="space-y-1.5">
              {secondaryBreakdown.slice(0, 8).map((b) => (
                <div key={b.name} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 dark:text-gray-400 w-28 truncate">{b.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Math.min(b.pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{b.pct.toFixed(1)}%</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300 w-20 text-right">₱{fmt(b.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Account Breakdown Table */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Account Breakdown ({fmt(accountBreakdown.length)} accounts)
            </h4>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th onClick={() => handleSort("account")} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700">
                      Account <SortIcon col="account" />
                    </th>
                    <th onClick={() => handleSort("totalAmount")} className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700">
                      Total Amount <SortIcon col="totalAmount" />
                    </th>
                    <th onClick={() => handleSort("count")} className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700">
                      Payments <SortIcon col="count" />
                    </th>
                    <th onClick={() => handleSort("date")} className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700">
                      Last Date <SortIcon col="date" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pageRows.map((r) => (
                    <tr key={r.account} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-3 py-2 text-gray-800 dark:text-gray-200 font-mono text-xs">{r.account}</td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">₱{fmt(r.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{fmt(r.count)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-gray-500">Page {page} of {totalPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40">Prev</button>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
