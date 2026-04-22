/**
 * ErrorDisplay Component
 * 
 * Displays error messages with appropriate styling based on error type.
 * Supports different error categories: rate limit, auth, timeout, clarification, and general errors.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ErrorType, getErrorTitle, getErrorClasses } from "@/lib/chatErrorHandler";

interface ErrorDisplayProps {
  error: string;
  errorType: ErrorType;
  retryAfter?: number | null;
  onDismiss: () => void;
}

export function ErrorDisplay({ error, errorType, retryAfter, onDismiss }: ErrorDisplayProps) {
  const classes = getErrorClasses(errorType);
  const title = getErrorTitle(errorType);

  return (
    <div className={cn("border-t p-3", classes.container)}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className={cn("text-sm font-medium", classes.title)}>
            {title}
          </p>
          <p className={cn("mt-1 text-sm", classes.message)}>
            {error}
          </p>
          {errorType === "rate_limit" && retryAfter && (
            <p className="mt-2 text-xs text-orange-500 dark:text-orange-400">
              You can try again in {retryAfter} seconds.
            </p>
          )}
          {errorType === "timeout" && (
            <p className="mt-2 text-xs text-yellow-500 dark:text-yellow-400">
              💡 Tip: Try using specific date ranges, bank names, or filters to narrow your query.
            </p>
          )}
          {errorType === "clarification" && (
            <p className="mt-2 text-xs text-blue-500 dark:text-blue-400">
              💡 Tip: Provide more details in your next message to help me understand better.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          className="shrink-0"
          aria-label="Dismiss error"
        >
          <X className="size-3" />
        </Button>
      </div>
    </div>
  );
}
