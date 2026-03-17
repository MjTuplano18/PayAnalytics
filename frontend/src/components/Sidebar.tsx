"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  UserCheck,
  Upload,
  ChevronsLeft,
  ChevronsRight,
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
  { path: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, setIsOpen, isCollapsed, toggleCollapsed } = useSidebar();
  const { user, logout } = useAuth();

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
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isCollapsed
            ? "w-20 bg-gradient-to-b from-teal-600 via-teal-500 to-cyan-400 border-teal-400/30"
            : "w-64 bg-gray-900 border-gray-800"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Toggle button + Logo */}
        <div className={`flex items-center p-6 ${isCollapsed ? "justify-center" : "justify-between"}`}>
          {!isCollapsed && (
            <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
              PayAnalytics
            </h1>
          )}
          <button
            onClick={toggleCollapsed}
            className={`rounded-lg p-1.5 transition-colors duration-200 ${
              isCollapsed
                ? "text-white/80 hover:bg-white/20 hover:text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
            aria-label="Toggle sidebar"
          >
            {isCollapsed ? (
              <ChevronsRight className="h-5 w-5" />
            ) : (
              <ChevronsLeft className="h-5 w-5" />
            )}
          </button>
        </div>

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
                title={isCollapsed ? item.label : undefined}
                className={`mb-2 flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                  isCollapsed ? "justify-center px-2" : ""
                } ${
                  active
                    ? isCollapsed
                      ? "bg-white/25 text-white shadow-lg"
                      : "bg-teal-600 text-white shadow-lg shadow-teal-600/30"
                    : isCollapsed
                      ? "text-white/70 hover:bg-white/15 hover:text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white hover:translate-x-1"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Profile & Sign Out */}
        <div className={`border-t p-4 ${
          isCollapsed ? "border-white/20" : "border-gray-800"
        }`}>
          {user && !isCollapsed && (
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 text-sm font-semibold text-white">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-200">
                  {user.full_name}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {user.email}
                </p>
              </div>
            </div>
          )}
          {user && isCollapsed && (
            <div className="mb-3 flex justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            title={isCollapsed ? "Sign Out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 ${
              isCollapsed
                ? "justify-center px-2 text-white/70 hover:bg-white/15 hover:text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <LogOut className="h-5 w-5" />
            {!isCollapsed && <span className="text-sm font-medium">Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
