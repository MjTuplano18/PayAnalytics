import ExcelJS from "exceljs";
import { DataRow } from "@/types/data";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 100);
}

export async function exportToExcel(
  data: DataRow[],
  fileName: string = "report"
): Promise<void> {
  if (data.length === 0) return;
  const safeName = sanitizeFileName(fileName);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  const keys = Object.keys(data[0]);
  worksheet.columns = keys.map((key) => ({ header: key, key }));
  worksheet.addRows(data as Record<string, string | number | Date>[]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${safeName}.xlsx`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCSV(
  data: DataRow[],
  fileName: string = "report"
): void {
  if (data.length === 0) return;
  const safeName = sanitizeFileName(fileName);
  const keys = Object.keys(data[0]);

  const escapeCell = (val: unknown): string => {
    const str = String(val ?? "");
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const csvRows = [
    keys.map(escapeCell).join(","),
    ...data.map((row) => keys.map((k) => escapeCell(row[k])).join(",")),
  ];
  const csv = csvRows.join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${safeName}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF(
  elementId: string,
  fileName: string = "report"
): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  // Use textContent-based approach to avoid XSS via innerHTML
  const printWindow = window.open("", "", "height=600,width=800");
  if (!printWindow) return;

  const safeTitle = document.createTextNode(sanitizeFileName(fileName));
  printWindow.document.title = safeTitle.textContent || "Report";

  const style = printWindow.document.createElement("style");
  style.textContent =
    "body { font-family: Arial, sans-serif; padding: 20px; }";
  printWindow.document.head.appendChild(style);

  // Clone the element to avoid XSS instead of using innerHTML
  const clonedContent = element.cloneNode(true);
  printWindow.document.body.appendChild(clonedContent);
  printWindow.print();
}
