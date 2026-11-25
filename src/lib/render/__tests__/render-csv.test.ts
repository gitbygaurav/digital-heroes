import { describe, expect, it } from "vitest";
import { buildPrintFileName } from "@/lib/render/naming";
import { sceneToSvg } from "@/lib/render/svg";
import { renderSceneToPrintFiles } from "@/lib/render/pipeline";
import { validateCsvForScene } from "@/lib/csv/validate";
import { packageFilesAsZip, processCsvChunk } from "@/lib/csv/merge";
import { DEFAULT_TEMPLATES } from "@/lib/designer/templates";

describe("Print-File & CSV Variable-Data Engine (§9)", () => {
  const raceScene = DEFAULT_TEMPLATES.RaceNumber.scene;

  it("formats deterministic print file names with zero-padded CSV row indices", () => {
    const single = buildPrintFileName({
      orderNumber: "DH-000123",
      productType: "RaceNumber",
      dateIso: "2026-03-14T00:00:00Z",
      extension: "pdf",
    });
    expect(single).toBe("DH-000123_RaceNumber_2026-03-14_Output.pdf");

    const row = buildPrintFileName({
      orderNumber: "DH-000123",
      productType: "RaceNumber",
      dateIso: "2026-03-14T00:00:00Z",
      extension: "pdf",
      rowIndex: 7,
    });
    expect(row).toBe("DH-000123_RaceNumber_2026-03-14_Output_0007.pdf");
  });

  it("renders Scene JSON into bleed-expanded SVG, PNG, and PDF", async () => {
    const svg = sceneToSvg(raceScene);
    expect(svg).toContain('width="216mm"'); // 210 + 3*2 bleed
    expect(svg).toContain('height="156mm"');

    const output = await renderSceneToPrintFiles(raceScene, 150);
    expect(output.pngBuffer.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(output.pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("validates CSV rows and reports missing numbers, duplicates, and over-long text", () => {
    const csv = [
      "number,name",
      "101,Aarav Sharma",
      ",Missing Number",
      "101,Duplicate Number",
      "102,Meera Patel",
    ].join("\n");

    const res = validateCsvForScene(csv, raceScene, ["number"]);
    expect(res.totalRows).toBe(4);
    expect(res.validRows.length).toBe(2);
    expect(res.errorReport.length).toBe(2);
  });

  it("processes a CSV chunk and packages per-row PDFs into a ZIP", async () => {
    const rows = [
      { rowIndex: 1, values: { number: "101", name: "Aarav Sharma" } },
      { rowIndex: 2, values: { number: "102", name: "Meera Patel" } },
    ];

    const chunk = await processCsvChunk({
      orderNumber: "DH-000999",
      productType: "RaceNumber",
      baseScene: raceScene,
      rows,
      dpi: 150,
    });

    expect(chunk).toHaveLength(2);
    expect(chunk[0].fileName).toContain("_Output_0001.pdf");
    expect(chunk[1].fileName).toContain("_Output_0002.pdf");

    const zip = await packageFilesAsZip(
      chunk.map((c) => ({ fileName: c.fileName, buffer: c.pdfBuffer }))
    );
    expect(zip.subarray(0, 2).toString("ascii")).toBe("PK");
  });
});
