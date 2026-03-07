import * as XLSX from "xlsx";
import { DataRow } from "@/types/data";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 100);
}

export function exportToExcel(
  data: DataRow[],
  fileName: string = "report"
): void {
  const safeName = sanitizeFileName(fileName);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  XLSX.writeFile(workbook, `${safeName}.xlsx`);
}

export function exportToCSV(
  data: DataRow[],
  fileName: string = "report"
): void {
  const safeName = sanitizeFileName(fileName);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(worksheet);

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
