"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterOptions } from "@/types/data";
import { Filter, X } from "lucide-react";

interface FilterPanelProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  environments?: string[];
  banks: string[];
  touchpoints: string[];
}

export function FilterPanel({
  filters,
  onFiltersChange,
  environments = [],
  banks,
  touchpoints,
}: FilterPanelProps) {
  const handleFilterChange = (key: keyof FilterOptions, value: unknown) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters = Object.values(filters).some(
    (val) => val !== undefined && val !== ""
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-teal-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Filters
          </h3>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={filters.startDate || ""}
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={filters.endDate || ""}
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
          />
        </div>
        {environments.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="environment">Environment</Label>
            <Select
              value={filters.environment || "all"}
              onValueChange={(value) => {
                onFiltersChange({
                  ...filters,
                  environment: value === "all" ? undefined : value,
                  bank: undefined,
                  touchpoint: undefined,
                });
              }}
            >
              <SelectTrigger id="environment">
                <SelectValue placeholder="All Environments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Environments</SelectItem>
                {environments.map((env) => (
                  <SelectItem key={env} value={env}>
                    {env}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="bank">Bank (Campaign)</Label>
          <Select
            value={filters.bank || "all"}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                bank: value === "all" ? undefined : value,
                touchpoint: undefined,
              })
            }
          >
            <SelectTrigger id="bank">
              <SelectValue placeholder="All Banks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Banks</SelectItem>
              {banks.map((bank) => (
                <SelectItem key={bank} value={bank}>
                  {bank}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="touchpoint">Touchpoint</Label>
          <Select
            value={filters.touchpoint || "all"}
            onValueChange={(value) =>
              handleFilterChange(
                "touchpoint",
                value === "all" ? undefined : value
              )
            }
          >
            <SelectTrigger id="touchpoint">
              <SelectValue placeholder="All Touchpoints" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Touchpoints</SelectItem>
              {touchpoints.map((tp) => (
                <SelectItem key={tp} value={tp}>
                  {tp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="minValue">Min Value</Label>
          <Input
            id="minValue"
            type="number"
            placeholder="0"
            value={filters.minValue ?? ""}
            onChange={(e) =>
              handleFilterChange(
                "minValue",
                e.target.value ? parseFloat(e.target.value) : undefined
              )
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxValue">Max Value</Label>
          <Input
            id="maxValue"
            type="number"
            placeholder="999999"
            value={filters.maxValue ?? ""}
            onChange={(e) =>
              handleFilterChange(
                "maxValue",
                e.target.value ? parseFloat(e.target.value) : undefined
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
