"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getQuickActions, type QuickActionTemplate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  Calendar,
  BarChart3,
  DollarSign,
  Upload,
  Building2,
  Zap,
} from "lucide-react";

interface QuickActionsProps {
  onSelect: (query: string) => void;
  disabled?: boolean;
}

// Icon mapping for quick actions
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  trending: TrendingUp,
  calendar: Calendar,
  chart: BarChart3,
  dollar: DollarSign,
  upload: Upload,
  building: Building2,
  zap: Zap,
};

export function QuickActions({ onSelect, disabled = false }: QuickActionsProps) {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<QuickActionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const loadTemplates = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await getQuickActions(token);
        setTemplates(response.templates);
      } catch (err) {
        console.error("Failed to load quick actions:", err);
        setError(err instanceof Error ? err.message : "Failed to load quick actions");
        // Set default templates as fallback
        setTemplates(getDefaultTemplates());
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplates();
  }, [token]);

  const handleQuickAction = (template: QuickActionTemplate) => {
    if (disabled) return;
    onSelect(template.query);
  };

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-9 w-32 animate-pulse rounded-md bg-muted"
          />
        ))}
      </div>
    );
  }

  if (error && templates.length === 0) {
    return null; // Silently fail if no templates available
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
      {templates.map((template) => {
        const Icon = template.icon ? iconMap[template.icon] || Zap : Zap;
        
        return (
          <Button
            key={template.id}
            variant="outline"
            size="sm"
            onClick={() => handleQuickAction(template)}
            disabled={disabled}
            className={cn(
              "flex-shrink-0 gap-2 whitespace-nowrap transition-all hover:scale-105",
              disabled && "cursor-not-allowed opacity-50"
            )}
            title={template.query}
          >
            <Icon className="size-4" />
            {template.label}
          </Button>
        );
      })}
    </div>
  );
}

// Default templates as fallback
function getDefaultTemplates(): QuickActionTemplate[] {
  return [
    {
      id: "top-banks",
      label: "Top 5 Banks",
      query: "Show me the top 5 banks by collection this month",
      icon: "building",
    },
    {
      id: "payment-trends",
      label: "Payment Trends",
      query: "Show payment trends over the last 6 months",
      icon: "trending",
    },
    {
      id: "today-collections",
      label: "Today's Collections",
      query: "What are today's collections by touchpoint?",
      icon: "calendar",
    },
    {
      id: "month-comparison",
      label: "Month Comparison",
      query: "Compare this month vs last month",
      icon: "chart",
    },
    {
      id: "highest-payment",
      label: "Highest Payment",
      query: "What was the highest single payment?",
      icon: "dollar",
    },
    {
      id: "avg-by-bank",
      label: "Avg by Bank",
      query: "Show average payment amount by bank",
      icon: "building",
    },
    {
      id: "upload-summary",
      label: "Upload Summary",
      query: "Give me a summary of recent uploads",
      icon: "upload",
    },
    {
      id: "environment-breakdown",
      label: "Environment Breakdown",
      query: "Show breakdown by environment",
      icon: "chart",
    },
    {
      id: "monthly-totals",
      label: "Monthly Totals",
      query: "Show monthly payment totals",
      icon: "calendar",
    },
    {
      id: "bank-performance",
      label: "Bank Performance",
      query: "Rank banks by performance",
      icon: "trending",
    },
  ];
}
