"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  UserCheck,
  Upload,
  Settings,
  LogOut,
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";

const menuItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/transactions", icon: FileText, label: "Transactions" },
  { path: "/customers", icon: UserCheck, label: "Accounts" },
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
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed left-0 top-16 z-50 flex h-[calc(100vh-4rem)] flex-col border-r bg-white dark:bg-[rgba(7,13,18,0.85)] border-gray-200 dark:border-white/10 backdrop-blur-xl transition-[width] duration-200 ease-out lg:translate-x-0 ${
          collapsed ? "w-20" : "w-64"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
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
                className={`${collapsed ? "mb-4" : "mb-2"} flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                  collapsed ? "justify-center px-2" : ""
                } ${
                  active
                    ? "bg-[#5B66E2] text-white shadow-lg shadow-[#5B66E2]/30"
                    : "text-gray-500 dark:text-[#939393] hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white hover:translate-x-1"
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
        <div className="border-t border-gray-200 dark:border-white/10 p-4">
          {user && !collapsed && (
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#5B66E2] to-[#8B96F2] text-sm font-semibold text-white">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {user.full_name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-[#939393]">
                  {user.email}
                </p>
              </div>
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className={`rounded-lg p-2 transition-all duration-200 ${
                  isActive("/settings")
                    ? "bg-[#5B66E2] text-white shadow-lg shadow-[#5B66E2]/30"
                    : "text-gray-500 dark:text-[#939393] hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
                }`}
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>
          )}
          {user && collapsed && (
            <div className="mb-3 flex flex-col items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#5B66E2] to-[#8B96F2] text-sm font-semibold text-white">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className={`rounded-lg p-2 transition-all duration-200 ${
                  isActive("/settings")
                    ? "bg-[#5B66E2] text-white shadow-lg shadow-[#5B66E2]/30"
                    : "text-gray-500 dark:text-[#939393] hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
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
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-gray-500 dark:text-[#939393] transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white ${
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
