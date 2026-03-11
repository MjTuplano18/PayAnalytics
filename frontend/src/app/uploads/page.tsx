"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { History, FileSpreadsheet, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { listUploads, getUpload, deleteUpload, type UploadSessionOut } from "@/lib/api";
import { ParsedData } from "@/types/data";
import { toast } from "sonner";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UploadsPage() {
  const { token } = useAuth();
  const { sessionId, setSessionId, setData, setFileName } = useData();
  const router = useRouter();

  const [sessions, setSessions] = useState<UploadSessionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await listUploads(token);
      setSessions(result.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()));
    } catch {
      toast.error("Failed to load upload history");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRestore = async (session: UploadSessionOut) => {
    if (!token) return;
    setRestoring(session.id);
    try {
      const detail = await getUpload(token, session.id);

      // Map PaymentRecordOut → PaymentRecord (camelCase)
      const payments = detail.records.map((r) => ({
        bank: r.bank,
        paymentDate: r.payment_date ?? "",
        paymentAmount: r.payment_amount,
        account: r.account,
        touchpoint: r.touchpoint ?? "",
        environment: r.environment,
      }));

      // Build simple analytics for in-memory pages
      const bankMap = new Map<string, { totalAmount: number; paymentCount: number; accounts: Set<string> }>();
      const tpMap = new Map<string, { count: number; totalAmount: number }>();
      let totalAmount = 0;
      const allAccounts = new Set<string>();

      for (const p of payments) {
        totalAmount += p.paymentAmount;
        allAccounts.add(p.account);

        if (!bankMap.has(p.bank)) bankMap.set(p.bank, { totalAmount: 0, paymentCount: 0, accounts: new Set() });
        const b = bankMap.get(p.bank)!;
        b.totalAmount += p.paymentAmount;
        b.paymentCount++;
        b.accounts.add(p.account);

        if (!tpMap.has(p.touchpoint)) tpMap.set(p.touchpoint, { count: 0, totalAmount: 0 });
        const t = tpMap.get(p.touchpoint)!;
        t.count++;
        t.totalAmount += p.paymentAmount;
      }

      const bankAnalytics = Array.from(bankMap.entries())
        .map(([bank, d]) => ({
          bank,
          accountCount: d.accounts.size,
          totalAmount: d.totalAmount,
          debtorSum: 0,
          percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0,
          paymentCount: d.paymentCount,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      const touchpointAnalytics = Array.from(tpMap.entries())
        .map(([touchpoint, d]) => ({
          touchpoint,
          count: d.count,
          totalAmount: d.totalAmount,
          percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const parsedData: ParsedData = {
        payments,
        bankAnalytics,
        touchpointAnalytics,
        totalAccounts: allAccounts.size,
        totalAmount,
        totalPayments: payments.length,
        raw: [],
      };

      setData(parsedData);
      setFileName(detail.file_name);
      setSessionId(detail.id);
      localStorage.setItem("sessionId", detail.id);

      toast.success(`Session restored: ${detail.file_name}`);
      router.push("/dashboard");
    } catch {
      toast.error("Failed to restore session");
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (session: UploadSessionOut) => {
    if (!token) return;
    setDeleting(session.id);
    setConfirmDelete(null);
    try {
      await deleteUpload(token, session.id);
      toast.success(`"${session.file_name}" deleted`);
      // If the deleted session was active, clear it
      if (session.id === sessionId) {
        setSessionId(null);
        setData(null);
        setFileName("");
      }
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch {
      toast.error("Failed to delete upload session");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading upload history...</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="mb-6 flex items-center gap-3">
        <History className="w-7 h-7 text-teal-500" />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Upload History</h1>
          <p className="text-gray-600 dark:text-gray-400">Restore a previous upload session</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="p-12 rounded-lg text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">No uploads yet</h2>
          <p className="text-gray-600 dark:text-gray-400">Upload an Excel file to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const isActive = s.id === sessionId;
            return (
              <div
                key={s.id}
                className={`rounded-lg border p-5 bg-white dark:bg-gray-800 transition-all duration-200 ${
                  isActive
                    ? "border-teal-500 ring-1 ring-teal-400/40 shadow-teal-100 dark:shadow-none"
                    : "border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileSpreadsheet className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {s.file_name}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>{fmt(s.total_records)} records</span>
                      <span>₱{fmt(s.total_amount)}</span>
                      <span>{fmtDate(s.uploaded_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      onClick={() => handleRestore(s)}
                      disabled={restoring === s.id || deleting === s.id}
                      className={`flex items-center gap-2 ${
                        isActive
                          ? "bg-teal-600 hover:bg-teal-700 text-white"
                          : "bg-gray-100 dark:bg-gray-700 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      {restoring === s.id ? "Restoring..." : isActive ? "Reload" : "Restore"}
                    </Button>

                    {confirmDelete === s.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Delete?</span>
                        <Button
                          onClick={() => handleDelete(s)}
                          disabled={deleting === s.id}
                          className="h-8 px-3 text-xs bg-red-600 hover:bg-red-700 text-white"
                        >
                          {deleting === s.id ? "Deleting..." : "Yes"}
                        </Button>
                        <Button
                          onClick={() => setConfirmDelete(null)}
                          className="h-8 px-3 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100"
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setConfirmDelete(s.id)}
                        disabled={restoring === s.id || deleting === s.id}
                        title="Delete this upload session"
                        className="h-9 w-9 p-0 flex items-center justify-center bg-transparent hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
