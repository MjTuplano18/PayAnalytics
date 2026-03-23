"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { exportToExcel, exportToCSV } from "@/utils/exportUtils";
import { getDashboardSummary, getTransactions } from "@/lib/api";
import { toast } from "sonner";
import type { DataRow } from "@/types/data";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function ReportsPage() {
  const { data, rawData, sessionId } = useData();
  const { token } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bankPage, setBankPage] = useState(1);
  const bankRowsPerPage = 15;

  const reportData = useMemo(() => {
    if (!data) return [];
    return data.payments.map((p) => ({
      Bank: p.bank,
      "Payment Date": p.paymentDate,
      "Payment Amount": p.paymentAmount,
      Account: p.account,
      Touchpoint: p.touchpoint,
    }));
  }, [data]);

  // Fetch ALL records from backend (no pagination) for export
  const fetchAllForExport = async (): Promise<{ Bank: string; "Payment Date": string; "Payment Amount": number; Account: string; Touchpoint: string }[]> => {
    if (!token || !sessionId) return reportData;
    // Get total first, then fetch all
    const first = await getTransactions(token, sessionId, { page: 1, page_size: 1 });
    if (first.total === 0) return [];
    const all = await getTransactions(token, sessionId, { page: 1, page_size: first.total });
    return all.items.map((r) => ({
      Bank: r.bank,
      "Payment Date": r.payment_date ?? "",
      "Payment Amount": r.payment_amount,
      Account: r.account,
      Touchpoint: r.touchpoint ?? "",
    }));
  };

  const handleExport = async (format: "excel" | "csv") => {
    setExporting(true);
    try {
      let exportData: DataRow[];
      if (sessionId && token) {
        toast.info("Fetching all records from server...");
        exportData = await fetchAllForExport();
      } else {
        exportData = reportData.length > 0 ? reportData : rawData;
      }

      if (exportData.length === 0) {
        toast.error("No data to export");
        return;
      }

      const fileName = `payanalytics_report_${new Date().toISOString().split("T")[0]}`;
      if (format === "excel") {
        await exportToExcel(exportData, fileName);
        toast.success(`Exported ${fmt(exportData.length)} records to Excel`);
      } else {
        exportToCSV(exportData, fileName);
        toast.success(`Exported ${fmt(exportData.length)} records to CSV`);
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!data && !sessionId) {
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen">
        <div className="p-12 rounded-lg text-center bg-card border border-border">
          <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
            No Data Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please upload an Excel file to generate reports
          </p>
        </div>
      </div>
    );
  }

  // Summary stats
  const totalRecords = sessionId ? (data?.totalPayments ?? 0) : reportData.length;
  const totalAmount = data?.totalAmount ?? 0;
  const bankCount = data?.bankAnalytics.length ?? 0;

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
              Reports
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Generate and export payment reports
            </p>
          </div>
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button
                disabled={exporting}
                className="bg-[#4a55d1] hover:bg-[#4048c0] text-white gap-2"
              >
                <Download className="w-4 h-4" />
                {exporting ? "Exporting..." : "Export"}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                onClick={() => { setExportOpen(false); handleExport("excel"); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export as XLSX
              </button>
              <button
                onClick={() => { setExportOpen(false); handleExport("csv"); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                <Download className="w-4 h-4" />
                Export as CSV
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 animate-fade-in-up">
          <div className="p-5 rounded-lg bg-card border border-border">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Records</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(totalRecords)}</p>
          </div>
          <div className="p-5 rounded-lg bg-card border border-border">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">₱{fmt(totalAmount)}</p>
          </div>
          <div className="p-5 rounded-lg bg-card border border-border">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Banks</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(bankCount)}</p>
          </div>
        </div>

        {/* Bank breakdown table */}
        {data && data.bankAnalytics.length > 0 && (
          <div className="rounded-lg border bg-card border-border overflow-x-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#5B66E2]" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bank Summary</h3>
            </div>
            <table className="w-full min-w-[500px]">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bank</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payments</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.bankAnalytics
                  .slice((bankPage - 1) * bankRowsPerPage, bankPage * bankRowsPerPage)
                  .map((b) => (
                  <tr key={b.bank} className="hover:bg-[#5B66E2]/5 dark:hover:bg-[#5B66E2]/10 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{b.bank}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.paymentCount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 font-medium">₱{fmt(b.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{b.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.bankAnalytics.length > bankRowsPerPage && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Page {bankPage} of {Math.ceil(data.bankAnalytics.length / bankRowsPerPage)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bankPage <= 1}
                    onClick={() => setBankPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bankPage >= Math.ceil(data.bankAnalytics.length / bankRowsPerPage)}
                    onClick={() => setBankPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
