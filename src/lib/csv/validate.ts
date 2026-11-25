import Papa from "papaparse";
import type { SceneJson } from "@/lib/designer/scene";
import { fitTextToBox } from "@/lib/designer/fitting";

export const MAX_CSV_ROWS = 2000;

export interface CsvRowError {
  rowIndex: number; // 1-based data row index
  field: string;
  reason: string;
}

export interface ValidatedCsvResult {
  headers: string[];
  totalRows: number;
  validRows: Array<{
    rowIndex: number;
    values: Record<string, string>;
  }>;
  errorReport: CsvRowError[];
}

/**
 * Validates a CSV string against a Scene JSON template's placeholders (§9.2):
 * - Header check & required columns
 * - Max row limit
 * - Empty rows & missing required values
 * - Duplicate `number` check
 * - Per-placeholder fitting check (shrink-to-fit / tracking / "text too long")
 */
export function validateCsvForScene(
  csvText: string,
  scene: SceneJson,
  requiredColumns: string[] = ["number"]
): ValidatedCsvResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const headers = parsed.meta.fields ?? [];
  const errorReport: CsvRowError[] = [];

  for (const req of requiredColumns) {
    if (!headers.includes(req.toLowerCase())) {
      errorReport.push({
        rowIndex: 0,
        field: req,
        reason: `Missing required CSV column "${req}".`,
      });
    }
  }

  if (errorReport.length > 0) {
    return {
      headers,
      totalRows: parsed.data.length,
      validRows: [],
      errorReport,
    };
  }

  if (parsed.data.length > MAX_CSV_ROWS) {
    return {
      headers,
      totalRows: parsed.data.length,
      validRows: [],
      errorReport: [
        {
          rowIndex: 0,
          field: "file",
          reason: `CSV exceeds maximum row limit of ${MAX_CSV_ROWS}.`,
        },
      ],
    };
  }

  const seenNumbers = new Set<string>();
  const validRows: ValidatedCsvResult["validRows"] = [];

  const textPlaceholders = scene.objects.filter(
    (o) => o.type === "text" && o.placeholderKey
  );

  parsed.data.forEach((rawRow, idx) => {
    const rowIndex = idx + 1;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      values[k] = typeof v === "string" ? v.trim() : "";
    }

    const isEmptyRow = Object.values(values).every((v) => v === "");
    if (isEmptyRow) {
      errorReport.push({
        rowIndex,
        field: "row",
        reason: "Empty row",
      });
      return;
    }

    let rowHasError = false;

    for (const req of requiredColumns) {
      const val = values[req.toLowerCase()] ?? "";
      if (!val) {
        errorReport.push({
          rowIndex,
          field: req,
          reason: `Missing required value for "${req}"`,
        });
        rowHasError = true;
      }
    }

    const numVal = values["number"];
    if (numVal) {
      if (seenNumbers.has(numVal)) {
        errorReport.push({
          rowIndex,
          field: "number",
          reason: `Duplicate number "${numVal}"`,
        });
        rowHasError = true;
      } else {
        seenNumbers.add(numVal);
      }
    }

    // Per-placeholder fitting check
    for (const obj of textPlaceholders) {
      if (obj.type !== "text" || !obj.placeholderKey) continue;
      const cellVal = values[obj.placeholderKey.toLowerCase()];
      if (cellVal === undefined) continue;

      const fitCfg = obj.fit ?? {
        mode: "shrink_to_fit" as const,
        minPt: 8,
        maxPt: obj.fontSizePt,
        minTracking: -60,
      };

      const fitRes = fitTextToBox({
        text: cellVal,
        boxWidthMm: obj.w,
        boxHeightMm: obj.h,
        minPt: fitCfg.minPt,
        maxPt: fitCfg.maxPt,
        minTracking: fitCfg.minTracking,
        fitMode: fitCfg.mode,
      });

      if (!fitRes.fits) {
        errorReport.push({
          rowIndex,
          field: obj.placeholderKey,
          reason: fitRes.error ?? "text too long",
        });
        rowHasError = true;
      }
    }

    if (!rowHasError) {
      validRows.push({ rowIndex, values });
    }
  });

  return {
    headers,
    totalRows: parsed.data.length,
    validRows,
    errorReport,
  };
}
