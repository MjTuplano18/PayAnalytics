"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { exportToExcel, exportToCSV } from "@/utils/exportUtils";
import { getDashboardSummary, getTransactions } from "@/lib/api";
import { toast } from "sonner";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function ReportsPage() {
  const { data, rawData, sessionId } = useData();
  const { token } = useAuth();
  const [exporting, setExporting] = useState(false);

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
      let exportData: object[];
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
        <div className="p-12 rounded-lg text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
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
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 animate-fade-in-up">
          <div className="p-5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Records</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(totalRecords)}</p>
          </div>
          <div className="p-5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">₱{fmt(totalAmount)}</p>
          </div>
          <div className="p-5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Banks</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(bankCount)}</p>
          </div>
        </div>

        {/* Export Options */}
        <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Export Options
          </h3>
          {sessionId && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              All records will be fetched from the server and exported.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Button
              onClick={() => handleExport("excel")}
              disabled={exporting}
              className="flex-1 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 hover:shadow-md transition-all duration-300 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              {exporting ? "Exporting..." : "Export to Excel"}
            </Button>
            <Button
              onClick={() => handleExport("csv")}
              disabled={exporting}
              className="flex-1 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 hover:shadow-md transition-all duration-300 disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? "Exporting..." : "Export to CSV"}
            </Button>
          </div>
        </div>

        {/* Bank breakdown table */}
        {data && data.bankAnalytics.length > 0 && (
          <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-teal-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bank Summary</h3>
            </div>
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Bank</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payments</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {data.bankAnalytics.map((b) => (
                  <tr key={b.bank} className="hover:bg-teal-50 dark:hover:bg-gray-700/60 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{b.bank}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(b.paymentCount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 font-medium">₱{fmt(b.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{b.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
