import * as XLSX from "xlsx";
import {
  ParsedData,
  DataRow,
  PaymentRecord,
  BankAnalytics,
  TouchpointAnalytics,
} from "@/types/data";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

function validateFile(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 10MB limit.");
  }
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Invalid file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`
    );
  }
}

/** Find column key by matching patterns (case-insensitive) */
function findColumn(
  keys: string[],
  patterns: string[]
): string | undefined {
  return keys.find((k) => {
    const lower = k.toLowerCase();
    return patterns.some((p) => lower.includes(p));
  });
}

/** Convert Excel serial date number to a readable date string */
function formatDate(value: unknown): string {
  if (typeof value === "number" && value > 30000 && value < 100000) {
    // Excel serial date
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  return String(value || "");
}

export function parseExcelFile(file: File): Promise<ParsedData> {
  validateFile(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("Failed to read file"));
          return;
        }
        const workbook = XLSX.read(data, { type: "array" });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          reject(new Error("No sheets found in the workbook"));
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: DataRow[] = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          reject(new Error("The uploaded file contains no data"));
          return;
        }

        const parsedData = categorizePaymentData(jsonData);
        resolve(parsedData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read the file"));
    reader.readAsArrayBuffer(file);
  });
}

function categorizePaymentData(data: DataRow[]): ParsedData {
  const keys = data.length > 0 ? Object.keys(data[0]) : [];

  const bankCol = findColumn(keys, ["bank"]);
  const dateCol = findColumn(keys, [
    "leads_result_edate",
    "payment date",
    "edate",
    "date",
  ]);
  const amountCol = findColumn(keys, [
    "leads_result_amount",
    "payment amount",
    "amount",
  ]);
  const accountCol = findColumn(keys, ["debtor_id", "account", "debtor"]);
  const touchpointCol = findColumn(keys, ["tagging", "touchpoint", "tag"]);
  const envCol = findColumn(keys, ["environment", "env"]);

  const payments: PaymentRecord[] = data.map((row) => ({
    bank: bankCol ? String(row[bankCol] || "Unknown") : "Unknown",
    paymentDate: dateCol ? formatDate(row[dateCol]) : "",
    paymentAmount: amountCol ? Number(row[amountCol]) || 0 : 0,
    account: accountCol ? String(row[accountCol] || "") : "",
    touchpoint: touchpointCol
      ? String(row[touchpointCol] || "NO TOUCHPOINT")
      : "NO TOUCHPOINT",
    environment: envCol ? String(row[envCol] || "") : undefined,
  }));

  return computeAnalytics(payments, data);
}

function computeAnalytics(
  payments: PaymentRecord[],
  raw: DataRow[]
): ParsedData {
  const totalAmount = payments.reduce((s, p) => s + p.paymentAmount, 0);
  const uniqueAccounts = new Set(payments.map((p) => p.account));

  // Bank analytics
  const bankMap = new Map<
    string,
    { accounts: Set<string>; amount: number; debtorIds: number; count: number }
  >();
  for (const p of payments) {
    if (!bankMap.has(p.bank)) {
      bankMap.set(p.bank, {
        accounts: new Set(),
        amount: 0,
        debtorIds: 0,
        count: 0,
      });
    }
    const entry = bankMap.get(p.bank)!;
    entry.accounts.add(p.account);
    entry.amount += p.paymentAmount;
    entry.debtorIds += Number(p.account) || 0;
    entry.count++;
  }

  const bankAnalytics: BankAnalytics[] = Array.from(bankMap.entries())
    .map(([bank, d]) => ({
      bank,
      accountCount: d.accounts.size,
      totalAmount: d.amount,
      debtorSum: d.debtorIds,
      percentage: totalAmount > 0 ? (d.amount / totalAmount) * 100 : 0,
      paymentCount: d.count,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // Touchpoint analytics
  const tpMap = new Map<string, { count: number; amount: number }>();
  for (const p of payments) {
    const tp = p.touchpoint || "NO TOUCHPOINT";
    if (!tpMap.has(tp)) tpMap.set(tp, { count: 0, amount: 0 });
    const entry = tpMap.get(tp)!;
    entry.count++;
    entry.amount += p.paymentAmount;
  }

  const touchpointAnalytics: TouchpointAnalytics[] = Array.from(
    tpMap.entries()
  )
    .map(([touchpoint, d]) => ({
      touchpoint,
      count: d.count,
      totalAmount: d.amount,
      percentage: totalAmount > 0 ? (d.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    payments,
    bankAnalytics,
    touchpointAnalytics,
    totalAccounts: uniqueAccounts.size,
    totalAmount,
    totalPayments: payments.length,
    raw,
  };
}

/* ── Real bank & tag names from the dataset ── */

const BANKS = [
  "MBTC P1",
  "MBTC P2",
  "MBTC APR",
  "MBTC P4",
  "SBC PL RECOV L1",
  "SBF PL",
  "SBC CARDS RECOV L1",
  "SBC CARDS & LOAN L6",
  "SBF SALAD",
  "EWB",
  "UBP RECOV BLUE",
  "UBP RECOV NEWLY",
  "UBP RECOV OLD1",
  "UBP RECOV YOUNG MODEL",
  "UBP SEEKCAP",
  "BANKARD",
  "RCBC",
  "MBTC P90",
  "UBP COMBANK RMG",
  "HSBC UAE",
  "ENBD",
  "UBP RECOV PL1",
  "UBP SME 90DPD",
  "UBP SF RECOV",
  "UBP SF ECA",
  "MBTC PA",
  "EIB",
  "UBP HOME MORTGAGE",
  "MBTC CARDS REST",
];

const TAGS = [
  "GHOST PAYMENT",
  "OB CALL",
  "OB EMAIL",
  "NO TOUCHPOINT",
  "OB SMS",
  "EMAIL",
  "IB EMAIL",
  "SMS",
  "OB VIBER",
  "IB VIBER",
  "IB SMS",
  "IB CALL",
  "SKIPTRACE",
  "VIBER",
  "OB SKIPTRACE",
  "CALL",
  "OB FIELD",
  "IB FIELD",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockData(): ParsedData {
  const payments: PaymentRecord[] = [];
  const numRecords = 500;

  for (let i = 0; i < numRecords; i++) {
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    const dateStr = `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const bank = randomItem(BANKS);
    const amount = Math.round((Math.random() * 50000 + 500) * 100) / 100;
    const account = String(100000 + Math.floor(Math.random() * 900000));

    payments.push({
      bank,
      paymentDate: dateStr,
      paymentAmount: amount,
      account,
      touchpoint: randomItem(TAGS),
      environment: "ENV1",
    });
  }

  const raw: DataRow[] = payments.map((p) => ({
    Bank: p.bank,
    leads_result_edate: p.paymentDate,
    leads_result_amount: p.paymentAmount,
    debtor_id: p.account,
    TAGGING: p.touchpoint,
    Environment: p.environment || "ENV1",
  }));

  return computeAnalytics(payments, raw);
}
