"use client";

import { useState, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DateRange = "today" | "week" | "month" | "year" | "all" | "custom";

export interface CustomDateRange {
  from: Date;
  to: Date;
}

type SelectionMode = "date" | "month" | "year";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_FULL_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const options: { value: DateRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

interface DateFilterProps {
  value: DateRange;
  onChange: (range: DateRange, custom?: CustomDateRange) => void;
  customRange?: CustomDateRange;
}

export function DateFilter({ value, onChange, customRange }: DateFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("date");
  const [fromDate, setFromDate] = useState<Date | undefined>(customRange?.from);
  const [toDate, setToDate] = useState<Date | undefined>(customRange?.to);
  const [fromMonth, setFromMonth] = useState<Date>(
    customRange?.from ?? new Date()
  );
  const [toMonth, setToMonth] = useState<Date>(
    customRange?.to ?? new Date()
  );
  const [browseYear, setBrowseYear] = useState(new Date().getFullYear());
  const [yearPageStart, setYearPageStart] = useState(
    Math.floor(new Date().getFullYear() / 12) * 12
  );

  useEffect(() => {
    if (calendarOpen) {
      // Reset to allow fresh selection each time the popover opens
      setFromDate(undefined);
      setToDate(undefined);
      setFromMonth(customRange?.from ?? new Date());
      setToMonth(customRange?.to ?? new Date());
      setBrowseYear(new Date().getFullYear());
      setYearPageStart(Math.floor(new Date().getFullYear() / 12) * 12);
    }
  }, [calendarOpen]);

  const handleFromSelect = (day: Date | undefined) => {
    setFromDate(day);
    // Never auto-close on From selection — wait for To
  };

  const handleToSelect = (day: Date | undefined) => {
    setToDate(day);
    if (fromDate && day && fromDate <= day) {
      onChange("custom", { from: fromDate, to: day });
      setCalendarOpen(false);
    }
  };

  const handleMonthSelect = (monthIndex: number) => {
    const from = new Date(browseYear, monthIndex, 1);
    const to = new Date(browseYear, monthIndex + 1, 0); // last day of month
    onChange("custom", { from, to });
    setCalendarOpen(false);
  };

  const handleYearSelect = (yr: number) => {
    const from = new Date(yr, 0, 1);
    const to = new Date(yr, 11, 31);
    onChange("custom", { from, to });
    setCalendarOpen(false);
  };

  const handleSelectChange = (val: string) => {
    if (val === "custom") {
      setCalendarOpen(true);
    } else {
      setFromDate(undefined);
      setToDate(undefined);
      setCalendarOpen(false);
      onChange(val as DateRange);
    }
  };

  const formatDisplayLabel = () => {
    if (value !== "custom" || !customRange) return undefined;
    const from = customRange.from;
    const to = customRange.to;
    // Check if it's a full year selection
    if (
      from.getMonth() === 0 && from.getDate() === 1 &&
      to.getMonth() === 11 && to.getDate() === 31 &&
      from.getFullYear() === to.getFullYear()
    ) {
      return `${from.getFullYear()}`;
    }
    // Check if it's a full month selection
    const lastDayOfMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    if (
      from.getDate() === 1 &&
      to.getDate() === lastDayOfMonth &&
      from.getMonth() === to.getMonth() &&
      from.getFullYear() === to.getFullYear()
    ) {
      return `${MONTH_FULL_NAMES[from.getMonth()]} ${from.getFullYear()}`;
    }
    // Default date range display
    return `${from.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  };

  const displayLabel = formatDisplayLabel();

  return (
    <div className="flex items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <div>
            <Select
              value={value}
              onValueChange={handleSelectChange}
            >
                <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5 rounded-full border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 focus:ring-[#5B66E2] data-[state=open]:ring-[#5B66E2]">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <SelectValue>
                      {displayLabel ?? options.find((o) => o.value === value)?.label}
                    </SelectValue>
                  </div>
                </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs"
                    onPointerUp={
                      opt.value === "custom"
                        ? () => setCalendarOpen(true)
                        : undefined
                    }
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3 pb-0">
            <Tabs
              value={selectionMode}
              onValueChange={(v) => setSelectionMode(v as SelectionMode)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="date" className="text-xs flex-1">Date Range</TabsTrigger>
                <TabsTrigger value="month" className="text-xs flex-1">Month</TabsTrigger>
                <TabsTrigger value="year" className="text-xs flex-1">Year</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {selectionMode === "date" && (
            <div className="flex gap-0 divide-x divide-gray-200 dark:divide-gray-600">
              <div className="flex flex-col">
                <p className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 pt-2">
                  From
                </p>
                <ShadcnCalendar
                  mode="single"
                  selected={fromDate}
                  onSelect={handleFromSelect}
                  month={fromMonth}
                  onMonthChange={setFromMonth}
                  captionLayout="dropdown"
                  today={undefined as unknown as Date}
                  className="[--rdp-accent-color:#14b8a6] [--rdp-accent-background-color:#ccfbf1] dark:[--rdp-accent-background-color:rgba(20,184,166,0.25)] [&_[data-today=true]]:bg-transparent [&_[data-today=true]]:text-inherit [&_[data-today=true]]:font-normal"
                />
              </div>
              <div className="flex flex-col">
                <p className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 pt-2">
                  To
                </p>
                <ShadcnCalendar
                  mode="single"
                  selected={toDate}
                  onSelect={handleToSelect}
                  month={toMonth}
                  onMonthChange={setToMonth}
                  captionLayout="dropdown"
                  today={undefined as unknown as Date}
                  className="[--rdp-accent-color:#14b8a6] [--rdp-accent-background-color:#ccfbf1] dark:[--rdp-accent-background-color:rgba(20,184,166,0.25)] [&_[data-today=true]]:bg-transparent [&_[data-today=true]]:text-inherit [&_[data-today=true]]:font-normal"
                />
              </div>
            </div>
          )}
          {selectionMode === "date" && fromDate && !toDate && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 pb-2">
              Now select an end date
            </p>
          )}
          {selectionMode === "date" && !fromDate && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 pb-2">
              Select a start date
            </p>
          )}

          {selectionMode === "month" && (
            <div className="p-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setBrowseYear((y) => y - 1)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold">{browseYear}</span>
                <button
                  type="button"
                  onClick={() => setBrowseYear((y) => y + 1)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTH_NAMES.map((name, i) => {
                  const isSelected =
                    value === "custom" &&
                    customRange &&
                    customRange.from.getFullYear() === browseYear &&
                    customRange.from.getMonth() === i &&
                    customRange.from.getDate() === 1 &&
                    customRange.to.getDate() === new Date(browseYear, i + 1, 0).getDate();
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleMonthSelect(i)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-teal-500 text-white"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectionMode === "year" && (
            <div className="p-3 pt-2">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setYearPageStart((y) => y - 12)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold">
                  {yearPageStart} – {yearPageStart + 11}
                </span>
                <button
                  type="button"
                  onClick={() => setYearPageStart((y) => y + 12)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((yr) => {
                  const isSelected =
                    value === "custom" &&
                    customRange &&
                    customRange.from.getFullYear() === yr &&
                    customRange.from.getMonth() === 0 &&
                    customRange.from.getDate() === 1 &&
                    customRange.to.getMonth() === 11 &&
                    customRange.to.getDate() === 31;
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => handleYearSelect(yr)}
                      className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-teal-500 text-white"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {yr}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Format a local Date as YYYY-MM-DD string (timezone-safe) */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    const startStr = toLocalDateStr(custom.from);
    const endStr = toLocalDateStr(custom.to);
    return items.filter((item) => {
      const d = getDate(item);
      return d >= startStr && d <= endStr;
    });
  }

  const now = new Date();
  const todayStr = toLocalDateStr(now);

  let startStr: string;
  switch (range) {
    case "today":
      startStr = todayStr;
      break;
    case "week": {
      const day = now.getDay();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      startStr = toLocalDateStr(weekStart);
      break;
    }
    case "month":
      startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      break;
    case "year":
      startStr = `${now.getFullYear()}-01-01`;
      break;
    default:
      return items;
  }

  return items.filter((item) => {
    const d = getDate(item);
    return d >= startStr && d <= todayStr;
  });
}

/** Convert a DateRange + optional custom bounds into { date_from, date_to } strings for API calls */
export function dateRangeToBounds(
  range: DateRange,
  custom?: CustomDateRange
): { date_from?: string; date_to?: string } {
  if (range === "all") return {};

  if (range === "custom" && custom) {
    return {
      date_from: toLocalDateStr(custom.from),
      date_to: toLocalDateStr(custom.to),
    };
  }

  const now = new Date();
  const todayStr = toLocalDateStr(now);

  let startStr: string;
  switch (range) {
    case "today":
      startStr = todayStr;
      break;
    case "week": {
      const day = now.getDay();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      startStr = toLocalDateStr(weekStart);
      break;
    }
    case "month":
      startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      break;
    case "year":
      startStr = `${now.getFullYear()}-01-01`;
      break;
    default:
      return {};
  }

  return { date_from: startStr, date_to: todayStr };
}
