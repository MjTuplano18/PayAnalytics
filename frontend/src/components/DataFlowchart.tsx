"use client";

import React, { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface DataFlowchartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  type: "customer" | "expense";
  height?: number;
}

export function DataFlowchart({
  data,
  type,
  height = 500,
}: DataFlowchartProps) {
  const { nodes, edges } = useMemo(() => {
    if (!data || data.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const nodeBase = {
      borderRadius: "8px",
      padding: "10px",
      fontSize: "13px",
    };

    if (type === "customer") {
      nodes.push({
        id: "start",
        type: "input",
        data: { label: "Customer Acquisition" },
        position: { x: 250, y: 0 },
        sourcePosition: Position.Bottom,
        style: {
          ...nodeBase,
          background: "#14b8a6",
          color: "#ffffff",
          border: "none",
          fontWeight: 600,
        },
      });

      const sampleData = data.slice(0, Math.min(5, data.length));
      sampleData.forEach((item, index) => {
        const yPosition = 100 + index * 100;
        nodes.push({
          id: `month-${index}`,
          data: {
            label: `${item.date}\nCustomers: ${item.customers}\nNew: ${(item as Record<string, unknown>).newCustomers || "N/A"}`,
          },
          position: { x: 100 + (index % 2) * 300, y: yPosition },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            ...nodeBase,
            background: "var(--card)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            whiteSpace: "pre-line" as const,
          },
        });
        if (index > 0) {
          edges.push({
            id: `e-${index - 1}-${index}`,
            source: `month-${index - 1}`,
            target: `month-${index}`,
            animated: true,
            style: { stroke: "#14b8a6" },
          });
        } else {
          edges.push({
            id: "e-start-0",
            source: "start",
            target: "month-0",
            animated: true,
            style: { stroke: "#14b8a6" },
          });
        }
      });

      nodes.push({
        id: "end",
        type: "output",
        data: { label: `Total Growth\n${data.length} periods tracked` },
        position: { x: 250, y: 100 + sampleData.length * 100 },
        targetPosition: Position.Top,
        style: {
          ...nodeBase,
          background: "#10b981",
          color: "#ffffff",
          border: "none",
          fontWeight: 600,
          whiteSpace: "pre-line" as const,
        },
      });
      edges.push({
        id: "e-last-end",
        source: `month-${sampleData.length - 1}`,
        target: "end",
        animated: true,
        style: { stroke: "#10b981" },
      });
    } else {
      const categories = [
        ...new Set(data.map((d) => d.category as string)),
      ];
      nodes.push({
        id: "start",
        type: "input",
        data: { label: "Expense Tracking" },
        position: { x: 250, y: 0 },
        sourcePosition: Position.Bottom,
        style: {
          ...nodeBase,
          background: "#f59e0b",
          color: "#ffffff",
          border: "none",
          fontWeight: 600,
        },
      });

      categories.slice(0, 4).forEach((category, index) => {
        const categoryData = data.filter((d) => d.category === category);
        const total = categoryData.reduce(
          (sum, d) => sum + (Number(d.expense) || 0),
          0
        );
        nodes.push({
          id: `category-${index}`,
          data: {
            label: `${category}\nTotal: $${total.toFixed(0)}\nItems: ${categoryData.length}`,
          },
          position: {
            x: 100 + (index % 2) * 300,
            y: 100 + Math.floor(index / 2) * 150,
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            ...nodeBase,
            background: "var(--card)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            whiteSpace: "pre-line" as const,
          },
        });
        edges.push({
          id: `e-start-${index}`,
          source: "start",
          target: `category-${index}`,
          animated: true,
          style: { stroke: "#f59e0b" },
        });
      });
    }

    return { nodes, edges };
  }, [data, type]);

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

  return (
    <div
      style={{ height }}
      className="overflow-hidden rounded-lg bg-muted"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
