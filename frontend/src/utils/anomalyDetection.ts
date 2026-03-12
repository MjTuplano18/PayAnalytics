import { PaymentRecord } from "@/types/data";

export interface Anomaly {
  type: "high_amount" | "duplicate" | "spike" | "zero_amount" | "future_date";
  severity: "warning" | "critical";
  message: string;
  records: PaymentRecord[];
  count: number;
}

/** Detect outlier amounts using IQR method */
function detectHighAmountOutliers(payments: PaymentRecord[]): Anomaly | null {
  if (payments.length < 10) return null;
  const amounts = payments.map((p) => p.paymentAmount).sort((a, b) => a - b);
  const q1 = amounts[Math.floor(amounts.length * 0.25)];
  const q3 = amounts[Math.floor(amounts.length * 0.75)];
  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;
  const outliers = payments.filter((p) => p.paymentAmount > upperFence && p.paymentAmount > 0);
  if (outliers.length === 0) return null;
  return {
    type: "high_amount",
    severity: outliers.length > payments.length * 0.05 ? "critical" : "warning",
    message: `${outliers.length} transaction${outliers.length > 1 ? "s" : ""} with unusually high amounts (above ₱${Math.round(upperFence).toLocaleString()})`,
    records: outliers.slice(0, 20),
    count: outliers.length,
  };
}

/** Detect potential duplicate entries (same account + date + amount) */
function detectDuplicates(payments: PaymentRecord[]): Anomaly | null {
  const seen = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const key = `${p.account}|${p.paymentDate}|${p.paymentAmount}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(p);
  }
  const dupes = Array.from(seen.values()).filter((g) => g.length > 1);
  const totalDupes = dupes.reduce((s, g) => s + g.length - 1, 0);
  if (totalDupes === 0) return null;
  return {
    type: "duplicate",
    severity: totalDupes > 50 ? "critical" : "warning",
    message: `${totalDupes} potential duplicate record${totalDupes > 1 ? "s" : ""} found (same account, date & amount)`,
    records: dupes.flatMap((g) => g.slice(1)).slice(0, 20),
    count: totalDupes,
  };
}

/** Detect sudden spikes in daily payment volume */
function detectSpikes(payments: PaymentRecord[]): Anomaly | null {
  if (payments.length < 30) return null;
  const dailyMap = new Map<string, number>();
  for (const p of payments) {
    const d = p.paymentDate.slice(0, 10);
    if (d) dailyMap.set(d, (dailyMap.get(d) || 0) + p.paymentAmount);
  }
  const dailyAmounts = Array.from(dailyMap.values());
  if (dailyAmounts.length < 5) return null;
  const mean = dailyAmounts.reduce((s, v) => s + v, 0) / dailyAmounts.length;
  const stdDev = Math.sqrt(dailyAmounts.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyAmounts.length);
  if (stdDev === 0) return null;
  const threshold = mean + 3 * stdDev;
  const spikeDays = Array.from(dailyMap.entries()).filter(([, v]) => v > threshold);
  if (spikeDays.length === 0) return null;
  const spikeRecords = payments.filter((p) => spikeDays.some(([d]) => p.paymentDate.startsWith(d)));
  return {
    type: "spike",
    severity: "warning",
    message: `${spikeDays.length} day${spikeDays.length > 1 ? "s" : ""} with abnormal payment volume spikes detected`,
    records: spikeRecords.slice(0, 20),
    count: spikeDays.length,
  };
}

/** Detect zero-amount transactions */
function detectZeroAmounts(payments: PaymentRecord[]): Anomaly | null {
  const zeros = payments.filter((p) => p.paymentAmount === 0);
  if (zeros.length === 0) return null;
  return {
    type: "zero_amount",
    severity: zeros.length > payments.length * 0.1 ? "critical" : "warning",
    message: `${zeros.length} transaction${zeros.length > 1 ? "s" : ""} with zero payment amount`,
    records: zeros.slice(0, 20),
    count: zeros.length,
  };
}

/** Detect future-dated transactions */
function detectFutureDates(payments: PaymentRecord[]): Anomaly | null {
  const today = new Date().toISOString().slice(0, 10);
  const future = payments.filter((p) => p.paymentDate > today && p.paymentDate !== "");
  if (future.length === 0) return null;
  return {
    type: "future_date",
    severity: "warning",
    message: `${future.length} transaction${future.length > 1 ? "s" : ""} dated in the future`,
    records: future.slice(0, 20),
    count: future.length,
  };
}

export function detectAnomalies(payments: PaymentRecord[]): Anomaly[] {
  if (!payments || payments.length === 0) return [];
  const results: Anomaly[] = [];
  const highAmount = detectHighAmountOutliers(payments);
  if (highAmount) results.push(highAmount);
  const dupes = detectDuplicates(payments);
  if (dupes) results.push(dupes);
  const spikes = detectSpikes(payments);
  if (spikes) results.push(spikes);
  const zeros = detectZeroAmounts(payments);
  if (zeros) results.push(zeros);
  const future = detectFutureDates(payments);
  if (future) results.push(future);
  return results.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
}
