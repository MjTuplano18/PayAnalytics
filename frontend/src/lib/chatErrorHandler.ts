/**
 * Chat Error Handler Utility
 * 
 * Provides centralized error handling for chat-related operations.
 * Ensures that internal error details (stack traces, SQL errors, etc.) 
 * are never exposed to users.
 */

export type ErrorType = 'general' | 'rate_limit' | 'auth' | 'timeout' | 'clarification' | null;

export interface ParsedError {
  message: string;
  type: ErrorType;
  retryAfter?: number;
}

/**
 * Sanitize error message to remove internal details
 */
function sanitizeErrorMessage(message: string): string {
  // List of patterns that indicate internal errors
  const internalPatterns = [
    /stack/i,
    /SQL/i,
    /database/i,
    /internal/i,
    /undefined/i,
    /null reference/i,
    /traceback/i,
    /exception/i,
    /\bat\s+\w+\.\w+/i, // Stack trace patterns like "at Object.method"
  ];

  // Check if message contains internal patterns
  const hasInternalDetails = internalPatterns.some(pattern => pattern.test(message));
  
  // If message is too long or contains internal details, use generic message
  if (hasInternalDetails || message.length > 200) {
    return "An error occurred while processing your request. Please try again.";
  }

  return message;
}

/**
 * Parse error and categorize it
 */
export function parseError(error: unknown, response?: Response): ParsedError {
  // Handle 401 - Authentication failure
  if (response?.status === 401) {
    return {
      message: "Your session has expired. Redirecting to login...",
      type: "auth",
    };
  }

  // Handle 429 - Rate limit
  if (response?.status === 429) {
    const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
    return {
      message: `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
      type: "rate_limit",
      retryAfter,
    };
  }

  // Handle timeout errors
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("took too long")) {
      return {
        message: "Your query took too long to process. Try narrowing your search or using more specific filters.",
        type: "timeout",
      };
    }

    // Handle clarification requests from AI
    if (msg.includes("clarify") || 
        msg.includes("more information") ||
        msg.includes("specify") ||
        msg.includes("which") ||
        msg.includes("please provide")) {
      return {
        message: error.message,
        type: "clarification",
      };
    }

    // General error with sanitized message
    return {
      message: sanitizeErrorMessage(error.message),
      type: "general",
    };
  }

  // Unknown error type
  return {
    message: "An unexpected error occurred. Please try again.",
    type: "general",
  };
}

/**
 * Get user-friendly error title based on error type
 */
export function getErrorTitle(type: ErrorType): string {
  switch (type) {
    case "rate_limit":
      return "⏱️ Rate Limit Exceeded";
    case "auth":
      return "🔒 Authentication Required";
    case "timeout":
      return "⏰ Request Timeout";
    case "clarification":
      return "💬 Need More Information";
    case "general":
      return "⚠️ Error";
    default:
      return "⚠️ Error";
  }
}

/**
 * Get CSS classes for error display based on error type
 */
export function getErrorClasses(type: ErrorType): {
  container: string;
  title: string;
  message: string;
} {
  switch (type) {
    case "rate_limit":
      return {
        container: "border-orange-500 bg-orange-50 dark:bg-orange-950/20",
        title: "text-orange-700 dark:text-orange-400",
        message: "text-orange-600 dark:text-orange-300",
      };
    case "auth":
      return {
        container: "border-red-500 bg-red-50 dark:bg-red-950/20",
        title: "text-red-700 dark:text-red-400",
        message: "text-red-600 dark:text-red-300",
      };
    case "timeout":
      return {
        container: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
        title: "text-yellow-700 dark:text-yellow-400",
        message: "text-yellow-600 dark:text-yellow-300",
      };
    case "clarification":
      return {
        container: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
        title: "text-blue-700 dark:text-blue-400",
        message: "text-blue-600 dark:text-blue-300",
      };
    case "general":
    default:
      return {
        container: "border-destructive bg-destructive/10",
        title: "text-destructive",
        message: "text-destructive/90",
      };
  }
}
