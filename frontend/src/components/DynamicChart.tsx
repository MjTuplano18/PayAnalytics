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

/** Brand palette — 12 slots for multi-series / pie charts */
const COLORS = [
  "#14b8a6", // teal
  "#5eead4", // light teal
  "#0d9488", // dark teal
  "#90E0D7", // soft teal-blue (IB SMS slot)
  "#0f766e", // deep teal
  "#2dd4bf", // medium teal
  "#ccfbf1", // pale teal
  "#e0faf6", // off-white teal
  "#115e59", // forest teal
  "#a0ece3", // soft light teal
  "#a7f3d0", // mint
  "#4dcfbb", // medium-light teal
];

const BRAND = "#14b8a6";
const BRAND_SECONDARY = "#0d9488";

/** Truncate long labels for chart axes/legends */
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Format number with compact abbreviations (1K, 4M, 2B, etc.) */
function fmtNum(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000)
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(value));
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
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    color: "#ffffff",
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
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={1} />
                <stop offset="100%" stopColor="#5eead4" stopOpacity={0.8} />
              </linearGradient>
            </defs>
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
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={formatTooltipValue}
              cursor={{ fill: "rgba(209, 213, 219, 0.08)" }}
            />
            <Bar
              dataKey={dataKey}
              fill="url(#barGradient)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        );
      case "barh":
        return (
          <BarChart
            data={processedData}
            layout="vertical"
            margin={{ left: 50, right: 10, top: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="barhGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={1} />
                <stop offset="100%" stopColor="#5eead4" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              type="number"
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
              tickFormatter={fmtNum}
            />
            <YAxis
              type="category"
              dataKey="_shortName"
              className="text-muted-foreground"
              tick={{ fontSize: 11 }}
              width={40}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={formatTooltipValue}
              cursor={{ fill: "rgba(209, 213, 219, 0.08)" }}
            />
            <Bar
              dataKey={dataKey}
              fill="url(#barhGradient)"
              radius={[0, 4, 4, 0]}
            />
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
              stroke={BRAND}
              strokeWidth={2}
              dot={{ fill: BRAND, r: 4 }}
              activeDot={{ r: 6, fill: BRAND }}
            />
          </LineChart>
        );
      case "area":
        return (
          <AreaChart data={processedData}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.02} />
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
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={formatTooltipValue}
              cursor={{ fill: "rgba(209, 213, 219, 0.08)" }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={BRAND}
              fill="url(#areaGradient)"
              strokeWidth={2}
              activeDot={{ r: 6, fill: BRAND }}
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
    <div className="rounded-lg bg-card p-4">
      {title && (
        <h3 className="mb-4 text-lg font-semibold font-display text-foreground">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart() as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
