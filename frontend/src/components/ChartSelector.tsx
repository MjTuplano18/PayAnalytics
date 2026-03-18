"use client";

import React from "react";
import { BarChart3, LineChart, PieChart, AreaChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartType } from "@/types/data";

interface ChartSelectorProps {
  selectedType: ChartType;
  onTypeChange: (type: ChartType) => void;
}

const chartTypes: { type: ChartType; icon: React.ReactNode; label: string }[] =
  [
    { type: "bar", icon: <BarChart3 className="h-4 w-4" />, label: "Bar" },
    { type: "line", icon: <LineChart className="h-4 w-4" />, label: "Line" },
    { type: "pie", icon: <PieChart className="h-4 w-4" />, label: "Pie" },
    { type: "area", icon: <AreaChart className="h-4 w-4" />, label: "Area" },
  ];

export function ChartSelector({ selectedType, onTypeChange }: ChartSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {chartTypes.map(({ type, icon, label }) => (
        <Button
          key={type}
          variant={selectedType === type ? "default" : "outline"}
          size="sm"
          onClick={() => onTypeChange(type)}
          className={
            selectedType === type
              ? "bg-[#4a55d1] text-white hover:bg-[#4048c0]"
              : ""
          }
        >
          {icon}
          <span className="ml-1">{label}</span>
        </Button>
      ))}
    </div>
  );
}
