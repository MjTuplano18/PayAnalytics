"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { ParsedData, DataRow } from "@/types/data";

interface DataContextType {
  data: ParsedData | null;
  setData: (data: ParsedData) => void;
  rawData: DataRow[];
  setRawData: (data: DataRow[]) => void;
  fileName: string;
  setFileName: (name: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ParsedData | null>(null);
  const [rawData, setRawData] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState<string>("");

  return (
    <DataContext.Provider
      value={{ data, setData, rawData, setRawData, fileName, setFileName }}
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
