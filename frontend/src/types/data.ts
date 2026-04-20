export interface DataRow {
  [key: string]: string | number | Date;
}

export interface PaymentRecord {
  id?: string;
  bank: string;
  paymentDate: string;
  paymentAmount: number;
  account: string; // debtor_id
  touchpoint: string; // TAGGING
  environment?: string;
}

export interface BankAnalytics {
  bank: string;
  accountCount: number;
  totalAmount: number;
  debtorSum: number;
  percentage: number;
  paymentCount: number;
}

export interface TouchpointAnalytics {
  touchpoint: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

export interface ParsedData {
  payments: PaymentRecord[];
  bankAnalytics: BankAnalytics[];
  touchpointAnalytics: TouchpointAnalytics[];
  totalAccounts: number;
  totalAmount: number;
  totalPayments: number;
  raw: DataRow[];
}

export type ChartType = "bar" | "line" | "pie" | "area" | "barh";

export interface FilterOptions {
  startDate?: string;
  endDate?: string;
  environment?: string;
  bank?: string;
  touchpoint?: string;
  minValue?: number;
  maxValue?: number;
}
