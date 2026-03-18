"use client";

import { useState, useMemo } from "react";
import { Plus, X, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentRecord } from "@/types/data";

export interface CalculatedField {
  id: string;
  name: string;
  formula: FormulaType;
  groupBy: GroupByKey;
}

type FormulaType =
  | "sum_amount"
  | "avg_amount"
  | "count"
  | "unique_accounts"
  | "max_amount"
  | "min_amount"
  | "median_amount"
  | "amount_per_account";

type GroupByKey = "bank" | "touchpoint" | "month" | "overall";

const FORMULAS: { value: FormulaType; label: string }[] = [
  { value: "sum_amount", label: "Sum of Amount" },
  { value: "avg_amount", label: "Average Amount" },
  { value: "count", label: "Transaction Count" },
  { value: "unique_accounts", label: "Unique Accounts" },
  { value: "max_amount", label: "Max Amount" },
  { value: "min_amount", label: "Min Amount" },
  { value: "median_amount", label: "Median Amount" },
  { value: "amount_per_account", label: "Amount per Account" },
];

const GROUP_BY: { value: GroupByKey; label: string }[] = [
  { value: "overall", label: "Overall" },
  { value: "bank", label: "By Bank" },
  { value: "touchpoint", label: "By Touchpoint" },
  { value: "month", label: "By Month" },
];

function computeFormula(records: PaymentRecord[], formula: FormulaType): number {
  if (records.length === 0) return 0;
  const amounts = records.map((r) => r.paymentAmount);
  switch (formula) {
    case "sum_amount":
      return amounts.reduce((s, v) => s + v, 0);
    case "avg_amount":
      return amounts.reduce((s, v) => s + v, 0) / amounts.length;
    case "count":
      return records.length;
    case "unique_accounts":
      return new Set(records.map((r) => r.account)).size;
    case "max_amount":
      return Math.max(...amounts);
    case "min_amount":
      return Math.min(...amounts);
    case "median_amount": {
      const sorted = [...amounts].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case "amount_per_account": {
      const uniqueAccounts = new Set(records.map((r) => r.account)).size;
      return uniqueAccounts > 0 ? amounts.reduce((s, v) => s + v, 0) / uniqueAccounts : 0;
    }
  }
}

function groupRecords(payments: PaymentRecord[], groupBy: GroupByKey): Map<string, PaymentRecord[]> {
  if (groupBy === "overall") return new Map([["Total", payments]]);
  const map = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    let key: string;
    switch (groupBy) {
      case "bank": key = p.bank; break;
      case "touchpoint": key = p.touchpoint || "NO TOUCHPOINT"; break;
      case "month": key = p.paymentDate.slice(0, 7) || "Unknown"; break;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return map;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${Math.round(n).toLocaleString()}`;
}

function fmtPlain(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

interface CustomCalculatedFieldsProps {
  payments: PaymentRecord[];
}

export function CustomCalculatedFields({ payments }: CustomCalculatedFieldsProps) {
  const [fields, setFields] = useState<CalculatedField[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormula, setNewFormula] = useState<FormulaType>("sum_amount");
  const [newGroupBy, setNewGroupBy] = useState<GroupByKey>("bank");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const addField = () => {
    if (!newName.trim()) return;
    const field: CalculatedField = {
      id: `cf-${Date.now()}`,
      name: newName.trim(),
      formula: newFormula,
      groupBy: newGroupBy,
    };
    setFields([...fields, field]);
    setNewName("");
    setShowAdd(false);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };

  const toggleCollapse = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsed(next);
  };

  const results = useMemo(() => {
    return fields.map((field) => {
      const groups = groupRecords(payments, field.groupBy);
      const entries = Array.from(groups.entries())
        .map(([key, records]) => ({
          key,
          value: computeFormula(records, field.formula),
        }))
        .sort((a, b) => b.value - a.value);
      return { field, entries };
    });
  }, [fields, payments]);

  if (payments.length === 0) return null;

  const isCountFormula = (f: FormulaType) => f === "count" || f === "unique_accounts";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden animate-fade-in-up">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-[#5B66E2]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Custom Metrics</h3>
        </div>
        <Button
          onClick={() => setShowAdd(!showAdd)}
          className="h-7 px-3 text-xs bg-[#4a55d1] hover:bg-[#4048c0] text-white gap-1"
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>

      {/* Add New Field Form */}
      {showAdd && (
        <div className="px-4 py-3 bg-muted border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-gray-500 mb-1 block">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Avg Payment per Bank"
                className="w-full h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Formula</label>
              <select
                value={newFormula}
                onChange={(e) => setNewFormula(e.target.value as FormulaType)}
                className="h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {FORMULAS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Group By</label>
              <select
                value={newGroupBy}
                onChange={(e) => setNewGroupBy(e.target.value as GroupByKey)}
                className="h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {GROUP_BY.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <Button onClick={addField} disabled={!newName.trim()} className="h-8 px-4 text-xs bg-[#4a55d1] hover:bg-[#4048c0] text-white">
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No custom metrics defined yet. Click <strong>Add</strong> to create one.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {results.map(({ field, entries }) => {
            const isCollapsed = collapsed.has(field.id);
            return (
              <div key={field.id}>
                <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted/30">
                  <button onClick={() => toggleCollapse(field.id)} className="p-0.5">
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                  </button>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{field.name}</span>
                  <span className="text-xs text-gray-400 mr-2">
                    {FORMULAS.find((f) => f.value === field.formula)?.label} / {GROUP_BY.find((g) => g.value === field.groupBy)?.label}
                  </span>
                  <button onClick={() => removeField(field.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                    <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="px-4 pb-3">
                    <div className="rounded border border-gray-200 dark:border-gray-700 overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-gray-500 dark:text-gray-400">
                              {field.groupBy === "overall" ? "" : field.groupBy.charAt(0).toUpperCase() + field.groupBy.slice(1)}
                            </th>
                            <th className="px-3 py-1.5 text-right text-gray-500 dark:text-gray-400">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {entries.slice(0, 25).map((e) => (
                            <tr key={e.key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-3 py-1 text-gray-700 dark:text-gray-300">{e.key}</td>
                              <td className="px-3 py-1 text-right font-medium text-gray-900 dark:text-white">
                                {isCountFormula(field.formula) ? fmtPlain(e.value) : fmt(e.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
