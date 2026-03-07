"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSidebar } from "@/context/SidebarContext";
import { useData } from "@/context/DataContext";

export function TopBar() {
  const { toggle } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { fileName } = useData();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.toLowerCase().trim();
    if (query.includes("dashboard")) router.push("/dashboard");
    else if (query.includes("transaction")) router.push("/transactions");
    else if (query.includes("account") || query.includes("customer"))
      router.push("/customers");
    else if (query.includes("report")) router.push("/reports");
    else if (query.includes("upload")) router.push("/upload");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 px-4 sm:px-8">
      {/* Left: hamburger + file name */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        {fileName && (
          <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
            {fileName}
          </span>
        )}
      </div>

      {/* Center: search */}
      <form
        onSubmit={handleSearch}
        className="hidden sm:flex items-center flex-1 max-w-md mx-4"
      >
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </form>

      {/* Right: theme toggle */}
      <div className="flex items-center gap-2">
        {mounted ? (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
      </div>
    </header>
  );
}
