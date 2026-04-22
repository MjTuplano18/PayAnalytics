"use client";

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
import { ChartMetadata } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChartRendererProps {
  chartData: ChartMetadata;
  className?: string;
}

/**
 * ChartRenderer component for displaying data visualizations in AI chat responses.
 * 
 * Supports three chart types:
 * - Bar Chart: For top-N queries (e.g., "top 5 banks by collection")
 * - Line Chart: For time-series queries (e.g., "payment trends over last 6 months")
 * - Pie Chart: For distribution queries (e.g., "payment breakdown by touchpoint")
 * 
 * Handles malformed chart metadata gracefully by returning null (fallback to text only).
 */
export function ChartRenderer({ chartData, className }: ChartRendererProps) {
  // Validate chart metadata
  if (!chartData || !chartData.type || !chartData.data || !chartData.labels) {
    console.warn("Invalid chart metadata:", chartData);
    return null;
  }

  // Validate data and labels arrays
  if (!Array.isArray(chartData.data) || !Array.isArray(chartData.labels)) {
    console.warn("Chart data or labels is not an array:", chartData);
    return null;
  }

  // Validate data and labels have matching lengths
  if (chartData.data.length !== chartData.labels.length) {
    console.warn(
      "Chart data and labels length mismatch:",
      chartData.data.length,
      "vs",
      chartData.labels.length
    );
    return null;
  }

  // Validate data array is not empty
  if (chartData.data.length === 0) {
    console.warn("Chart data is empty");
    return null;
  }

  // Transform data for Recharts format
  const transformedData = chartData.labels.map((label, index) => ({
    name: label,
    value: chartData.data[index],
  }));

  return (
    <div className={cn("my-4 rounded-lg border border-border bg-card p-4", className)}>
      {/* Chart title */}
      {chartData.title && (
        <h4 className="mb-4 text-center text-sm font-semibold text-foreground">
          {chartData.title}
        </h4>
      )}

      {/* Render appropriate chart type */}
      <ResponsiveContainer width="100%" height={300}>
        {chartData.type === "bar" && <BarChartComponent data={transformedData} chartData={chartData} />}
        {chartData.type === "line" && <LineChartComponent data={transformedData} chartData={chartData} />}
        {chartData.type === "pie" && <PieChartComponent data={transformedData} />}
      </ResponsiveContainer>
    </div>
  );
}

interface TransformedData {
  name: string;
  value: number;
}

interface ChartComponentProps {
  data: TransformedData[];
  chartData: ChartMetadata;
}

/**
 * Bar Chart component for top-N queries
 */
function BarChartComponent({ data, chartData }: ChartComponentProps) {
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis
        dataKey="name"
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        axisLine={false}
        label={
          chartData.x_axis_label
            ? {
                value: chartData.x_axis_label,
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
              }
            : undefined
        }
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={(value) => formatNumber(value)}
        label={
          chartData.y_axis_label
            ? {
                value: chartData.y_axis_label,
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
              }
            : undefined
        }
      />
      <Tooltip
        content={<CustomTooltip />}
        cursor={{ fill: "hsl(var(--accent))" }}
      />
      <Legend
        wrapperStyle={{ fontSize: 12 }}
        iconType="rect"
      />
      <Bar
        dataKey="value"
        fill="hsl(var(--primary))"
        radius={[4, 4, 0, 0]}
        name={chartData.y_axis_label || "Value"}
      />
    </BarChart>
  );
}

/**
 * Line Chart component for time-series queries
 */
function LineChartComponent({ data, chartData }: ChartComponentProps) {
  return (
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis
        dataKey="name"
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        axisLine={false}
        label={
          chartData.x_axis_label
            ? {
                value: chartData.x_axis_label,
                position: "insideBottom",
                offset: -5,
                style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
              }
            : undefined
        }
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={(value) => formatNumber(value)}
        label={
          chartData.y_axis_label
            ? {
                value: chartData.y_axis_label,
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
              }
            : undefined
        }
      />
      <Tooltip content={<CustomTooltip />} />
      <Legend
        wrapperStyle={{ fontSize: 12 }}
        iconType="line"
      />
      <Line
        type="monotone"
        dataKey="value"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        dot={{ fill: "hsl(var(--primary))", r: 4 }}
        activeDot={{ r: 6 }}
        name={chartData.y_axis_label || "Value"}
      />
    </LineChart>
  );
}

/**
 * Pie Chart component for distribution queries
 */
function PieChartComponent({ data }: { data: TransformedData[] }) {
  // Color palette for pie chart slices
  const COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  return (
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        labelLine={false}
        label={renderPieLabel}
        outerRadius={100}
        fill="hsl(var(--primary))"
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip content={<CustomTooltip />} />
      <Legend
        wrapperStyle={{ fontSize: 12 }}
        iconType="circle"
      />
    </PieChart>
  );
}

/**
 * Custom label renderer for pie chart slices
 */
function renderPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  // Guard against undefined values
  if (
    cx === undefined ||
    cy === undefined ||
    midAngle === undefined ||
    innerRadius === undefined ||
    outerRadius === undefined ||
    percent === undefined
  ) {
    return null;
  }

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // Only show label if percentage is >= 5%
  if (percent < 0.05) {
    return null;
  }

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

/**
 * Custom tooltip component for all chart types
 */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0];

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-md">
      <p className="mb-1 text-sm font-semibold text-popover-foreground">
        {data.payload.name}
      </p>
      <p className="text-sm text-muted-foreground">
        {data.name}: <span className="font-semibold">{formatNumber(data.value)}</span>
      </p>
    </div>
  );
}

/**
 * Format numbers with appropriate separators and decimals
 */
function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  if (value % 1 !== 0) {
    return value.toFixed(2);
  }
  return value.toString();
}
