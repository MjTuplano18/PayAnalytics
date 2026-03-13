"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Download, Search, Plus, Pencil, Trash2, ChevronDown, X, Check, AlertTriangle } from "lucide-react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { getTransactions, getDashboardSummary, type PaymentRecordOut } from "@/lib/api";
import { useDashboard, useTransactions } from "@/lib/queries";
import { toast } from "sonner";
import type { PaymentRecord, ParsedData } from "@/types/data";

function fmt(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export default function TransactionsPage() {
  const { data, setData, sessionId, globalSearchQuery, setGlobalSearchQuery } = useData();
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bankFilter, setBankFilter] = useState("all");
  const [tpFilter, setTpFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [envFilter, setEnvFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  const rowsPerPage = 25;

  // Debounce search: wait 400 ms after the user stops typing before firing API call
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  // Backend-mode state using TanStack Query (cached, no redundant Neon fetches)
  const { data: dashSummary } = useDashboard(token, sessionId);
  const apiFilters = {
    bank: bankFilter !== "all" ? bankFilter : undefined,
    touchpoint: tpFilter !== "all" ? tpFilter : undefined,
    payment_date: dateFilter !== "all" ? dateFilter : undefined,
    environment: envFilter !== "all" ? envFilter : undefined,
    search: debouncedSearch || undefined,
    page: currentPage,
    page_size: rowsPerPage,
  };
  const { data: txPage, isFetching: apiLoading } = useTransactions(token, sessionId, apiFilters);

  const apiRows = txPage?.items ?? null;
  const apiTotal = txPage?.total ?? 0;
  const apiTotalAmount = txPage?.total_amount ?? 0;
  const apiBanks = dashSummary?.banks.map((b) => b.bank) ?? [];
  const apiTouchpoints = dashSummary?.touchpoints.map((t) => t.touchpoint) ?? [];
  const apiDates = dashSummary?.dates ?? [];
  const apiEnvironments = dashSummary?.environments ?? [];

  // Initialize search query from global context (e.g. nav bar search)
  useEffect(() => {
    if (globalSearchQuery) {
      setSearchQuery(globalSearchQuery);
      setGlobalSearchQuery("");
    }
  }, [globalSearchQuery, setGlobalSearchQuery]);

  // In-memory fallback (used when sessionId is null)
  const inMemoryBanks = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.bank))].sort();
  }, [data]);

  const inMemoryTouchpoints = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.touchpoint))].sort();
  }, [data]);

  const inMemoryDates = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.paymentDate).filter(Boolean))].sort();
  }, [data]);

  const inMemoryEnvironments = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.payments.map((p) => p.environment).filter(Boolean) as string[])].sort();
  }, [data]);

  const inMemoryFiltered = useMemo(() => {
    if (sessionId || !data) return [];
    const dateFiltered = filterByDateRange(data.payments, dateRange, (p) => p.paymentDate, customRange);
    return dateFiltered.filter((p) => {
      if (bankFilter !== "all" && p.bank !== bankFilter) return false;
      if (tpFilter !== "all" && p.touchpoint !== tpFilter) return false;
      if (dateFilter !== "all" && p.paymentDate !== dateFilter) return false;
      if (envFilter !== "all" && (p.environment ?? "") !== envFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        return (
          p.bank.toLowerCase().includes(q) ||
          p.account.toLowerCase().includes(q) ||
          p.touchpoint.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, sessionId, bankFilter, tpFilter, dateFilter, envFilter, debouncedSearch, dateRange, customRange]);

  const inMemoryFilteredTotal = useMemo(
    () => inMemoryFiltered.reduce((s, p) => s + p.paymentAmount, 0),
    [inMemoryFiltered]
  );

  const inMemoryTotalPages = Math.max(1, Math.ceil(inMemoryFiltered.length / rowsPerPage));
  const inMemoryPaginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return inMemoryFiltered.slice(start, start + rowsPerPage);
  }, [inMemoryFiltered, currentPage]);

  // Derived display values (switches between API and in-memory)
  const usingApi = !!sessionId;
  const displayBanks = usingApi ? apiBanks : inMemoryBanks;
  const displayTouchpoints = usingApi ? apiTouchpoints : inMemoryTouchpoints;
  const displayDates = usingApi ? apiDates : inMemoryDates;
  const displayEnvironments = usingApi ? apiEnvironments : inMemoryEnvironments;
  const displayRows = usingApi
    ? (apiRows ?? []).map((r) => ({
        bank: r.bank,
        paymentDate: r.payment_date ?? "",
        paymentAmount: r.payment_amount,
        account: r.account,
        touchpoint: r.touchpoint ?? "",
        environment: r.environment ?? "",
      }))
    : inMemoryPaginatedRows.map((p) => ({
        bank: p.bank,
        paymentDate: p.paymentDate,
        paymentAmount: p.paymentAmount,
        account: p.account,
        touchpoint: p.touchpoint,
        environment: p.environment ?? "",
      }));
  const displayTotal = usingApi ? apiTotal : inMemoryFiltered.length;
  const displayTotalAmount = usingApi ? apiTotalAmount : inMemoryFilteredTotal;
  const displayTotalPages = usingApi ? Math.max(1, Math.ceil(apiTotal / rowsPerPage)) : inMemoryTotalPages;

  // Reset to page 1 when filters change
  const resetPage = () => setCurrentPage(1);

  const handleExportCSV = () => {
    const rows = usingApi
      ? (apiRows ?? []).map((r) => [r.bank, r.payment_date, r.payment_amount.toFixed(2), r.account, r.touchpoint, r.environment ?? ""])
      : inMemoryFiltered.map((p) => [p.bank, p.paymentDate, p.paymentAmount.toFixed(2), p.account, p.touchpoint, p.environment ?? ""]);
    const csv = [
      ["Bank", "Payment Date", "Payment Amount", "Account", "Touchpoint", "Environment"],
      ...rows,
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transactions");
    sheet.columns = [
      { header: "Bank", key: "bank" },
      { header: "Payment Date", key: "paymentDate" },
      { header: "Payment Amount", key: "paymentAmount" },
      { header: "Account", key: "account" },
      { header: "Touchpoint", key: "touchpoint" },
      { header: "Environment", key: "environment" },
    ];
    const rows = usingApi
      ? (apiRows ?? []).map((r) => ({ bank: r.bank, paymentDate: r.payment_date, paymentAmount: r.payment_amount, account: r.account, touchpoint: r.touchpoint, environment: r.environment ?? "" }))
      : inMemoryFiltered.map((p) => ({ bank: p.bank, paymentDate: p.paymentDate, paymentAmount: p.paymentAmount, account: p.account, touchpoint: p.touchpoint, environment: p.environment ?? "" }));
    sheet.addRows(rows);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── CRUD helpers (in-memory mode only) ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ bank: "", paymentDate: "", paymentAmount: "", account: "", touchpoint: "" });
  const [addForm, setAddForm] = useState({ bank: "", paymentDate: "", paymentAmount: "", account: "", touchpoint: "" });
  const [exportOpen, setExportOpen] = useState(false);

  // Mass delete state
  const [showMassDelete, setShowMassDelete] = useState(false);
  const [massDeleteFrom, setMassDeleteFrom] = useState("");
  const [massDeleteTo, setMassDeleteTo] = useState("");
  const [massDeleteConfirmStep, setMassDeleteConfirmStep] = useState(false);

  const recalcParsedData = useCallback((payments: PaymentRecord[]): ParsedData => {
    const bankMap = new Map<string, { count: Set<string>; amount: number; paymentCount: number }>();
    const tpMap = new Map<string, { count: number; amount: number }>();
    const accountSet = new Set<string>();
    let totalAmount = 0;
    for (const p of payments) {
      totalAmount += p.paymentAmount;
      accountSet.add(p.account);
      const bk = bankMap.get(p.bank) ?? { count: new Set<string>(), amount: 0, paymentCount: 0 };
      bk.count.add(p.account);
      bk.amount += p.paymentAmount;
      bk.paymentCount += 1;
      bankMap.set(p.bank, bk);
      const tp = tpMap.get(p.touchpoint) ?? { count: 0, amount: 0 };
      tp.count += 1;
      tp.amount += p.paymentAmount;
      tpMap.set(p.touchpoint, tp);
    }
    const bankAnalytics = Array.from(bankMap.entries()).map(([bank, v]) => ({
      bank,
      accountCount: v.count.size,
      totalAmount: v.amount,
      debtorSum: 0,
      percentage: totalAmount > 0 ? (v.amount / totalAmount) * 100 : 0,
      paymentCount: v.paymentCount,
    }));
    const touchpointAnalytics = Array.from(tpMap.entries()).map(([touchpoint, v]) => ({
      touchpoint,
      count: v.count,
      totalAmount: v.amount,
      percentage: totalAmount > 0 ? (v.amount / totalAmount) * 100 : 0,
    }));
    return {
      payments,
      bankAnalytics,
      touchpointAnalytics,
      totalAccounts: accountSet.size,
      totalAmount,
      totalPayments: payments.length,
      raw: payments.map((p) => ({ Bank: p.bank, "Payment Date": p.paymentDate, "Payment Amount": p.paymentAmount, Account: p.account, Touchpoint: p.touchpoint })),
    };
  }, []);

  const handleAddTransaction = () => {
    if (!data) return;
    const amount = parseFloat(addForm.paymentAmount);
    if (!addForm.bank || !addForm.paymentDate || isNaN(amount) || amount < 0 || !addForm.account || !addForm.touchpoint) {
      toast.error("Please fill in all fields with valid values. Amount cannot be negative.");
      return;
    }
    const newRecord: PaymentRecord = {
      bank: addForm.bank.toUpperCase(),
      paymentDate: addForm.paymentDate,
      paymentAmount: amount,
      account: addForm.account,
      touchpoint: addForm.touchpoint.toUpperCase(),
    };
    const newPayments = [newRecord, ...data.payments];
    setData(recalcParsedData(newPayments));
    setAddForm({ bank: "", paymentDate: "", paymentAmount: "", account: "", touchpoint: "" });
    setShowAddForm(false);
    toast.success("Transaction added.");
  };

  const handleStartEdit = (globalIdx: number) => {
    if (!data) return;
    const p = data.payments[globalIdx];
    setEditingIndex(globalIdx);
    setEditForm({
      bank: p.bank,
      paymentDate: p.paymentDate,
      paymentAmount: String(p.paymentAmount),
      account: p.account,
      touchpoint: p.touchpoint,
    });
  };

  const handleSaveEdit = () => {
    if (!data || editingIndex === null) return;
    const amount = parseFloat(editForm.paymentAmount);
    if (!editForm.bank || !editForm.paymentDate || isNaN(amount) || amount < 0 || !editForm.account || !editForm.touchpoint) {
      toast.error("Please fill in all fields with valid values. Amount cannot be negative.");
      return;
    }
    const newPayments = [...data.payments];
    newPayments[editingIndex] = {
      bank: editForm.bank.toUpperCase(),
      paymentDate: editForm.paymentDate,
      paymentAmount: amount,
      account: editForm.account,
      touchpoint: editForm.touchpoint.toUpperCase(),
    };
    setData(recalcParsedData(newPayments));
    setEditingIndex(null);
    toast.success("Transaction updated.");
  };

  const handleCancelEdit = () => setEditingIndex(null);

  const handleDelete = (globalIdx: number) => {
    if (!data) return;
    const newPayments = data.payments.filter((_, i) => i !== globalIdx);
    setData(recalcParsedData(newPayments));
    toast.success("Transaction deleted.");
  };

  // Mass delete: count of records in selected date range
  const massDeleteCount = useMemo(() => {
    if (!data || !massDeleteFrom || !massDeleteTo) return 0;
    return data.payments.filter((p) => {
      const d = p.paymentDate;
      return d >= massDeleteFrom && d <= massDeleteTo;
    }).length;
  }, [data, massDeleteFrom, massDeleteTo]);

  const handleMassDelete = () => {
    if (!data || !massDeleteFrom || !massDeleteTo) return;
    const newPayments = data.payments.filter((p) => {
      const d = p.paymentDate;
      return !(d >= massDeleteFrom && d <= massDeleteTo);
    });
    const deleted = data.payments.length - newPayments.length;
    setData(recalcParsedData(newPayments));
    setShowMassDelete(false);
    setMassDeleteConfirmStep(false);
    setMassDeleteFrom("");
    setMassDeleteTo("");
    toast.success(`Deleted ${fmt(deleted)} transactions.`);
  };

  const closeMassDelete = () => {
    setShowMassDelete(false);
    setMassDeleteConfirmStep(false);
    setMassDeleteFrom("");
    setMassDeleteTo("");
  };

  // Map display row index back to global index in data.payments
  const getGlobalIndex = (rowIdx: number): number => {
    if (!data) return -1;
    if (usingApi) {
      // Match by all fields for API rows
      const r = displayRows[rowIdx];
      return data.payments.findIndex(
        (p) => p.bank === r.bank && p.paymentDate === r.paymentDate && p.paymentAmount === r.paymentAmount && p.account === r.account && p.touchpoint === r.touchpoint
      );
    }
    const pageOffset = (currentPage - 1) * rowsPerPage;
    const item = inMemoryFiltered[pageOffset + rowIdx];
    return data.payments.indexOf(item);
  };

  if (!data && !sessionId) {
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen">
        <div className="p-12 rounded-lg text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">
            No Data Available
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please upload an Excel file to view transactions
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
              Transactions
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {fmt(displayTotal)} records &middot; ₱{fmt(displayTotalAmount)} total
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Popover open={exportOpen} onOpenChange={setExportOpen}>
              <PopoverTrigger asChild>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Download className="w-4 h-4 mr-1" />
                  Export
                  <ChevronDown className="w-3 h-3 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-1" align="end">
                <button
                  onClick={() => { handleExportCSV(); setExportOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  Export as CSV
                </button>
                <button
                  onClick={() => { handleExportXLSX(); setExportOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  Export as XLSX
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Date Filter — only shown for in-memory mode */}
        {!usingApi && (
          <div className="mb-4">
            <DateFilter
              value={dateRange}
              onChange={(r, c) => { setDateRange(r); setCustomRange(c); resetPage(); }}
              customRange={customRange}
            />
          </div>
        )}



        {/* Filters */}
        <div className="p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search bank, account, touchpoint..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); }}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              />
            </div>

            <select
              value={bankFilter}
              onChange={(e) => { setBankFilter(e.target.value); resetPage(); }}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="all">All Banks</option>
              {displayBanks.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            <select
              value={tpFilter}
              onChange={(e) => { setTpFilter(e.target.value); resetPage(); }}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="all">All Touchpoints</option>
              {displayTouchpoints.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); resetPage(); }}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="all">All Dates</option>
              {displayDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={envFilter}
              onChange={(e) => { setEnvFilter(e.target.value); resetPage(); }}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            >
              <option value="all">All Environments</option>
              {displayEnvironments.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 overflow-x-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          {apiLoading ? (
            <div className="p-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full mb-2 rounded-md" />
              ))}
            </div>
          ) : (
          <table className="w-full min-w-[850px]">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Bank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Payment Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Account
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Touchpoint
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Environment
                </th>
                {data && (
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-20">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {displayRows.map((p, i) => {
                const globalIdx = data ? getGlobalIndex(i) : -1;
                const isEditing = editingIndex === globalIdx && globalIdx !== -1;
                return (
                <tr
                  key={`${currentPage}-${i}`}
                  className="hover:bg-teal-50 dark:hover:bg-gray-700/60 transition-colors duration-200"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {isEditing ? <Input value={editForm.bank} onChange={(e) => setEditForm({ ...editForm, bank: e.target.value })} className="h-7 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600" /> : p.bank}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {isEditing ? <Input type="date" value={editForm.paymentDate} onChange={(e) => setEditForm({ ...editForm, paymentDate: e.target.value })} className="h-7 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600" /> : p.paymentDate}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                    {isEditing ? <Input type="number" step="0.01" value={editForm.paymentAmount} onChange={(e) => setEditForm({ ...editForm, paymentAmount: e.target.value })} className="h-7 text-xs text-right bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600" /> : `₱${fmt(p.paymentAmount)}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {isEditing ? <Input value={editForm.account} onChange={(e) => setEditForm({ ...editForm, account: e.target.value })} className="h-7 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600" /> : p.account}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {isEditing ? (
                      <Input value={editForm.touchpoint} onChange={(e) => setEditForm({ ...editForm, touchpoint: e.target.value })} className="h-7 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600" />
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300">
                        {p.touchpoint}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {p.environment || "—"}
                  </td>
                  {data && (
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={handleSaveEdit} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400" title="Save">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={handleCancelEdit} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleStartEdit(globalIdx)} className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-500 dark:text-blue-400" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          )}
          {/* Pagination Controls */}
          <div className="px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {fmt((currentPage - 1) * rowsPerPage + 1)}&ndash;{fmt(Math.min(currentPage * rowsPerPage, displayTotal))} of {fmt(displayTotal)} records
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>

              {/* Page number buttons */}
              {(() => {
                const pages: number[] = [];
                let start = Math.max(1, currentPage - 2);
                let end = Math.min(displayTotalPages, start + 4);
                start = Math.max(1, end - 4);
                for (let i = start; i <= end; i++) pages.push(i);
                return pages.map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
                      pg === currentPage
                        ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                        : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200"
                    }`}
                  >
                    {pg}
                  </button>
                ));
              })()}

              <button
                onClick={() => setCurrentPage((p) => Math.min(displayTotalPages, p + 1))}
                disabled={currentPage === displayTotalPages}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(displayTotalPages)}
                disabled={currentPage === displayTotalPages}
                className="px-2.5 py-1.5 text-sm font-medium rounded-md border bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Last
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Add Button */}
      {data && (
        <>
          <button
            onClick={() => setShowMassDelete(true)}
            className="fixed bottom-8 right-24 w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center z-50"
            title="Mass Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center z-50"
            title="Add Transaction"
          >
            <Plus className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Add Transaction Popup */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[3px]" onClick={() => setShowAddForm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Transaction</h3>
              <button onClick={() => setShowAddForm(false)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Bank</Label>
                <Input value={addForm.bank} onChange={(e) => setAddForm({ ...addForm, bank: e.target.value })} placeholder="e.g. ENBD" className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Payment Date</Label>
                <Input type="date" value={addForm.paymentDate} onChange={(e) => setAddForm({ ...addForm, paymentDate: e.target.value })} placeholder="YYYY-MM-DD" className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 uppercase placeholder:normal-case" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Amount</Label>
                <Input type="number" step="0.01" min="0" value={addForm.paymentAmount} onChange={(e) => setAddForm({ ...addForm, paymentAmount: e.target.value })} placeholder="0.00" className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Account</Label>
                <Input value={addForm.account} onChange={(e) => setAddForm({ ...addForm, account: e.target.value })} placeholder="e.g. 1234567" className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Touchpoint</Label>
                <Input value={addForm.touchpoint} onChange={(e) => setAddForm({ ...addForm, touchpoint: e.target.value })} placeholder="e.g. SMS" className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={handleAddTransaction} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white">Add Transaction</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Mass Delete Modal */}
      {showMassDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[3px]" onClick={closeMassDelete}>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Mass Delete</h3>
              </div>
              <button onClick={closeMassDelete} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!massDeleteConfirmStep ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Select a date range to delete all matching transactions.
                </p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-700 dark:text-gray-300">From</Label>
                    <Input
                      type="date"
                      value={massDeleteFrom}
                      onChange={(e) => setMassDeleteFrom(e.target.value)}
                      className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm text-gray-700 dark:text-gray-300">To</Label>
                    <Input
                      type="date"
                      value={massDeleteTo}
                      onChange={(e) => setMassDeleteTo(e.target.value)}
                      className="bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                {massDeleteFrom && massDeleteTo && (
                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {massDeleteCount > 0
                      ? <><span className="text-red-500">{fmt(massDeleteCount)}</span> transaction{massDeleteCount !== 1 ? "s" : ""} will be deleted.</>
                      : "No transactions found in this range."}
                  </p>
                )}

                <div className="flex gap-3 mt-5">
                  <Button
                    onClick={() => setMassDeleteConfirmStep(true)}
                    disabled={!massDeleteFrom || !massDeleteTo || massDeleteCount === 0}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
                  >
                    Delete
                  </Button>
                  <Button variant="outline" onClick={closeMassDelete} className="flex-1">Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Are you sure? This will permanently delete <strong>{fmt(massDeleteCount)}</strong> transaction{massDeleteCount !== 1 ? "s" : ""} from {massDeleteFrom} to {massDeleteTo}. This action cannot be undone.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleMassDelete}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Yes, Delete
                  </Button>
                  <Button variant="outline" onClick={() => setMassDeleteConfirmStep(false)} className="flex-1">Go Back</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
