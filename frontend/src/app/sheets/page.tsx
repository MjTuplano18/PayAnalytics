"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { createAuditLog, getUpload, createTransaction, updateTransaction, deleteTransaction, bulkDeleteTransactions } from "@/lib/api";
// Utility to get unique values from an array
function getUnique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
import { Save, RotateCcw, Plus, Trash2, Waypoints, ChevronDown, Check, Landmark, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { exportToCSV, exportToExcel } from "@/utils/exportUtils";
import { useData } from "@/context/DataContext";
import type { ParsedData, PaymentRecord } from "@/types/data";
import { DateFilter, DateRange, CustomDateRange, filterByDateRange } from "@/components/DateFilter";
import { useQueryClient } from "@tanstack/react-query";

const ROWS_PER_PAGE = 25;

export default function Page() {
  const { data, setData, rawData, setRawData, fileName, sessionId } = useData();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<SheetRow[]>([]);
  // SheetRow type and default empty row
  type SheetRow = PaymentRecord & { id?: string | null };
  const emptyRow: SheetRow = { id: null, bank: "", paymentDate: "", paymentAmount: 0, account: "", touchpoint: "", environment: "" };
  const [search, setSearch] = useState("");
  // multi-select filters
  const [selectedEnvironments, setSelectedEnvironments] = useState<Set<string>>(new Set());
  const [selectedBanks, setSelectedBanks] = useState<Set<string>>(new Set());
  const [selectedTouchpoints, setSelectedTouchpoints] = useState<Set<string>>(new Set());
  // date range filter
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | undefined>(undefined);
  // dropdown open states & refs
  const envDropdownRef = useRef<HTMLDivElement | null>(null);
  const tpDropdownRef = useRef<HTMLDivElement | null>(null);
  const bankDropdownRef = useRef<HTMLDivElement | null>(null);
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const [tpDropdownOpen, setTpDropdownOpen] = useState(false);
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [activeCell, setActiveCell] = useState<{ row: number; col: keyof SheetRow } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Utility to get unique values from an array
  function getUnique<T>(arr: T[]): T[] {
    return Array.from(new Set(arr));
  }

  // Extract unique options for filters
  const touchpointOptions = useMemo(() => getUnique(rows.map((r) => r.touchpoint).filter((v): v is string => Boolean(v))), [rows]);
  const environmentOptions = useMemo(() => getUnique(rows.map((r) => r.environment).filter((v): v is string => Boolean(v))), [rows]);
  const bankOptions = useMemo(() => getUnique(rows.map((r) => r.bank).filter((v): v is string => Boolean(v))), [rows]);

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

  // Column order for the spreadsheet view
  const columnOrder: { key: keyof SheetRow; label: string; inputType?: string }[] = [
    { key: "bank", label: "Bank" },
    { key: "paymentDate", label: "Payment Date" },
    { key: "paymentAmount", label: "Payment Amount", inputType: "number" },
    { key: "account", label: "Account" },
    { key: "touchpoint", label: "Touchpoint" },
    { key: "environment", label: "Environment" },
  ];

  useEffect(() => {
    if (!data?.payments) {
      setRows([]);
      return;
    }
    setRows(
      data.payments.map((p) => ({
        bank: p.bank,
        paymentDate: p.paymentDate,
        paymentAmount: p.paymentAmount,
        account: p.account,
        touchpoint: p.touchpoint,
        environment: p.environment ?? "",
      }))
    );
  }, [data]);

  // When viewing an uploaded session, load authoritative records (including ids) from backend
  useEffect(() => {
    let cancelled = false;
    if (!sessionId || !token) return;
    const load = async () => {
      try {
        const detail = await getUpload(token, sessionId);
        if (cancelled) return;
        const records = detail.records.map((r) => ({
          id: r.id,
          bank: r.bank,
          paymentDate: r.payment_date ?? "",
          paymentAmount: r.payment_amount,
          account: r.account,
          touchpoint: r.touchpoint ?? "",
          environment: r.environment ?? "",
        }));
        setRows(records);
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  // compute date-filtered rows using DateFilter helper
  const dateFilteredSet = useMemo(() => {
    const filtered = filterByDateRange(rows, dateRange, (r) => r.paymentDate, customRange);
    return new Set(filtered);
  }, [rows, dateRange, customRange]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        // Search filter
        if (
          q &&
          ![
            row.bank,
            row.paymentDate,
            row.paymentAmount.toString(),
            row.account,
            row.touchpoint,
            row.environment,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }

        // Date filter
        if (!dateFilteredSet.has(row)) return false;

        // multi-select filters
        if (selectedEnvironments.size > 0 && !selectedEnvironments.has(row.environment ?? "")) return false;
        if (selectedBanks.size > 0 && !selectedBanks.has(row.bank)) return false;
        if (selectedTouchpoints.size > 0 && !selectedTouchpoints.has(row.touchpoint ?? "")) return false;

        return true;
      });
  }, [rows, search, dateFilteredSet, selectedEnvironments, selectedBanks, selectedTouchpoints]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, page]);

  const updateCell = (rowIndex: number, key: keyof SheetRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] };
      const oldVal = String(row[key] ?? "");
      const before = {
        account: row.account,
        bank: row.bank,
        touchpoint: row.touchpoint,
        paymentDate: row.paymentDate,
        paymentAmount: row.paymentAmount,
        environment: row.environment,
      };
      if (key === "paymentAmount") {
        row.paymentAmount = Number.isFinite(Number(value)) ? Number(value) : 0;
      } else {
        row[key] = value;
      }
      next[rowIndex] = row;

      // Persist update to backend when possible
      try {
        const id = row.id;
        if (token && sessionId && id) {
          // perform update and also send an explicit audit entry
          (async () => {
            try {
              const updated = await updateTransaction(token, sessionId, id, {
                bank: row.bank,
                account: row.account,
                touchpoint: row.touchpoint || undefined,
                payment_date: row.paymentDate || undefined,
                payment_amount: row.paymentAmount || 0,
                environment: row.environment || undefined,
              });
              try {
                const snapshot = JSON.stringify({ session_id: sessionId, before, after: { bank: updated.bank, account: updated.account, touchpoint: updated.touchpoint, payment_date: updated.payment_date, payment_amount: updated.payment_amount, environment: updated.environment } });
                await createAuditLog(token, {
                  action: "record_update",
                  file_name: fileName || "uploaded",
                  session_id: sessionId,
                  record_count: 1,
                  details: `Updated record ${id}`,
                  snapshot_data: snapshot,
                });
              } catch {
                // best-effort audit, ignore errors
              }
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
              queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["uploads"] });
              queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
            } catch {
              // ignore
            }
          })();
        } else {
          // Best-effort audit log for cell update (compact snapshot) when not persisted
          if (token) {
            const snapshot = JSON.stringify({
              session_id: sessionId ?? null,
              row_index: rowIndex,
              account: before.account,
              column: String(key),
              old: oldVal,
              new: value,
            });
            createAuditLog(token, {
              action: "record_update",
              file_name: fileName || "local",
              session_id: sessionId ?? null,
              record_count: 1,
              details: `Row ${rowIndex} updated column ${String(key)}`,
              snapshot_data: snapshot,
            }).catch(() => {});
          }
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["uploads"] });
          queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
        }
      } catch {}

      return next;
    });
  };

  // Dropdown helpers
  const toggleEnv = (env: string) =>
    setSelectedEnvironments((prev) => {
      const next = new Set(prev);
      if (next.has(env)) next.delete(env);
      else next.add(env);
      return next;
    });

  const clearEnv = () => setSelectedEnvironments(new Set());

  const toggleTp = (tp: string) =>
    setSelectedTouchpoints((prev) => {
      const next = new Set(prev);
      if (next.has(tp)) next.delete(tp);
      else next.add(tp);
      return next;
    });

  const clearTp = () => setSelectedTouchpoints(new Set());

  const toggleBank = (bank: string) =>
    setSelectedBanks((prev) => {
      const next = new Set(prev);
      if (next.has(bank)) next.delete(bank);
      else next.add(bank);
      return next;
    });

  const clearBank = () => setSelectedBanks(new Set());

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (envDropdownRef.current && !envDropdownRef.current.contains(e.target as Node)) {
        setEnvDropdownOpen(false);
      }
      if (tpDropdownRef.current && !tpDropdownRef.current.contains(e.target as Node)) {
        setTpDropdownOpen(false);
      }
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleSelectedRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const clearSelection = () => setSelectedRows(new Set());

  const deleteSelectedRows = () => {
    if (selectedRows.size === 0) {
      toast.error("Select at least one row to delete.");
      return;
    }
    const deletedCount = selectedRows.size;

    toast(`Delete ${deletedCount} row${deletedCount > 1 ? "s" : ""}?`, {
      description: "This action cannot be undone.",
      position: "bottom-right",
      action: {
        label: "Delete",
        onClick: () => {
          // capture deleted rows for a compact snapshot
          const deletedIndices = Array.from(selectedRows).sort((a, b) => a - b);
          const deletedRows = deletedIndices.map((idx) => rows[idx]).map((r) => ({ bank: r.bank, account: r.account, paymentDate: r.paymentDate, paymentAmount: r.paymentAmount, touchpoint: r.touchpoint, environment: r.environment, id: r.id }));

          // If session is persisted, attempt to delete on backend using bulk endpoint
          (async () => {
            if (token && sessionId) {
              const ids = deletedRows.map((r) => r.id).filter(Boolean) as string[];
              if (ids.length > 0) {
                try {
                  const result = await bulkDeleteTransactions(token, sessionId!, ids);
                  if (result.deleted < ids.length) {
                    toast.error(`${ids.length - result.deleted} record deletions failed on the server.`);
                  }
                } catch (err) {
                  toast.error("Bulk delete failed on server: " + (err instanceof Error ? err.message : String(err)));
                }
              }

              // Remove rows locally instead of refetching all data
              setRows((prev) => prev.filter((_, idx) => !selectedRows.has(idx)));
              clearSelection();
              toast.success("Selected rows deleted.");
              queryClient.invalidateQueries({ queryKey: ["transactions"] });
              queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["uploads"] });
              queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
              return;
            }

            // Fallback: local-only delete and audit log
            setRows((prev) => prev.filter((_, idx) => !selectedRows.has(idx)));
            clearSelection();
            toast.success("Selected rows deleted.");
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["uploads"] });
            queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
            try {
              if (token) {
                createAuditLog(token, {
                  action: "record_bulk_delete",
                  file_name: fileName || "local",
                  session_id: sessionId ?? null,
                  record_count: deletedCount,
                  details: `Deleted ${deletedCount} rows from sheet`,
                  snapshot_data: JSON.stringify({ session_id: sessionId ?? null, deleted: deletedRows }),
                }).catch(() => {});
              }
            } catch {}
          })();
        },
      },
    });
  };

  const addRow = () => {
    // Insert optimistically at the top of the rows array so it appears on the current page
    const tempRow: SheetRow = { ...emptyRow, id: null };
    setRows((prev) => [tempRow, ...prev]);

    if (token && sessionId) {
      // persist in background and update the row with the server-assigned id
      (async () => {
        try {
          const rec = await createTransaction(token, sessionId, {
            bank: emptyRow.bank,
            account: emptyRow.account,
            touchpoint: emptyRow.touchpoint || undefined,
            payment_date: emptyRow.paymentDate || undefined,
            payment_amount: emptyRow.paymentAmount,
            environment: emptyRow.environment || undefined,
          });
          // Replace the temp row (first item) with the persisted one
          setRows((prev) => {
            const copy = [...prev];
            const idx = copy.indexOf(tempRow);
            if (idx !== -1) {
              copy[idx] = {
                id: rec.id,
                bank: rec.bank,
                paymentDate: rec.payment_date ?? "",
                paymentAmount: rec.payment_amount,
                account: rec.account,
                touchpoint: rec.touchpoint ?? "",
                environment: rec.environment ?? "",
              };
            }
            return copy;
          });
          try {
            await createAuditLog(token, {
              action: "record_create",
              file_name: fileName || "uploaded",
              session_id: sessionId,
              record_count: 1,
              details: `Created record ${rec.id}`,
              snapshot_data: JSON.stringify({ session_id: sessionId, record: { id: rec.id, bank: rec.bank, account: rec.account, touchpoint: rec.touchpoint, payment_date: rec.payment_date, payment_amount: rec.payment_amount, environment: rec.environment } }),
            });
          } catch {}
          toast.success("Row added and persisted.");
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["uploads"] });
          queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
        } catch {
          toast.success("Row added (local).");
          try {
            if (token) {
              createAuditLog(token, {
                action: "record_create",
                file_name: fileName || "local",
                session_id: sessionId ?? null,
                record_count: 1,
                details: "Added a new row in the sheet (local)",
              }).catch(() => {});
            }
          } catch {}
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["uploads"] });
          queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
        }
      })();
    } else {
      try {
        if (token) {
          createAuditLog(token, {
            action: "record_create",
            file_name: fileName || "local",
            session_id: sessionId ?? null,
            record_count: 1,
            details: "Added a new row in the sheet",
            snapshot_data: JSON.stringify({ session_id: sessionId ?? null, new: { bank: emptyRow.bank, account: emptyRow.account, touchpoint: emptyRow.touchpoint, paymentDate: emptyRow.paymentDate, paymentAmount: emptyRow.paymentAmount, environment: emptyRow.environment } }),
          }).catch(() => {});
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["unified-audit-log"] });
    }
  };

  const resetRows = () => {
    if (!data?.payments) {
      setRows([]);
      return;
    }
    setRows(
      data.payments.map((p) => ({
        bank: p.bank,
        paymentDate: p.paymentDate,
        paymentAmount: p.paymentAmount,
        account: p.account,
        touchpoint: p.touchpoint,
        environment: p.environment ?? "",
      }))
    );
    toast.success("Sheet reset to current dataset");
    try {
      if (token) {
        const sample = rows.slice(0, 5).map((r) => ({ bank: r.bank, account: r.account, paymentDate: r.paymentDate, paymentAmount: r.paymentAmount, touchpoint: r.touchpoint, environment: r.environment }));
        createAuditLog(token, {
          action: "sheet_reset",
          file_name: fileName || "local",
          session_id: sessionId ?? null,
          record_count: data.payments.length,
          details: "Reset sheet to uploaded dataset",
          snapshot_data: JSON.stringify({ session_id: sessionId ?? null, previous_count: rows.length, sample }),
        }).catch(() => {});
      }
    } catch {}
  };

  const saveChanges = () => {
    const payments: PaymentRecord[] = rows.map((r) => ({
      bank: r.bank.trim(),
      paymentDate: r.paymentDate,
      paymentAmount: Number.isFinite(r.paymentAmount) ? r.paymentAmount : 0,
      account: r.account.trim(),
      touchpoint: (r.touchpoint ?? "").trim(),
      environment: (r.environment ?? "").trim(),
    }));

    const parsed = recalcParsedData(payments);
    setData(parsed);
    setRawData(parsed.raw);

    if (sessionId && token) {
      // Persisted session: refresh authoritative data from backend after edits
      (async () => {
        try {
          const detail = await getUpload(token, sessionId);
          const records = detail.records.map((r) => ({
            id: r.id,
            bank: r.bank,
            paymentDate: r.payment_date ?? "",
            paymentAmount: r.payment_amount,
            account: r.account,
            touchpoint: r.touchpoint ?? "",
            environment: r.environment ?? "",
          }));
          setRows(records);
          setData(recalcParsedData(records.map((r) => ({ bank: r.bank, paymentDate: r.paymentDate, paymentAmount: r.paymentAmount, account: r.account, touchpoint: r.touchpoint, environment: r.environment ?? "" }))));
          setRawData(records.map((r) => ({ Bank: r.bank, "Payment Date": r.paymentDate, "Payment Amount": r.paymentAmount, Account: r.account, Touchpoint: r.touchpoint, Environment: r.environment ?? "" })));
          toast.success("Sheet saved and persisted.");
        } catch {
          toast.success("Sheet saved locally.");
        }
      })();
      return;
    }

    toast.success("Sheet saved.");
    try {
      if (token) {
        const sample = rows.slice(0, 5).map((r) => ({ bank: r.bank, account: r.account, paymentDate: r.paymentDate, paymentAmount: r.paymentAmount, touchpoint: r.touchpoint, environment: r.environment }));
        createAuditLog(token, {
          action: "sheet_edit",
          file_name: fileName || "local",
          session_id: null,
          record_count: rows.length,
          details: "Saved sheet to local dataset",
          snapshot_data: JSON.stringify({ session_id: sessionId ?? null, record_count: rows.length, sample }),
        }).catch(() => {});
      }
    } catch {}
  };

  if (!data || rows.length === 0) {
    return (
      <div className="px-4 sm:px-8 py-8 min-h-screen">
        <div className="p-10 rounded-lg text-center bg-card border border-border">
          <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">Sheets</h1>
          <p className="text-gray-600 dark:text-gray-400">Upload data first to open it as a spreadsheet.</p>
        </div>
      </div>
    );
  }

  const rowStart = filteredRows.length === 0 ? 0 : (page - 1) * ROWS_PER_PAGE + 1;
  const rowEnd = Math.min(page * ROWS_PER_PAGE, filteredRows.length);
  const activeCellValue = activeCell ? String(rows[activeCell.row]?.[activeCell.col] ?? "") : "";
  const visibleRowIndices = pageRows.map((r) => r.index);
  const allVisibleSelected =
    visibleRowIndices.length > 0 && visibleRowIndices.every((idx) => selectedRows.has(idx));

  const toggleSelectAllVisible = () => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleRowIndices.forEach((idx) => next.delete(idx));
      } else {
        visibleRowIndices.forEach((idx) => next.add(idx));
      }
      return next;
    });
  };

  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-gray-900 dark:text-white">Sheets</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Edit your current records in a spreadsheet-style grid.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button className="gap-2 bg-[#4a55d1] hover:bg-[#4048c0] text-white">
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button
                onClick={async () => {
                  const dataForExport = sessionId && token ? await (async () => {
                    try {
                      const first = await getUpload(token, sessionId);
                      const rowsAll = first.records.map((r) => ({ Bank: r.bank, "Payment Date": r.payment_date ?? "", "Payment Amount": r.payment_amount, Account: r.account, Touchpoint: r.touchpoint ?? "", Environment: r.environment ?? "" }));
                      await exportToExcel(rowsAll, `sheet_export_${new Date().toISOString().split("T")[0]}`);
                      toast.success(`Exported ${rowsAll.length} records to Excel`);
                    } catch {
                      toast.error("Export failed");
                    }
                  })() : (async () => {
                    const rowsData = rows.map((r) => ({ Bank: r.bank, "Payment Date": r.paymentDate, "Payment Amount": r.paymentAmount, Account: r.account, Touchpoint: r.touchpoint ?? "", Environment: r.environment ?? "" }));
                    await exportToExcel(rowsData, `sheet_export_${new Date().toISOString().split("T")[0]}`);
                    toast.success(`Exported ${rowsData.length} records to Excel`);
                  })();
                }}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                Export as XLSX
              </button>
              <button
                onClick={async () => {
                  if (sessionId && token) {
                    try {
                      const detail = await getUpload(token, sessionId);
                      const rowsAll = detail.records.map((r) => ({ Bank: r.bank, "Payment Date": r.payment_date ?? "", "Payment Amount": r.payment_amount, Account: r.account, Touchpoint: r.touchpoint ?? "", Environment: r.environment ?? "" }));
                      exportToCSV(rowsAll, `sheet_export_${new Date().toISOString().split("T")[0]}`);
                      toast.success(`Exported ${rowsAll.length} records to CSV`);
                    } catch {
                      toast.error("Export failed");
                    }
                  } else {
                    const rowsData = rows.map((r) => ({ Bank: r.bank, "Payment Date": r.paymentDate, "Payment Amount": r.paymentAmount, Account: r.account, Touchpoint: r.touchpoint ?? "", Environment: r.environment ?? "" }));
                    exportToCSV(rowsData, `sheet_export_${new Date().toISOString().split("T")[0]}`);
                    toast.success(`Exported ${rowsData.length} records to CSV`);
                  }
                }}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                Export as CSV
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search rows..."
            className="w-[420px] rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Environments multi-select */}
          <div ref={envDropdownRef} className="relative">
            <button
              onClick={() => setEnvDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
            >
              <Landmark className="h-4 w-4" />
              {selectedEnvironments.size === 0 ? "All Environments" : `${selectedEnvironments.size} selected`}
              <ChevronDown className={`h-4 w-4 transition-transform ${envDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {envDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                {selectedEnvironments.size > 0 && (
                  <button onClick={clearEnv} className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] hover:bg-muted/50 dark:hover:bg-muted border-b border-gray-200 dark:border-gray-700">Clear selection</button>
                )}
                {environmentOptions.map((env) => (
                  <button key={env} onClick={() => toggleEnv(env)} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted">
                    <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${selectedEnvironments.has(env) ? "bg-[#5B66E2] border-[#5B66E2]" : "border-gray-300 dark:border-gray-600"}`}>
                      {selectedEnvironments.has(env) && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {env}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Banks multi-select */}
          <div ref={bankDropdownRef} className="relative">
            <button
              onClick={() => setBankDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
            >
              <Landmark className="h-4 w-4" />
              {selectedBanks.size === 0 ? "All Banks" : `${selectedBanks.size} selected`}
              <ChevronDown className={`h-4 w-4 transition-transform ${bankDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {bankDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                {selectedBanks.size > 0 && (
                  <button onClick={clearBank} className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] hover:bg-muted/50 dark:hover:bg-muted border-b border-gray-200 dark:border-gray-700">Clear selection</button>
                )}
                {bankOptions.map((b) => (
                  <button key={b} onClick={() => toggleBank(b)} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted">
                    <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${selectedBanks.has(b) ? "bg-[#5B66E2] border-[#5B66E2]" : "border-gray-300 dark:border-gray-600"}`}>
                      {selectedBanks.has(b) && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Touchpoints multi-select */}
          <div ref={tpDropdownRef} className="relative">
            <button
              onClick={() => setTpDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted transition-colors"
            >
              <Waypoints className="h-4 w-4" />
              {selectedTouchpoints.size === 0 ? "All Touchpoints" : `${selectedTouchpoints.size} selected`}
              <ChevronDown className={`h-4 w-4 transition-transform ${tpDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {tpDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                {selectedTouchpoints.size > 0 && (
                  <button onClick={clearTp} className="w-full px-3 py-2 text-left text-xs text-[#5B66E2] hover:bg-muted/50 dark:hover:bg-muted border-b border-gray-200 dark:border-gray-700">Clear selection</button>
                )}
                {touchpointOptions.map((tp) => (
                  <button key={tp} onClick={() => toggleTp(tp)} className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-muted/50 dark:hover:bg-muted">
                    <span className={`flex items-center justify-center h-4 w-4 mr-2 rounded border ${selectedTouchpoints.has(tp) ? "bg-[#5B66E2] border-[#5B66E2]" : "border-gray-300 dark:border-gray-600"}`}>
                      {selectedTouchpoints.has(tp) && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {tp}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date filter (keeps DateFilter look) */}
          <DateFilter value={dateRange} onChange={(r, c) => { setDateRange(r); setCustomRange(c); }} customRange={customRange} />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-[#f5f6f8] dark:bg-[#0f141a]">
        <div className="border-b border-border bg-white dark:bg-[#131a23] px-3 py-2 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-3">
          <span className="rounded bg-[#eaf2ff] dark:bg-[#1f2f4a] px-2 py-1 font-medium text-[#2f5bb7] dark:text-[#9bb9ff]">Sheet1</span>
          <span className="text-gray-400">|</span>
          <span className="font-medium">fx</span>
          <span className="truncate">{activeCellValue || "Select a cell to edit its value"}</span>
          {selectedRows.size > 0 && (
            <span className="font-medium text-gray-600 dark:text-gray-300">Selected Rows: {selectedRows.size}</span>
          )}
          <span className="flex-1" />
          {selectedRows.size > 0 && (
            <button onClick={deleteSelectedRows} className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-semibold cursor-pointer">
              Delete
            </button>
          )}
          <button onClick={addRow} className="text-sm text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white font-semibold cursor-pointer">
            + Add Row
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1080px] text-sm border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#eef1f5] dark:bg-[#1a2431] border-b border-border">
                <th className="px-2 py-2 w-16 text-center text-xs font-semibold text-gray-500 dark:text-gray-300 border-r border-border" />
                <th className="px-2 py-2 w-12 text-center text-xs font-semibold text-gray-500 dark:text-gray-300 border-r border-border" />
                {columnOrder.map((_, idx) => (
                  <th
                    key={`letter-${idx}`}
                    className="px-3 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-200 border-r border-border"
                  >
                    {String.fromCharCode(65 + idx)}
                  </th>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[#131a23] border-b border-border">
                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-300 border-r border-border">#</th>
                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-300 border-r border-border">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                  />
                </th>
                {columnOrder.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 border-r border-border">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ row, index: globalIndex }, pageIdx) => {
                const displayIndex = (page - 1) * ROWS_PER_PAGE + pageIdx + 1;
                return (
                  <tr key={globalIndex} className="border-b border-border bg-white dark:bg-[#0f141a]">
                    <td className="px-2 py-1 text-center text-xs text-gray-500 dark:text-gray-300 bg-[#f6f7f9] dark:bg-[#151d27] border-r border-border">
                      {displayIndex}
                    </td>
                    <td className="px-2 py-1 text-center border-r border-border bg-[#f6f7f9] dark:bg-[#151d27]">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(globalIndex)}
                        onChange={() => toggleSelectedRow(globalIndex)}
                      />
                    </td>
                    {columnOrder.map((col) => {
                      const selected = activeCell?.row === globalIndex && activeCell.col === col.key;
                      return (
                        <td key={`${globalIndex}-${col.key}`} className="p-0 border-r border-border align-top">
                          {col.key === "touchpoint" ? (
                            <select
                              value={row.touchpoint ?? ""}
                              onFocus={() => setActiveCell({ row: globalIndex, col: col.key })}
                              onChange={e => updateCell(globalIndex, col.key as keyof SheetRow, e.target.value)}
                              className={`w-full px-2 py-1.5 bg-transparent outline-none ${selected ? "ring-2 ring-[#4a55d1] ring-inset" : ""} border-none appearance-none`}
                              style={{ minWidth: 120 }}
                            >
                              <option value="">-- Select --</option>
                              {touchpointOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : col.key === "environment" ? (
                            <select
                              value={row.environment ?? ""}
                              onFocus={() => setActiveCell({ row: globalIndex, col: col.key })}
                              onChange={e => updateCell(globalIndex, col.key as keyof SheetRow, e.target.value)}
                              className={`w-full px-2 py-1.5 bg-transparent outline-none ${selected ? "ring-2 ring-[#4a55d1] ring-inset" : ""} border-none appearance-none`}
                              style={{ minWidth: 120 }}
                            >
                              <option value="">-- Select --</option>
                              {environmentOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={col.inputType ?? "text"}
                              value={String(row[col.key as keyof SheetRow] ?? "")}
                              onFocus={() => setActiveCell({ row: globalIndex, col: col.key })}
                              onChange={(e) => updateCell(globalIndex, col.key as keyof SheetRow, e.target.value)}
                              className={`w-full px-2 py-1.5 bg-transparent outline-none ${selected ? "ring-2 ring-[#4a55d1] ring-inset" : ""}`}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <p className="text-xs text-gray-500 dark:text-gray-400 mr-3 whitespace-nowrap">Showing {rowStart}-{rowEnd} of {filteredRows.length}</p>
        <nav className="flex gap-1 mr-4">
          <button
            className={`px-3 py-1 rounded border text-sm ${page === 1 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            onClick={() => setPage(1)}
            disabled={page === 1}
          >
            First
          </button>
          <button
            className={`px-3 py-1 rounded border text-sm ${page === 1 ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map((p) => (
            <button
              key={p}
              className={`px-3 py-1 rounded border text-sm ${p === page ? 'bg-[#4a55d1] text-white border-[#4a55d1]' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              onClick={() => setPage(p)}
              disabled={p === page}
            >
              {p}
            </button>
          ))}
          <button
            className={`px-3 py-1 rounded border text-sm ${page === totalPages ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
          >
            Next
          </button>
          <button
            className={`px-3 py-1 rounded border text-sm ${page === totalPages ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
          >
            Last
          </button>
        </nav>
      </div>
    </div>
  );
}
