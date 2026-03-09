"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useData } from "@/context/DataContext";
import { parseExcelFile, generateMockData } from "@/utils/excelParser";
import { toast } from "sonner";

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setData, setRawData, setFileName } = useData();

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setUploadSuccess(false);

    try {
      const parsedData = await parseExcelFile(file);
      setData(parsedData);
      setRawData(parsedData.raw);
      setFileName(file.name);
      setUploadSuccess(true);
      toast.success("File uploaded successfully!");

      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to parse file. Please ensure it's a valid .xlsx or .xls file.";
      setError(message);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (
      file &&
      (file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls") ||
        file.name.endsWith(".json"))
    ) {
      handleFileUpload(file);
    } else {
      setError("Please upload a valid Excel file (.xlsx, .xls) or JSON file");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleUseMockData = () => {
    const mockData = generateMockData();
    setData(mockData);
    setRawData(mockData.raw);
    setFileName("mock_data.xlsx");
    toast.success("Mock data loaded successfully!");
    setTimeout(() => {
      router.push("/dashboard");
    }, 1000);
  };

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
            Upload Data
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Import data from Excel or CSV files
          </p>
        </div>

        {/* Data Type Selector */}
        <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Data Type
          </h3>
          <select className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option>Transaction</option>
          </select>
          <Button className="mt-4 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-950 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Download Template
          </Button>
        </div>

        {/* Upload Area */}
        <Card
          className="p-8 sm:p-12 border-2 border-dashed bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-center cursor-pointer hover:border-purple-500 hover:shadow-lg transition-all duration-300 animate-fade-in-up"
          style={{ animationDelay: '0.15s' }}
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-12 sm:w-16 h-12 sm:h-16 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
          <h3 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900 dark:text-white">
            Drag and drop your file here
          </h3>
          <p className="mb-4 text-gray-500 dark:text-gray-400">
            Supports CSV, XLSX, and JSON files
          </p>
          <Button
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Browse Files"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </Card>

        {/* Import Instructions */}
        <div className="p-6 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mt-6 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-start gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-gray-900 dark:text-white font-semibold mb-2">
                Import Instructions
              </h4>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>
                  <strong>Required Columns:</strong> Bank, Payment Date
                  (leads_result_edate), Payment Amount (leads_result_amount),
                  Account (debtor_id), Touchpoint (TAGGING)
                </li>
                <li>
                  <strong>Supported formats:</strong> .xlsx, .xls, .csv
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-4">
            <h5 className="text-gray-900 dark:text-white font-semibold mb-2">
              Tips:
            </h5>
            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <li>Dates can be in YYYY-MM-DD format or Excel serial numbers</li>
              <li>Payment amounts should be numeric values</li>
              <li>Column headers are matched flexibly (e.g. &quot;Bank&quot;, &quot;BANK&quot;, &quot;bank&quot; all work)</li>
            </ul>
          </div>
        </div>

        {/* Alerts */}
        {uploadSuccess && (
          <Alert className="mt-6 bg-green-50 dark:bg-green-900 border-green-300 dark:border-green-700">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              File uploaded successfully! Redirecting to dashboard...
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mt-6 bg-red-50 dark:bg-red-900 border-red-300 dark:border-red-700">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Mock Data Button */}
        <div className="mt-6 text-center">
          <p className="text-sm mb-2 text-gray-500 dark:text-gray-400">
            Don&apos;t have data? Try our sample dataset
          </p>
          <Button
            onClick={handleUseMockData}
            variant="outline"
            className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Use Sample Data
          </Button>
        </div>
      </div>
    </div>
  );
}
