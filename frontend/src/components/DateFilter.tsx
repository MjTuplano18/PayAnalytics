"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { DayPicker, type DateRange as DayPickerRange } from "react-day-picker";
import "react-day-picker/style.css";

export type DateRange = "today" | "week" | "month" | "year" | "all" | "custom";

export interface CustomDateRange {
  from: Date;
  to: Date;
}

const presets: { value: Exclude<DateRange, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

interface DateFilterProps {
  value: DateRange;
  onChange: (range: DateRange, custom?: CustomDateRange) => void;
  customRange?: CustomDateRange;
}

export function DateFilter({ value, onChange, customRange }: DateFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selected, setSelected] = useState<DayPickerRange | undefined>(
    customRange ? { from: customRange.from, to: customRange.to } : undefined
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close calendar on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleDayPickerSelect = (range: DayPickerRange | undefined) => {
    setSelected(range);
    if (range?.from && range?.to) {
      onChange("custom", { from: range.from, to: range.to });
      setCalendarOpen(false);
    }
  };

  const customLabel =
    value === "custom" && customRange
      ? `${customRange.from.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${customRange.to.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
      : "Custom Range";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400 hidden sm:block" />

      {/* Preset buttons */}
      {presets.map((opt) => (
        <button
          key={opt.value}
          onClick={() => {
            setSelected(undefined);
            onChange(opt.value);
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
            value === opt.value
              ? "bg-teal-600 text-white border-teal-600 shadow-sm"
              : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200"
          }`}
        >
          {opt.label}
        </button>
      ))}

      {/* Calendar picker */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setCalendarOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
            value === "custom"
              ? "bg-teal-600 text-white border-teal-600 shadow-sm"
              : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-700 dark:hover:bg-teal-900/40 dark:hover:border-teal-500 dark:hover:text-teal-200"
          }`}
        >
          <Calendar className="w-3 h-3" />
          <span>{customLabel}</span>
          {value === "custom" ? (
            <X
              className="w-3 h-3 ml-0.5 hover:opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                setSelected(undefined);
                onChange("all");
              }}
            />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {calendarOpen && (
          <div className="absolute top-full mt-2 left-0 z-50 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-3">
            <style>{`
              .rdp-root {
                --rdp-accent-color: #14b8a6;
                --rdp-accent-background-color: #ccfbf1;
                --rdp-day-height: 34px;
                --rdp-day-width: 34px;
                font-size: 13px;
              }
              .dark .rdp-root {
                --rdp-accent-color: #14b8a6;
                --rdp-accent-background-color: rgba(20,184,166,0.25);
                color: #e5e7eb;
                background: transparent;
              }
            `}</style>
            <DayPicker
              mode="range"
              selected={selected}
              onSelect={handleDayPickerSelect}
              numberOfMonths={2}
              captionLayout="dropdown"
            />
            {selected?.from && !selected?.to && (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1">
                Select end date
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Filter an array of records by a date field string (YYYY-MM-DD) */
export function filterByDateRange<T>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string,
  custom?: CustomDateRange
): T[] {
  if (range === "all") return items;

  if (range === "custom" && custom) {
    const start = new Date(custom.from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(custom.to);
    end.setHours(23, 59, 59, 999);
    return items.filter((item) => {
      const d = new Date(getDate(item));
      return !isNaN(d.getTime()) && d >= start && d <= end;
    });
  }

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
