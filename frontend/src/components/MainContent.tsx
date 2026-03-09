"use client";

import { useSidebar } from "@/context/SidebarContext";
import { TopBar } from "@/components/TopBar";
import { ReactNode } from "react";

export function MainContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isCollapsed ? "lg:ml-20" : "lg:ml-64"
    }`}>
      <TopBar />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
    </div>
  );
}
