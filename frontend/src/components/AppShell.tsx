"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import { useData } from "@/context/DataContext";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { Sidebar } from "@/components/Sidebar";
import { MainContent } from "@/components/MainContent";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { listUploads, type UploadSessionOut } from "@/lib/api";
import { useUploadEvents } from "@/lib/useUploadEvents";

/**
 * Silently restores the active session (sessionId + fileName) from the backend
 * on page refresh. Does NOT load individual records — the dashboard and
 * transactions pages each fetch their own data via TanStack Query, so loading
 * all records here would cause a large unnecessary payload on every refresh.
 */
function SessionRestorer() {
  const { token } = useAuth();
  const { sessionId, setSessionId, fileName, setFileName } = useData();
  const autoPickedRef = useRef(false);

  // If sessionId is already set, validate it still exists (lightweight list check)
  useEffect(() => {
    if (!sessionId || !token) return;
    // If fileName is already set the session is fully hydrated — nothing to do.
    if (fileName) return;

    // Fetch just the session list (metadata only) to confirm the session exists
    // and fill in the fileName without loading all records.
    listUploads(token).then((sessions: UploadSessionOut[]) => {
      const match = sessions.find((s) => s.id === sessionId);
      if (!match) {
        setSessionId(null);
        return;
      }
      setFileName(match.file_name);
    }).catch(() => {
      // Network error — clear stale session so the app doesn't hang
      setSessionId(null);
    });
  }, [sessionId, token, fileName]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pick the most recent upload if no sessionId is set
  useEffect(() => {
    if (sessionId || !token || autoPickedRef.current) return;
    autoPickedRef.current = true;

    listUploads(token).then((sessions: UploadSessionOut[]) => {
      if (sessions.length === 0) return;
      const sorted = [...sessions].sort(
        (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      );
      const latest = sorted[0];
      setSessionId(latest.id);
      setFileName(latest.file_name);
    }).catch(() => {
      // Silently fail — user can upload manually
    });
  }, [sessionId, token]);  // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Use dark as default to match the defaultTheme="dark" in ThemeProvider,
  // preventing a hydration mismatch since resolvedTheme is undefined on the server.
  const bgImage = !mounted || resolvedTheme === "dark" ? "/BKGRD.svg" : "/BKGRD%20INV.svg";

  const isLoginPage = pathname === "/login";

  // Show a full-page skeleton while checking auth
  if (isLoading && !isLoginPage) {
    return (
      <div className="relative flex min-h-screen bg-[#070D12]">
        {/* Blurred background */}
        <div className="fixed inset-0 z-0 overflow-hidden">
          <Image
            src={bgImage}
            alt=""
            fill
            className="object-cover opacity-60"
            style={{ filter: "blur(8px)", transform: "scale(1.05)" }}
            priority
          />
        </div>
        {/* Sidebar skeleton */}
        <div className="relative z-10 hidden md:flex h-screen w-64 flex-col border-r bg-[rgba(7,13,18,0.85)] border-white/10 p-6 gap-6 backdrop-blur-xl">
          <Skeleton className="h-8 w-36 bg-white/10" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full bg-white/10" />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="relative z-10 flex-1">
          {/* Top bar skeleton */}
          <div className="h-16 border-b border-white/10 bg-[rgba(7,13,18,0.75)] backdrop-blur-xl flex items-center px-8">
            <Skeleton className="h-5 w-32 bg-white/10" />
            <div className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-full bg-white/10" />
          </div>
          {/* Page skeleton */}
          <div className="p-8 space-y-6">
            <Skeleton className="h-8 w-48 bg-white/10" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg bg-white/10" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-lg bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  // Login page — no sidebar, no topbar
  if (isLoginPage) {
    return (
      <>
        {children}
        <Toaster position="bottom-right" />
      </>
    );
  }

  // Not authenticated and not on login — show skeleton while redirect happens
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070D12]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

/** Subscribes to backend SSE to auto-invalidate the upload list cache. */
function UploadEventListener() {
  const { token } = useAuth();
  useUploadEvents(token);
  return null;
}

/** Invisible overlay — covers the page when the sidebar is expanded so any click outside collapses it. */
function CollapseSidebarOverlay() {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  if (isCollapsed) return null;
  return (
    <div
      className="fixed inset-0 z-40"
      onClick={() => setIsCollapsed(true)}
      aria-hidden="true"
    />
  );
}

// Authenticated layout
  return (
    <DataProvider>
      <SessionRestorer />
      <UploadEventListener />
      <SidebarProvider>
        {/* Fixed blurred background – always behind everything */}
        <div className="fixed inset-0 z-0 overflow-hidden bg-[#070D12] dark:bg-[#070D12]" style={{ backgroundColor: resolvedTheme === "dark" ? "#070D12" : "#f4f7f9" }}>
          <Image
            src={bgImage}
            alt=""
            fill
            className="object-cover opacity-60"
            style={{ filter: "blur(8px)", transform: "scale(1.05)" }}
            priority
          />
        </div>
        <div className="relative z-10 min-h-screen">
          <CollapseSidebarOverlay />
          <Sidebar />
          <MainContent>{children}</MainContent>
        </div>
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </DataProvider>
  );
}
