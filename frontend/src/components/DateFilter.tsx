"use client";

import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { type DateRange as DayPickerRange } from "react-day-picker";
import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DateRange = "today" | "week" | "month" | "year" | "all" | "custom";

export interface CustomDateRange {
  from: Date;
  to: Date;
}

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
  const [selected, setSelected] = useState<DayPickerRange | undefined>(
    customRange ? { from: customRange.from, to: customRange.to } : undefined
  );

  useEffect(() => {
    if (calendarOpen) {
      setSelected(customRange ? { from: customRange.from, to: customRange.to } : undefined);
    }
  }, [calendarOpen]);

  const handleDayPickerSelect = (range: DayPickerRange | undefined) => {
    setSelected(range);
    if (range?.from && range?.to) {
      onChange("custom", { from: range.from, to: range.to });
      setCalendarOpen(false);
    }
  };

  const handleSelectChange = (val: string) => {
    if (val === "custom") {
      setCalendarOpen(true);
    } else {
      setSelected(undefined);
      onChange(val as DateRange);
    }
  };

  const displayLabel =
    value === "custom" && customRange
      ? `${customRange.from.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${customRange.to.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
      : undefined;

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-500 dark:text-gray-400 hidden sm:block" />

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <div>
            <Select value={value} onValueChange={handleSelectChange}>
              <SelectTrigger className="h-8 w-auto min-w-[140px] gap-1.5 rounded-full border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 focus:ring-teal-500 data-[state=open]:ring-teal-500">
                <SelectValue>
                  {displayLabel ?? options.find((o) => o.value === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <ShadcnCalendar
            mode="range"
            selected={selected}
            onSelect={handleDayPickerSelect}
            numberOfMonths={2}
            captionLayout="dropdown"
            className="[--rdp-accent-color:#14b8a6] [--rdp-accent-background-color:#ccfbf1] dark:[--rdp-accent-background-color:rgba(20,184,166,0.25)]"
          />
          {selected?.from && !selected?.to && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 pb-2">
              Select end date
            </p>
          )}
        </PopoverContent>
      </Popover>
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
