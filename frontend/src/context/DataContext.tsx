"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ParsedData, DataRow } from "@/types/data";

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
