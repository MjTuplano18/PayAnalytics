"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000,   // 10 min default
            gcTime: 30 * 60 * 1000,       // 30 min
            refetchOnWindowFocus: false,   // never refetch just because user switched tabs
            refetchOnMount: false,         // use cache if available
            retry: (failureCount, error) => {
              const msg = (error as Error).message ?? "";
              if (
                msg.includes("401") ||
                msg.includes("403") ||
                msg.includes("404")
              ) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
