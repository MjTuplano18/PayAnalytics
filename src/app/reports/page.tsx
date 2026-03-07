"use client";

import { useMemo } from "react";
import {
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useData } from "@/context/DataContext";
import { exportToExcel, exportToCSV } from "@/utils/exportUtils";
import { toast } from "sonner";

export default function ReportsPage() {
  const { data, rawData } = useData();

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

  const handleExport = (format: "excel" | "csv") => {
    const exportData = reportData.length > 0 ? reportData : rawData;
    if (exportData.length === 0) {
      toast.error("No data to export");
      return;
    }

    const fileName = `payanalytics_report_${new Date().toISOString().split("T")[0]}`;

    try {
      if (format === "excel") {
        exportToExcel(exportData, fileName);
        toast.success("Exported to Excel");
      } else {
        exportToCSV(exportData, fileName);
        toast.success("Exported to CSV");
      }
    } catch {
      toast.error("Export failed");
    }
  };

  if (!data) {
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

        {/* Export Options */}
        <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Export Options
          </h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={() => handleExport("excel")}
              className="flex-1 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 hover:shadow-md transition-all duration-300"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export to Excel
            </Button>
            <Button
              onClick={() => handleExport("csv")}
              className="flex-1 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 hover:shadow-md transition-all duration-300"
            >
              <Download className="w-4 h-4 mr-2" />
              Export to CSV
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
