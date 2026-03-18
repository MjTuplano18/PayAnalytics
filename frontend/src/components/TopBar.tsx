"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, Sun, Moon, X, CheckCircle2, XCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { useSidebar } from "@/context/SidebarContext";
import { useData } from "@/context/DataContext";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

interface SearchResult {
  type: "transaction" | "bank" | "account" | "page";
  title: string;
  subtitle?: string;
  action: () => void;
}

export function TopBar() {
  const { toggle } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { fileName, data, setGlobalSearchQuery } = useData();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [syncStatus, setSyncStatus] = useState<"synced" | "error" | "checking">("checking");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Health check polling
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`, { method: "GET" });
        setSyncStatus(res.ok ? "synced" : "error");
      } catch {
        setSyncStatus("error");
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown and collapse search when clicking outside (preserve text)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const performSearch = (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const searchResults: SearchResult[] = [];

    // Page navigation results
    const pageMatches = [
      { name: "Dashboard", path: "/dashboard" },
      { name: "Transactions", path: "/transactions" },
      { name: "Accounts", path: "/customers" },
      { name: "Customers", path: "/customers" },
      { name: "Reports", path: "/reports" },
      { name: "Upload Data", path: "/upload" },
    ];

    pageMatches.forEach((page) => {
      if (page.name.toLowerCase().includes(q)) {
        searchResults.push({
          type: "page",
          title: page.name,
          action: () => router.push(page.path),
        });
      }
    });

    // Search through actual data
    if (data?.payments) {
      // Search transactions (by amount, account, bank, touchpoint)
      const transactionMatches = new Set<string>();
      data.payments.forEach((p) => {
        if (
          p.paymentAmount.toString().includes(q) ||
          p.account.toLowerCase().includes(q) ||
          p.bank.toLowerCase().includes(q) ||
          p.touchpoint.toLowerCase().includes(q) ||
          p.paymentDate.includes(q)
        ) {
          transactionMatches.add(
            `${p.bank} - ₱${p.paymentAmount.toLocaleString()}`
          );
        }
      });

      transactionMatches.forEach((match) => {
        searchResults.push({
          type: "transaction",
          title: match,
          subtitle: "Transaction",
          action: () => {
            setGlobalSearchQuery(q);
            router.push("/transactions");
            setShowResults(false);
          },
        });
      });

      // Search banks
      const bankMatches = new Set<string>();
      const bankAmounts = new Map<string, number>();
      data.payments.forEach((p) => {
        if (p.bank.toLowerCase().includes(q)) {
          bankMatches.add(p.bank);
          bankAmounts.set(p.bank, (bankAmounts.get(p.bank) || 0) + p.paymentAmount);
        }
      });

      bankMatches.forEach((bank) => {
        searchResults.push({
          type: "bank",
          title: bank,
          subtitle: `₱${(bankAmounts.get(bank) || 0).toLocaleString()}`,
          action: () => {
            setGlobalSearchQuery(bank);
            router.push("/transactions");
            setShowResults(false);
          },
        });
      });

      // Search accounts
      const accountMatches = new Set<string>();
      data.payments.forEach((p) => {
        if (p.account.toLowerCase().includes(q)) {
          accountMatches.add(p.account);
        }
      });

      accountMatches.forEach((account) => {
        searchResults.push({
          type: "account",
          title: `Account: ${account}`,
          subtitle: "Account",
          action: () => {
            setGlobalSearchQuery(account);
            router.push("/transactions");
            setShowResults(false);
          },
        });
      });
    }

    // Limit results to 12
    setResults(searchResults.slice(0, 12));
    setShowResults(searchResults.length > 0);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    performSearch(value);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (results.length > 0) {
      results[0].action();
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "page":
        return "📄";
      case "transaction":
        return "💳";
      case "bank":
        return "🏦";
      case "account":
        return "👤";
      default:
        return "🔍";
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 px-4 sm:px-8">
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
          <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400 truncate max-w-[500px]">
            {fileName}
          </span>
        )}
      </div>

      {/* Right: sync indicator + search icon + theme toggle */}
      <div className="flex items-center gap-2" ref={searchRef}>
        {/* Sync status indicator */}
        <div
          className={`hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            syncStatus === "synced"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : syncStatus === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-500"
                : "border-gray-400/30 bg-gray-400/10 text-gray-400"
          }`}
        >
          {syncStatus === "synced" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : syncStatus === "error" ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {syncStatus === "synced" ? "Synced" : syncStatus === "error" ? "Not Synced" : "Checking"}
        </div>

        {/* Expandable search */}
        <div className="relative flex items-center">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="relative">
              <div className="relative flex items-center">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search pages, transactions, accounts..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchQuery && setShowResults(true)}
                  className="w-64 sm:w-80 rounded-lg border bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 py-2 pl-10 pr-9 text-sm text-gray-900 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all duration-200"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setShowResults(false);
                      setResults([]);
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Search Results Dropdown */}
              {showResults && results.length > 0 && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  {(() => {
                    const grouped: Record<string, SearchResult[]> = {};
                    results.forEach((result) => {
                      if (!grouped[result.type]) grouped[result.type] = [];
                      grouped[result.type].push(result);
                    });

                    const order = ["page", "bank", "account", "transaction"];
                    const typeLabels: Record<string, string> = {
                      page: "Pages",
                      bank: "Banks",
                      account: "Accounts",
                      transaction: "Transactions",
                    };

                    return order.map(
                      (type) =>
                        grouped[type] && (
                          <div key={type}>
                            <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                              {typeLabels[type]}
                            </div>
                            {grouped[type].map((result, idx) => (
                              <button
                                key={`${type}-${idx}`}
                                onClick={result.action}
                                className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-lg">{getResultIcon(type)}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                      {result.title}
                                    </div>
                                    {result.subtitle && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {result.subtitle}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )
                    );
                  })()}
                </div>
              )}

              {showResults && results.length === 0 && searchQuery && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No results found
                </div>
              )}
            </form>
          ) : (
            <button
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => {
                  searchInputRef.current?.focus();
                  if (searchQuery) performSearch(searchQuery);
                }, 50);
              }}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              aria-label="Open search"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
        </div>

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
