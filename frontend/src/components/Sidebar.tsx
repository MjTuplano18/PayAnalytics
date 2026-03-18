"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
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
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r bg-gray-900 border-gray-800 transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isCollapsed ? "w-20" : "w-64"
        } ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Toggle button + Logo */}
        <div className={`flex items-center p-4 ${isCollapsed ? "justify-center" : "justify-between px-5"}`}>
          {!isCollapsed && (
            <>
              <Image
                src="/logo.svg"
                alt="PayAnalytics Logo"
                width={26}
                height={26}
                className="flex-shrink-0"
              />
              <h1 className="text-xl font-bold bg-gradient-to-r from-teal-400 to-cyan-300 bg-clip-text text-transparent">
                PayAnalytics
              </h1>
              <button
                onClick={toggleCollapsed}
                className="flex-shrink-0 rounded-lg p-1.5 transition-colors duration-200 text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft className="h-5 w-5" />
              </button>
            </>
          )}
          {isCollapsed && (
            <button
              onClick={toggleCollapsed}
              className="rounded-lg p-1.5 transition-colors duration-200 text-gray-400 hover:bg-gray-800 hover:text-white"
              aria-label="Expand sidebar"
            >
              <ChevronsRight className="h-5 w-5" />
            </button>
          )}
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
