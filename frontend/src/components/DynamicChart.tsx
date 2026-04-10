"use client";

import React, { useMemo, useState, useCallback } from "react";
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
  "#5B66E2", // indigo
  "#8B96F2", // light indigo
  "#4a55d1", // dark indigo
  "#A0A8F8", // soft indigo
  "#3840b0", // deep indigo
  "#7B86E8", // medium indigo
  "#C8CCFA", // pale indigo
  "#E0E3FD", // off-white indigo
  "#2E3590", // navy indigo
  "#B0B8F5", // soft light indigo
  "#9AA3F0", // periwinkle
  "#6B76E5", // medium-light indigo
];

const BRAND = "#5B66E2";
const BRAND_SECONDARY = "#4a55d1";

/** Truncate long labels for chart axes/legends */
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Shorter truncation for bar chart x-axis labels */
function truncateAxis(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Format number with compact abbreviations (1K, 4M, 2B, etc.) */
function fmtNum(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000)
    return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
  if (abs >= 1_000_000)
    return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (abs >= 1_000)
    return `${(value / 1_000).toFixed(2).replace(/\.00$/, "")}K`;
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DynamicChart({
  data,
  type,
  dataKey,
  xAxisKey,
  height = 350,
  title,
}: DynamicChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    setContainerWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((item, index) => ({
      ...item,
      _shortName: truncateAxis(String(item[xAxisKey] ?? ""), 10),
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

  const tooltipLabelStyle = { color: "#ffffff" };
  const tooltipItemStyle  = { color: "#ffffff" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatTooltipValue = (value: any) => {
    const num = Number(value);
    const formatted = fmtNum(isNaN(num) ? 0 : num);
    if (dataKey === "percentage") return `${formatted}%`;
    if (dataKey === "count") return formatted;
    return `₱${formatted}`;
  };

  const formatAxisTick = (value: number) => {
    if (dataKey === "percentage") return `${fmtNum(value)}%`;
    return fmtNum(value);
  };

  const renderChart = () => {
    // Responsive: on narrow containers, skip some x-axis labels to prevent overlap
    const isCompact = containerWidth < 500;
    const barInterval = isCompact ? Math.max(1, Math.floor(processedData.length / 15)) : 0;

    switch (type) {
      case "bar":
        return (
          <BarChart data={processedData} margin={{ left: isCompact ? 10 : 30, right: isCompact ? 10 : 30, top: 15, bottom: 40 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4a55d1" stopOpacity={1} />
                <stop offset="100%" stopColor="#8B96F2" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="_shortName"
              className="text-muted-foreground"
              tick={{ fontSize: isCompact ? 9 : 11 }}
              angle={-45}
              textAnchor="end"
              interval={barInterval}
              height={50}
            />
            <YAxis
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
              tickFormatter={formatAxisTick}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
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
            margin={{ left: 30, right: 30, top: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="barhGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4a55d1" stopOpacity={1} />
                <stop offset="100%" stopColor="#8B96F2" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              type="number"
              className="text-muted-foreground"
              tick={{ fontSize: 12 }}
              tickFormatter={formatAxisTick}
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
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
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
              tickFormatter={formatAxisTick}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={formatTooltipValue} />
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
          <AreaChart data={processedData} margin={{ left: 30, right: 30, top: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5B66E2" stopOpacity={0.85} />
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
              tickFormatter={formatAxisTick}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
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
      
      case "pie": {
        const isNarrow = containerWidth < 380;
        const outerR = Math.min(height * 0.38, isNarrow ? 90 : 140);
        const RADIAN = Math.PI / 180;

        // Custom label renderer that places labels outside the pie along leader lines.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderOuterLabel = (props: any) => {
          const { cx = 0, cy = 0, midAngle = 0, outerRadius: oR = 0, percent = 0 } = props;
          if (percent < 0.003) return null; // skip < 0.3%
          const radius = oR + 32;
          const x = cx + radius * Math.cos(-midAngle * RADIAN);
          const y = cy + radius * Math.sin(-midAngle * RADIAN);
          return (
            <text
              x={x}
              y={y}
              fill="currentColor"
              textAnchor={x > cx ? "start" : "end"}
              dominantBaseline="central"
              className="text-gray-700 dark:text-gray-300"
              fontSize={16}
              fontWeight={600}
            >
              {`${(percent * 100).toFixed(2)}%`}
            </text>
          );
        };

        return (
          <PieChart margin={{ top: 5, bottom: 30, left: 10, right: 0 }} style={{ overflow: 'visible' }}>            <Pie
              data={processedData}
              cx={isNarrow ? "50%" : "38%"}
              cy={isNarrow ? "50%" : "50%"}
              labelLine
              label={renderOuterLabel}
              outerRadius={outerR}
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
            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={formatTooltipValue} />
            {isNarrow ? (
              <Legend
                layout="horizontal"
                align="center"
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value: string) => truncate(value, 15)}
              />
            ) : (
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ fontSize: 14, maxHeight: height, overflow: "auto", paddingLeft: 8, lineHeight: "2" }}
                formatter={(value: string) => truncate(value, 22)}
              />
            )}
          </PieChart>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div ref={containerRef} className="rounded-lg bg-card p-4">
      {title && (
        <h3 className="mb-4 text-lg font-semibold font-display text-foreground">
          {title}
        </h3>
      )}
      <div style={{ overflow: 'visible', position: 'relative' }}>
        <ResponsiveContainer width="100%" height={height} style={{ overflow: 'visible' }}>
          {renderChart() as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
