"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useData } from "@/context/DataContext";

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const { fileName } = useData();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-[60] flex h-16 items-center justify-between border-b bg-white/75 dark:bg-[rgba(7,13,18,0.75)] backdrop-blur-xl border-gray-200 dark:border-white/10 px-4 sm:px-6">
      {/* Left: logo + file name */}
      <div className="flex items-center gap-6">
        <img src="/SVG Lgo.svg" alt="Logo" className="h-7 w-auto flex-shrink-0" />
        {fileName && (
          <span className="hidden sm:inline text-sm text-gray-500 dark:text-[#939393] truncate max-w-[500px]">
            {fileName}
          </span>
        )}
      </div>

      {/* Right: theme toggle */}
      <div className="flex items-center gap-2">

        {mounted ? (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-gray-500 dark:text-[#939393] hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
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
