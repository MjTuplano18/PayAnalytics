"use client";

import { Calendar } from "lucide-react";

export type DateRange = "today" | "week" | "month" | "year" | "all";

const options: { value: DateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

interface DateFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateFilter({ value, onChange }: DateFilterProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400 hidden sm:block" />
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
            value === opt.value
              ? "bg-purple-600 text-white border-purple-600 shadow-sm"
              : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 dark:hover:bg-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Filter an array of records by a date field string (YYYY-MM-DD) */
export function filterByDateRange<T>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string
): T[] {
  if (range === "all") return items;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start: Date;
  switch (range) {
    case "today":
      start = today;
      break;
    case "week": {
      const day = today.getDay();
      start = new Date(today);
      start.setDate(today.getDate() - day);
      break;
    }
    case "month":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "year":
      start = new Date(today.getFullYear(), 0, 1);
      break;
    default:
      return items;
  }

  return items.filter((item) => {
    const d = new Date(getDate(item));
    return !isNaN(d.getTime()) && d >= start;
  });
}
