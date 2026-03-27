"use client";

/**
 * Query-performance utilities for large datasets.
 *
 * Provides:
 *  - useVirtualScroll – row-level virtualisation for large tables
 *  - useDebouncedValue – generic debounce hook (useful for free-text search)
 *  - processInChunks – split CPU-heavy work across animation frames
 *  - sampleData – fast random sampling for chart previews
 *  - memoize – single-arg pure-function cache
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ── useDebouncedValue ────────────────────────────────────────────────────────

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

// ── useVirtualScroll ─────────────────────────────────────────────────────────

interface VirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
}

interface VirtualScrollResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  virtualItems: { index: number; offsetTop: number }[];
  totalHeight: number;
  containerStyle: React.CSSProperties;
  innerStyle: React.CSSProperties;
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  overscan = 5,
}: VirtualScrollOptions): VirtualScrollResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const totalHeight = itemCount * itemHeight;

  const virtualItems = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx = Math.min(itemCount - 1, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
    const items: { index: number; offsetTop: number }[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      items.push({ index: i, offsetTop: i * itemHeight });
    }
    return items;
  }, [scrollTop, containerHeight, itemCount, itemHeight, overscan]);

  const containerStyle: React.CSSProperties = { overflow: "auto", position: "relative" };
  const innerStyle: React.CSSProperties = { height: totalHeight, position: "relative" };

  return { containerRef, virtualItems, totalHeight, containerStyle, innerStyle };
}

// ── processInChunks ──────────────────────────────────────────────────────────

/**
 * Process an array in chunks across animation frames so the main thread
 * stays responsive.  Returns a promise that resolves with all results.
 */
export function processInChunks<T, R>(
  items: T[],
  processFn: (item: T, index: number) => R,
  chunkSize = 5000,
): Promise<R[]> {
  return new Promise((resolve) => {
    const results: R[] = [];
    let offset = 0;

    function next() {
      const end = Math.min(offset + chunkSize, items.length);
      for (let i = offset; i < end; i++) {
        results.push(processFn(items[i], i));
      }
      offset = end;
      if (offset < items.length) {
        requestAnimationFrame(next);
      } else {
        resolve(results);
      }
    }

    next();
  });
}

// ── sampleData ───────────────────────────────────────────────────────────────

/**
 * Deterministic reservoir-sample of `count` items from `data`.
 * Useful to avoid rendering 100k points in a chart.
 */
export function sampleData<T>(data: T[], count: number): T[] {
  if (data.length <= count) return data;

  // Reservoir sampling
  const reservoir = data.slice(0, count);
  for (let i = count; i < data.length; i++) {
    // Simple pseudo random with deterministic seed per index
    const j = i === 0 ? 0 : ((i * 2654435761) >>> 0) % (i + 1);
    if (j < count) {
      reservoir[j] = data[i];
    }
  }
  return reservoir;
}

// ── memoize ──────────────────────────────────────────────────────────────────

/**
 * Simple single-argument memoizer with an LRU limit.
 * For pure functions that convert one value → one result.
 */
export function memoize<A, R>(fn: (arg: A) => R, maxSize = 100): (arg: A) => R {
  const cache = new Map<A, R>();
  return (arg: A): R => {
    if (cache.has(arg)) return cache.get(arg)!;
    const result = fn(arg);
    cache.set(arg, result);
    if (cache.size > maxSize) {
      // evict eldest
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    return result;
  };
}

// ── useThrottledCallback ─────────────────────────────────────────────────────

/**
 * Returns a throttled version of a callback.  Good for scroll / resize handlers.
 */
export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const lastRun = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestArgs = useRef<Args | null>(null);

  return useCallback(
    (...args: Args) => {
      latestArgs.current = args;
      const now = Date.now();
      const remaining = delayMs - (now - lastRun.current);

      if (remaining <= 0) {
        lastRun.current = now;
        callback(...args);
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          lastRun.current = Date.now();
          timer.current = null;
          if (latestArgs.current) callback(...latestArgs.current);
        }, remaining);
      }
    },
    [callback, delayMs],
  );
}
