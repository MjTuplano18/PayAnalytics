"use client";

import { useMemo } from "react";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { PaymentRecord } from "@/types/data";

interface DataQualityScorecardProps {
  payments: PaymentRecord[];
  fileName?: string;
}

interface QualityCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  score: number; // 0-100
}

function checkCompleteness(payments: PaymentRecord[]): QualityCheck {
  const total = payments.length;
  if (total === 0) return { label: "Completeness", status: "fail", detail: "No records", score: 0 };
  const missingBank = payments.filter((p) => !p.bank || p.bank === "Unknown").length;
  const missingDate = payments.filter((p) => !p.paymentDate).length;
  const missingAccount = payments.filter((p) => !p.account).length;
  const missingAmount = payments.filter((p) => p.paymentAmount === 0).length;
  const totalMissing = missingBank + missingDate + missingAccount + missingAmount;
  const maxPossible = total * 4;
  const score = Math.round(((maxPossible - totalMissing) / maxPossible) * 100);
  const parts: string[] = [];
  if (missingBank > 0) parts.push(`${missingBank} missing bank`);
  if (missingDate > 0) parts.push(`${missingDate} missing date`);
  if (missingAccount > 0) parts.push(`${missingAccount} missing account`);
  if (missingAmount > 0) parts.push(`${missingAmount} zero amount`);
  return {
    label: "Completeness",
    status: score >= 95 ? "pass" : score >= 80 ? "warn" : "fail",
    detail: parts.length > 0 ? parts.join(", ") : "All fields populated",
    score,
  };
}

function checkUniqueness(payments: PaymentRecord[]): QualityCheck {
  const total = payments.length;
  if (total === 0) return { label: "Uniqueness", status: "fail", detail: "No records", score: 0 };
  const seen = new Set<string>();
  let dupes = 0;
  for (const p of payments) {
    const key = `${p.account}|${p.paymentDate}|${p.paymentAmount}`;
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  const score = Math.round(((total - dupes) / total) * 100);
  return {
    label: "Uniqueness",
    status: dupes === 0 ? "pass" : dupes < total * 0.05 ? "warn" : "fail",
    detail: dupes === 0 ? "No duplicates found" : `${dupes} potential duplicate${dupes > 1 ? "s" : ""}`,
    score,
  };
}

function checkDateValidity(payments: PaymentRecord[]): QualityCheck {
  const withDate = payments.filter((p) => p.paymentDate);
  if (withDate.length === 0) return { label: "Date Validity", status: "fail", detail: "No dates found", score: 0 };
  const dateRegex = /^\d{4}-\d{2}-\d{2}/;
  const validDates = withDate.filter((p) => dateRegex.test(p.paymentDate));
  const today = new Date().toISOString().slice(0, 10);
  const futureDates = validDates.filter((p) => p.paymentDate > today);
  const invalidCount = withDate.length - validDates.length + futureDates.length;
  const score = Math.round(((withDate.length - invalidCount) / withDate.length) * 100);
  const parts: string[] = [];
  if (withDate.length - validDates.length > 0) parts.push(`${withDate.length - validDates.length} invalid format`);
  if (futureDates.length > 0) parts.push(`${futureDates.length} future-dated`);
  return {
    label: "Date Validity",
    status: score >= 95 ? "pass" : score >= 80 ? "warn" : "fail",
    detail: parts.length > 0 ? parts.join(", ") : "All dates valid",
    score,
  };
}

function checkAmountValidity(payments: PaymentRecord[]): QualityCheck {
  const total = payments.length;
  if (total === 0) return { label: "Amount Validity", status: "fail", detail: "No records", score: 0 };
  const negatives = payments.filter((p) => p.paymentAmount < 0);
  const zeros = payments.filter((p) => p.paymentAmount === 0);
  const issues = negatives.length + zeros.length;
  const score = Math.round(((total - issues) / total) * 100);
  const parts: string[] = [];
  if (negatives.length > 0) parts.push(`${negatives.length} negative`);
  if (zeros.length > 0) parts.push(`${zeros.length} zero`);
  return {
    label: "Amount Validity",
    status: score >= 95 ? "pass" : score >= 80 ? "warn" : "fail",
    detail: parts.length > 0 ? parts.join(", ") : "All amounts valid",
    score,
  };
}

function checkDateCoverage(payments: PaymentRecord[]): QualityCheck {
  const dates = payments.map((p) => p.paymentDate).filter((d) => d && d.length >= 10).sort();
  if (dates.length < 2) return { label: "Date Coverage", status: "pass", detail: "Single date range", score: 100 };
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const uniqueDays = new Set(dates.map((d) => d.slice(0, 10))).size;
  const coverage = totalDays > 0 ? (uniqueDays / totalDays) * 100 : 100;
  const gapDays = totalDays - uniqueDays;
  return {
    label: "Date Coverage",
    status: coverage >= 70 ? "pass" : coverage >= 40 ? "warn" : "fail",
    detail: gapDays <= 0 ? "Continuous date range" : `${gapDays} day${gapDays > 1 ? "s" : ""} with no transactions`,
    score: Math.round(coverage),
  };
}

export function DataQualityScorecard({ payments, fileName }: DataQualityScorecardProps) {
  const checks = useMemo(() => {
    if (!payments || payments.length === 0) return [];
    return [
      checkCompleteness(payments),
      checkUniqueness(payments),
      checkDateValidity(payments),
      checkAmountValidity(payments),
      checkDateCoverage(payments),
    ];
  }, [payments]);

  if (checks.length === 0) return null;

  const overallScore = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
  const overallStatus = overallScore >= 90 ? "pass" : overallScore >= 70 ? "warn" : "fail";

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case "pass": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "warn": return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default: return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const scoreColor = overallStatus === "pass" ? "text-green-500" : overallStatus === "warn" ? "text-amber-500" : "text-red-500";
  const scoreBg = overallStatus === "pass" ? "bg-green-100 dark:bg-green-900/30" : overallStatus === "warn" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden animate-fade-in-up">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Data Quality Score</h3>
          {fileName && <p className="text-xs text-gray-500 dark:text-gray-400">{fileName}</p>}
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${scoreBg}`}>
          <StatusIcon status={overallStatus} />
          <span className={`text-lg font-bold ${scoreColor}`}>{overallScore}%</span>
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-3 px-4 py-2.5">
            <StatusIcon status={c.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.label}</span>
                <span className="text-xs font-medium text-gray-500">{c.score}%</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.detail}</p>
            </div>
            <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
              <div
                className={`h-full rounded-full transition-all ${
                  c.status === "pass" ? "bg-green-500" : c.status === "warn" ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${c.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
