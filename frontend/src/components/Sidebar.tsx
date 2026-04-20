"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  UserCheck,
  Upload,
  Table,
  Settings,
  LogOut,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";

const menuItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/transactions", icon: FileText, label: "Transactions" },
  { path: "/customers", icon: UserCheck, label: "Accounts" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/sheets", icon: Table, label: "Sheets" },
  { path: "/upload", icon: Upload, label: "Upload Data" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, setIsOpen } = useSidebar();
  const { user, logout } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  // Sidebar is collapsed by default; expands only while hovered
  const collapsed = !isHovered;

  const isActive = (path: string) => pathname === path;

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed left-0 top-16 z-50 flex h-[calc(100vh-4rem)] flex-col border-r bg-white dark:bg-[rgba(7,13,18,0.92)] border-border/40 dark:border-white/6 backdrop-blur-xl transition-[width] duration-[350ms] ease-[cubic-bezier(0.2,0,0,1)] translate-x-0 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`${collapsed ? "mb-4" : "mb-2"} flex items-center gap-3 rounded-full px-4 py-3 transition-all duration-[250ms] ease-[cubic-bezier(0.2,0,0,1)] ${
                  collapsed ? "justify-center px-2" : ""
                } ${
                  active
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted dark:hover:bg-white/8 hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Profile, Settings & Sign Out */}
        <div className="border-t border-border/40 dark:border-white/6 p-4">
          {user && !collapsed && (
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className={`rounded-full p-2 transition-all duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)] ${
                  isActive("/settings")
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted dark:hover:bg-white/8 hover:text-foreground"
                }`}
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          )}
          {user && collapsed && (
            <div className="mb-3 flex flex-col items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className={`rounded-full p-2 transition-all duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)] ${
                  isActive("/settings")
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted dark:hover:bg-white/8 hover:text-foreground"
                }`}
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          )}
          <button
            onClick={logout}
            title={collapsed ? "Sign Out" : undefined}
            className={`flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-muted-foreground transition-all duration-[200ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted dark:hover:bg-white/8 hover:text-foreground ${
              collapsed ? "justify-center px-2" : ""
            }`}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
