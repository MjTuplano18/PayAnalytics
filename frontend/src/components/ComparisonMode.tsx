"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PaymentRecord, BankAnalytics, TouchpointAnalytics } from "@/types/data";

// ── Types ────────────────────────────────────────────────────────────────────

type CompareMode = "period" | "bank" | "environment" | "touchpoint";

interface ComparisonModeProps {
  payments: PaymentRecord[];
  bankAnalytics: BankAnalytics[];
  touchpointAnalytics: TouchpointAnalytics[];
}

interface MetricRow {
  label: string;
  valueA: number;
  valueB: number;
  format: "currency" | "number";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `₱${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(2)}K`;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVal(n: number, format: "currency" | "number"): string {
  return format === "currency" ? fmtCurrency(n) : fmt(n);
}

function computeSliceMetrics(records: PaymentRecord[]) {
  const accounts = new Set(records.map((r) => r.account));
  const total = records.reduce((s, r) => s + r.paymentAmount, 0);
  return {
    totalAmount: total,
    totalPayments: records.length,
    uniqueAccounts: accounts.size,
    avgPayment: records.length > 0 ? total / records.length : 0,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ComparisonMode({ payments, bankAnalytics, touchpointAnalytics }: ComparisonModeProps) {
  const [mode, setMode] = useState<CompareMode>("period");
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");

  // Unique values for each mode
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      if (p.paymentDate?.length >= 7) set.add(p.paymentDate.slice(0, 7));
    }
    return Array.from(set).sort();
  }, [payments]);

  const banks = useMemo(() => bankAnalytics.map((b) => b.bank).sort(), [bankAnalytics]);

  const environments = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) if (p.environment) set.add(p.environment);
    return Array.from(set).sort();
  }, [payments]);

  const touchpoints = useMemo(() => touchpointAnalytics.map((t) => t.touchpoint).sort(), [touchpointAnalytics]);

  // Available options based on mode
  const options = mode === "period" ? months : mode === "bank" ? banks : mode === "environment" ? environments : touchpoints;

  // Auto-select first two when mode or options change
  const effectiveA = sideA && options.includes(sideA) ? sideA : (options[0] ?? "");
  const effectiveB = sideB && options.includes(sideB) ? sideB : (options[1] ?? options[0] ?? "");

  // Filter payments into A and B slices
  const sliceA = useMemo(() => {
    if (!effectiveA) return [];
    switch (mode) {
      case "period": return payments.filter((p) => p.paymentDate?.startsWith(effectiveA));
      case "bank": return payments.filter((p) => p.bank === effectiveA);
      case "environment": return payments.filter((p) => p.environment === effectiveA);
      case "touchpoint": return payments.filter((p) => p.touchpoint === effectiveA);
    }
  }, [payments, mode, effectiveA]);

  const sliceB = useMemo(() => {
    if (!effectiveB) return [];
    switch (mode) {
      case "period": return payments.filter((p) => p.paymentDate?.startsWith(effectiveB));
      case "bank": return payments.filter((p) => p.bank === effectiveB);
      case "environment": return payments.filter((p) => p.environment === effectiveB);
      case "touchpoint": return payments.filter((p) => p.touchpoint === effectiveB);
    }
  }, [payments, mode, effectiveB]);

  const metricsA = useMemo(() => computeSliceMetrics(sliceA), [sliceA]);
  const metricsB = useMemo(() => computeSliceMetrics(sliceB), [sliceB]);

  const rows: MetricRow[] = [
    { label: "Total Amount", valueA: metricsA.totalAmount, valueB: metricsB.totalAmount, format: "currency" },
    { label: "Transactions", valueA: metricsA.totalPayments, valueB: metricsB.totalPayments, format: "number" },
    { label: "Unique Accounts", valueA: metricsA.uniqueAccounts, valueB: metricsB.uniqueAccounts, format: "number" },
    { label: "Avg per Transaction", valueA: metricsA.avgPayment, valueB: metricsB.avgPayment, format: "currency" },
  ];

  if (!payments || payments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex items-center gap-2 mb-2">
          <ArrowLeftRight className="w-4 h-4 text-[#5B66E2]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Comparison</h3>
        </div>
        <p className="text-xs text-gray-400">No data available for comparison.</p>
      </div>
    );
  }

  const modes: { key: CompareMode; label: string }[] = [
    { key: "period", label: "Period" },
    { key: "bank", label: "Bank" },
    { key: "environment", label: "Environment" },
    { key: "touchpoint", label: "Touchpoint" },
  ];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-[#5B66E2]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Comparison</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode selector */}
            <div className="flex bg-gray-100 dark:bg-gray-900 rounded-md p-0.5">
              {modes.map((m) => (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); setSideA(""); setSideB(""); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    mode === m.key
                      ? "bg-white dark:bg-gray-700 text-[#5B66E2] shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {/* Selectors */}
            <select
              value={effectiveA}
              onChange={(e) => setSideA(e.target.value)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#5B66E2]"
            >
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="text-xs text-gray-400">vs</span>
            <select
              value={effectiveB}
              onChange={(e) => setSideB(e.target.value)}
              className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#5B66E2]"
            >
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-[#5B66E2] uppercase">{effectiveA || "A"}</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-[#5B66E2] uppercase">{effectiveB || "B"}</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Delta</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((r) => {
              const delta = r.valueB - r.valueA;
              const pct = r.valueA !== 0 ? (delta / r.valueA) * 100 : r.valueB !== 0 ? 100 : 0;
              const isUp = delta > 0;
              const isZero = Math.abs(pct) < 0.1;
              return (
                <tr key={r.label} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.label}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatVal(r.valueA, r.format)}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{formatVal(r.valueB, r.format)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${isZero ? "text-gray-400" : isUp ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                    {isZero ? "—" : `${isUp ? "+" : ""}${formatVal(delta, r.format)}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isZero ? (
                      <span className="flex items-center justify-end gap-1 text-xs text-gray-400"><Minus className="w-3 h-3" /> 0%</span>
                    ) : (
                      <span className={`flex items-center justify-end gap-1 text-xs font-medium ${isUp ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                        {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isUp ? "+" : ""}{pct.toFixed(2)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
