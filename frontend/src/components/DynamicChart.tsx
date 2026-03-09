"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartType } from "@/types/data";

interface DynamicChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  type: ChartType;
  dataKey: string;
  xAxisKey: string;
  height?: number;
  title?: string;
}

const COLORS = [
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#e11d48",
];

/** Truncate long labels for chart axes/legends */
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Format number with commas */
function fmtNum(value: number): string {
  return value.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

export function DynamicChart({
  data,
  type,
  dataKey,
  xAxisKey,
  height = 350,
  title,
}: DynamicChartProps) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((item, index) => ({
      ...item,
      _shortName: truncate(String(item[xAxisKey] ?? ""), 14),
      _uniqueId: `${xAxisKey}-${item[xAxisKey]}-${index}`,
    }));
  }, [data, xAxisKey]);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    color: "var(--foreground)",
    borderRadius: "8px",
    fontSize: "13px",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatTooltipValue = (value: any) => {
    const num = Number(value);
    return `₱${fmtNum(isNaN(num) ? 0 : num)}`;
  };

  const renderChart = () => {
    switch (type) {
      case "bar":
        return (
          <BarChart data={processedData} margin={{ bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="_shortName"
              className="text-muted-foreground"
              tick={{ fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={70}
            />
            <YAxis
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
              tickFormatter={fmtNum}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue} />
            <Bar dataKey={dataKey} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case "line":
        return (
          <LineChart data={processedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey={xAxisKey}
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
              tickFormatter={fmtNum}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue} />
            <Legend />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: "#8b5cf6", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        );
      case "area":
        return (
          <AreaChart data={processedData}>
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey={xAxisKey}
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
              tickFormatter={fmtNum}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue} />
            <Legend />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="#8b5cf6"
              fill="url(#colorGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={processedData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percent }: { percent?: number }) =>
                `${((percent ?? 0) * 100).toFixed(1)}%`
              }
              outerRadius={Math.min(height / 3, 120)}
              fill="#8884d8"
              dataKey={dataKey}
              nameKey={xAxisKey}
            >
              {processedData.map((entry, index) => (
                <Cell
                  key={
                    (entry._uniqueId as string) || `cell-${index}`
                  }
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={formatTooltipValue} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 11, maxHeight: height, overflow: "auto" }}
              formatter={(value: string) => truncate(value, 20)}
            />
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg bg-white p-4 dark:bg-gray-800">
      {title && (
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart() as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
