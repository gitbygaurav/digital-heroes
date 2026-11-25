import type { ProductType } from "@/types/catalogue";

/**
 * Deterministic print-file naming convention (PRD §9.3):
 *   OrderID_ProductType_Date_Output(.ext)
 *   e.g. /print-files/DH-000123/DH-000123_RaceNumber_2026-03-14_Output_0001.pdf
 */
export function buildPrintFileName(params: {
  orderNumber: string;
  productType: ProductType | string;
  dateIso?: string;
  extension: "pdf" | "png" | "zip";
  rowIndex?: number;
}): string {
  const datePart = (params.dateIso ?? new Date().toISOString()).slice(0, 10);
  const base = `${params.orderNumber}_${params.productType}_${datePart}_Output`;

  if (typeof params.rowIndex === "number" && params.rowIndex > 0) {
    const padded = String(params.rowIndex).padStart(4, "0");
    return `${base}_${padded}.${params.extension}`;
  }

  return `${base}.${params.extension}`;
}

export function buildPrintStoragePath(params: {
  orderNumber: string;
  fileName: string;
}): string {
  return `${params.orderNumber}/${params.fileName}`;
}
