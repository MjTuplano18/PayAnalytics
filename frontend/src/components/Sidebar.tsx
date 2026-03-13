"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  UserCheck,
  BarChart3,
  Upload,
  Menu,
  Settings,
  LogOut,
  ChevronDown,
  Waypoints,
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/context/AuthContext";

const menuItems = [
  {
    path: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    children: [
      { path: "/dashboard", label: "Overview" },
      { path: "/dashboard/touchpoints", label: "Touchpoints" },
    ],
  },
  { path: "/transactions", icon: FileText, label: "Transactions" },
  { path: "/customers", icon: UserCheck, label: "Accounts" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/upload", icon: Upload, label: "Upload Data" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, setIsOpen, isCollapsed, toggleCollapsed } = useSidebar();
  const { user, logout } = useAuth();
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);

  const isActive = (path: string) => pathname === path;
  const isParentActive = (path: string) => pathname.startsWith(path);

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
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r bg-gray-900 border-gray-800 transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isCollapsed ? "w-20" : "w-64"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo + Toggle button */}
        <div className="flex items-center justify-between p-6">
          {!isCollapsed && (
            <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
              PayAnalytics
            </h1>
          )}
          <button
            onClick={toggleCollapsed}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = "children" in item && item.children;
            const parentActive = isParentActive(item.path);
            const expanded = expandedMenu === item.path;

            if (hasChildren) {
              return (
                <div key={item.path} className="mb-1">
                  {/* Parent button */}
                  <button
                    onClick={() => {
                      if (isCollapsed) {
                        // In collapsed mode, navigate directly
                        window.location.href = item.path;
                      } else {
                        setExpandedMenu(expanded ? null : item.path);
                      }
                    }}
                    title={isCollapsed ? item.label : undefined}
                    className={`w-full mb-1 flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 ${
                      isCollapsed ? "justify-center px-2" : ""
                    } ${
                      parentActive
                        ? "bg-teal-600 text-white shadow-lg shadow-teal-600/30"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!isCollapsed && (
                      <>
                        <span className="font-medium flex-1 text-left">{item.label}</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-200 ${
                            expanded ? "rotate-180" : ""
                          }`}
                        />
                      </>
                    )}
                  </button>

                  {/* Sub-menu */}
                  {!isCollapsed && expanded && (
                    <div className="ml-4 pl-4 border-l border-gray-700 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.path}
                          href={child.path}
                          onClick={() => { setExpandedMenu(null); setIsOpen(false); }}
                          className={`block rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                            isActive(child.path)
                              ? "bg-teal-500/20 text-teal-300 font-medium"
                              : "text-gray-400 hover:bg-gray-800 hover:text-white"
                          }`}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

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
                    ? "bg-teal-600 text-white shadow-lg shadow-teal-600/30"
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
        <div className="border-t border-gray-800 p-4">
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
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 text-sm font-semibold text-white">
                {user.full_name.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            title={isCollapsed ? "Sign Out" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-gray-400 transition-all duration-200 hover:bg-gray-800 hover:text-white ${
              isCollapsed ? "justify-center px-2" : ""
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
