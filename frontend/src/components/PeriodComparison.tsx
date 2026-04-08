"use client";

import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PaymentRecord } from "@/types/data";

interface PeriodComparisonProps {
  payments: PaymentRecord[];
}

interface PeriodMetrics {
  totalAmount: number;
  totalPayments: number;
  uniqueAccounts: number;
  avgPayment: number;
}

function computeMetrics(records: PaymentRecord[]): PeriodMetrics {
  const accounts = new Set(records.map((r) => r.account));
  const totalAmount = records.reduce((s, r) => s + r.paymentAmount, 0);
  return {
    totalAmount,
    totalPayments: records.length,
    uniqueAccounts: accounts.size,
    avgPayment: records.length > 0 ? totalAmount / records.length : 0,
  };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(2)}K`;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPlain(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ChangeIndicator({ current, previous }: { current: number; previous: number; isAmount?: boolean }) {
  if (previous === 0 && current === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (previous === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
        <TrendingUp className="w-3 h-3" /> New
      </span>
    );
  }
  const change = ((current - previous) / previous) * 100;
  const isPositive = change > 0;
  const isZero = Math.abs(change) < 0.1;

  if (isZero) {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-400">
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }

  return (
    <span
      className={`flex items-center gap-1 text-xs font-medium ${
        isPositive
          ? "text-green-600 dark:text-green-400"
          : "text-red-500 dark:text-red-400"
      }`}
    >
      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPositive ? "+" : ""}
      {change.toFixed(2)}%
    </span>
  );
}

export function PeriodComparison({ payments }: PeriodComparisonProps) {
  // Extract available months from data
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const p of payments) {
      if (p.paymentDate && p.paymentDate.length >= 7) {
        months.add(p.paymentDate.slice(0, 7));
      }
    }
    return Array.from(months).sort();
  }, [payments]);

  // Default: last 2 months
  const [periodA, setPeriodA] = useState<string | null>(null);
  const [periodB, setPeriodB] = useState<string | null>(null);

  const effectiveA = periodA ?? (availableMonths.length >= 2 ? availableMonths[availableMonths.length - 2] : availableMonths[0] ?? "");
  const effectiveB = periodB ?? (availableMonths.length >= 1 ? availableMonths[availableMonths.length - 1] : "");

  const { previous, current } = useMemo(() => {
    const prev = computeMetrics(payments.filter((p) => p.paymentDate.startsWith(effectiveA)));
    const curr = computeMetrics(payments.filter((p) => p.paymentDate.startsWith(effectiveB)));
    return { previous: prev, current: curr };
  }, [payments, effectiveA, effectiveB]);

  if (payments.length === 0 || availableMonths.length === 0) return null;

  const metrics = [
    { label: "Total Amount", currentVal: fmt(current.totalAmount), previousVal: fmt(previous.totalAmount), current: current.totalAmount, previous: previous.totalAmount, isAmount: true },
    { label: "Transactions", currentVal: fmtPlain(current.totalPayments), previousVal: fmtPlain(previous.totalPayments), current: current.totalPayments, previous: previous.totalPayments },
    { label: "Unique Accounts", currentVal: fmtPlain(current.uniqueAccounts), previousVal: fmtPlain(previous.uniqueAccounts), current: current.uniqueAccounts, previous: previous.uniqueAccounts },
    { label: "Avg per Transaction", currentVal: fmt(current.avgPayment), previousVal: fmt(previous.avgPayment), current: current.avgPayment, previous: previous.avgPayment, isAmount: true },
  ];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden animate-fade-in-up">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Period-over-Period
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <select
            value={effectiveA}
            onChange={(e) => setPeriodA(e.target.value)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#5B66E2]"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className="text-gray-400">vs</span>
          <select
            value={effectiveB}
            onChange={(e) => setPeriodB(e.target.value)}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#5B66E2]"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100 dark:divide-gray-700">
        {metrics.map((m) => (
          <div key={m.label} className="px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{m.label}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{m.currentVal}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400">was {m.previousVal}</span>
              <ChangeIndicator current={m.current} previous={m.previous} isAmount={m.isAmount} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
