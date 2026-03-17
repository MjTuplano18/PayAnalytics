"use client";

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { ParsedData, DataRow } from "@/types/data";
import { useAuth } from "@/context/AuthContext";
import { getUpload } from "@/lib/api";

interface DataContextType {
  data: ParsedData | null;
  setData: (data: ParsedData | null) => void;
  rawData: DataRow[];
  setRawData: (data: DataRow[]) => void;
  fileName: string;
  setFileName: (name: string) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  /** The active upload session ID stored in the backend (null = in-memory only) */
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ParsedData | null>(null);
  const [rawData, setRawData] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>("");
  const { token } = useAuth();
  const hydrating = useRef(false);

  // Initialise sessionId from localStorage so it survives page refresh
  const [sessionId, setSessionIdState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sessionId") ?? null;
    }
    return null;
  });

  const setSessionId = (id: string | null) => {
    setSessionIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("sessionId", id);
      } else {
        localStorage.removeItem("sessionId");
      }
    }
  };

  // Auto-hydrate from backend when sessionId exists but in-memory data is missing
  useEffect(() => {
    if (!sessionId || !token || data || hydrating.current) return;
    hydrating.current = true;

    (async () => {
      try {
        const detail = await getUpload(token, sessionId);
        const payments = detail.records.map((r) => ({
          bank: r.bank,
          paymentDate: r.payment_date ?? "",
          paymentAmount: r.payment_amount,
          account: r.account,
          touchpoint: r.touchpoint ?? "",
          environment: r.environment,
        }));

        const bankMap = new Map<string, { totalAmount: number; paymentCount: number; accounts: Set<string> }>();
        const tpMap = new Map<string, { count: number; totalAmount: number }>();
        let totalAmount = 0;
        const allAccounts = new Set<string>();

        for (const p of payments) {
          totalAmount += p.paymentAmount;
          allAccounts.add(p.account);
          if (!bankMap.has(p.bank)) bankMap.set(p.bank, { totalAmount: 0, paymentCount: 0, accounts: new Set() });
          const b = bankMap.get(p.bank)!;
          b.totalAmount += p.paymentAmount;
          b.paymentCount++;
          b.accounts.add(p.account);
          if (!tpMap.has(p.touchpoint)) tpMap.set(p.touchpoint, { count: 0, totalAmount: 0 });
          const t = tpMap.get(p.touchpoint)!;
          t.count++;
          t.totalAmount += p.paymentAmount;
        }

        const bankAnalytics = Array.from(bankMap.entries())
          .map(([bank, d]) => ({
            bank,
            accountCount: d.accounts.size,
            totalAmount: d.totalAmount,
            debtorSum: 0,
            percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0,
            paymentCount: d.paymentCount,
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount);

        const touchpointAnalytics = Array.from(tpMap.entries())
          .map(([touchpoint, d]) => ({
            touchpoint,
            count: d.count,
            totalAmount: d.totalAmount,
            percentage: totalAmount > 0 ? (d.totalAmount / totalAmount) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count);

        setData({
          payments,
          bankAnalytics,
          touchpointAnalytics,
          totalAccounts: allAccounts.size,
          totalAmount,
          totalPayments: payments.length,
          raw: [],
        });
        setFileName(detail.file_name);
      } catch {
        // Session may have been deleted — clear stale sessionId
        setSessionId(null);
      } finally {
        hydrating.current = false;
      }
    })();
  }, [sessionId, token, data]);

  return (
    <DataContext.Provider
      value={{ data, setData, rawData, setRawData, fileName, setFileName, globalSearchQuery, setGlobalSearchQuery, sessionId, setSessionId }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
