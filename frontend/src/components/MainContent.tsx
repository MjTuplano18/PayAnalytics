"use client";

import { TopBar } from "@/components/TopBar";
import { ReactNode } from "react";

export function MainContent({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="min-h-[calc(100vh-4rem)] bg-transparent ml-20">{children}</main>
    </div>
  );
}
