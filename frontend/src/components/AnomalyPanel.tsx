"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ShieldAlert, Info } from "lucide-react";
import { type Anomaly } from "@/utils/anomalyDetection";

interface AnomalyPanelProps {
  anomalies: Anomaly[];
}

const ICON_MAP: Record<Anomaly["type"], string> = {
  high_amount: "💰",
  duplicate: "📋",
  spike: "📈",
  zero_amount: "⚠️",
  future_date: "📅",
};

export function AnomalyPanel({ anomalies }: AnomalyPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300 animate-fade-in-up">
        <Info className="w-4 h-4 flex-shrink-0" />
        No anomalies detected — data looks clean.
      </div>
    );
  }

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden animate-fade-in-up">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-sm text-amber-800 dark:text-amber-200">
          Anomaly Detection
        </span>
        <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
          {anomalies.length} issue{anomalies.length !== 1 ? "s" : ""}
          {criticalCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">
              {criticalCount} critical
            </span>
          )}
        </span>
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-800/50">
        {anomalies.map((a) => {
          const isExpanded = expanded === a.type;
          return (
            <div key={a.type}>
              <button
                onClick={() => setExpanded(isExpanded ? null : a.type)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              >
                <span className="text-lg">{ICON_MAP[a.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{a.message}</p>
                </div>
                <span
                  className={`flex-shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${
                    a.severity === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {a.severity}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
              </button>
              {isExpanded && a.records.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="rounded border border-gray-200 dark:border-gray-700 overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-gray-500 dark:text-gray-400">Account</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 dark:text-gray-400">Bank</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 dark:text-gray-400">Date</th>
                          <th className="px-2 py-1.5 text-right text-gray-500 dark:text-gray-400">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {a.records.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-2 py-1 text-gray-700 dark:text-gray-300">{r.account}</td>
                            <td className="px-2 py-1 text-gray-700 dark:text-gray-300">{r.bank}</td>
                            <td className="px-2 py-1 text-gray-700 dark:text-gray-300">{r.paymentDate}</td>
                            <td className="px-2 py-1 text-right text-gray-700 dark:text-gray-300">
                              ₱{r.paymentAmount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {a.count > a.records.length && (
                    <p className="text-xs text-gray-500 mt-1">
                      Showing {a.records.length} of {a.count} records
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
