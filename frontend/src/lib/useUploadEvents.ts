/**
 * useUploadEvents
 *
 * Subscribes to the backend SSE stream (/api/v1/events/stream) and
 * invalidates the TanStack Query uploads cache whenever another user
 * (or admin) saves a new Excel file.
 *
 * Uses the Fetch API instead of the browser's native EventSource so we can
 * pass the Authorization header — EventSource does not support custom headers.
 *
 * Auto-reconnects after 5 s on connection failures.
 */

"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export function useUploadEvents(token: string | null) {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;

    let active = true;

    async function connect() {
      if (!active) return;

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_BASE}/api/v1/events/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE messages are separated by double newlines
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const dataLine = chunk
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const payload = JSON.parse(dataLine.slice(6));
              if (payload.type === "new_upload") {
                // Invalidate the uploads list so every subscriber refetches
                queryClient.invalidateQueries({ queryKey: ["uploads"] });
              }
            } catch {
              // Ignore malformed JSON (e.g. keepalive comments)
            }
          }
        }
      } catch (err) {
        if (!active) return;
        const isAbort = (err as Error).name === "AbortError";
        if (!isAbort) {
          // Reconnect after 5 seconds on non-intentional failures
          retryTimer.current = setTimeout(connect, 5_000);
        }
      }
    }

    connect();

    return () => {
      active = false;
      abortRef.current?.abort();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [token, queryClient]);
}
