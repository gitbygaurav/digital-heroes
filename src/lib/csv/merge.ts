import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import type { SceneJson } from "@/lib/designer/scene";
import { renderSceneToPrintFiles } from "@/lib/render/pipeline";
import { buildPrintFileName } from "@/lib/render/naming";
import type { ProductType } from "@/types/catalogue";

export interface MergedRowFile {
  rowIndex: number;
  fileName: string;
  pdfBuffer: Buffer;
}

/**
 * Applies a CSV row's values into a Scene JSON's matching placeholders.
 */
export function applyRowToScene(
  baseScene: SceneJson,
  rowValues: Record<string, string>
): SceneJson {
  return {
    ...baseScene,
    objects: baseScene.objects.map((obj) => {
      if (obj.type === "text" && obj.placeholderKey) {
        const key = obj.placeholderKey.toLowerCase();
        if (rowValues[key] !== undefined) {
          return { ...obj, text: rowValues[key] };
        }
      }
      return obj;
    }),
  };
}

/**
 * Processes a chunk of validated CSV rows into per-row print-ready PDFs (Decision D15).
 */
export async function processCsvChunk(params: {
  orderNumber: string;
  productType: ProductType | string;
  baseScene: SceneJson;
  rows: Array<{ rowIndex: number; values: Record<string, string> }>;
  dpi?: number;
}): Promise<MergedRowFile[]> {
  const results: MergedRowFile[] = [];

  for (const row of params.rows) {
    const rowScene = applyRowToScene(params.baseScene, row.values);
    const { pdfBuffer } = await renderSceneToPrintFiles(
      rowScene,
      params.dpi ?? 300
    );
    const fileName = buildPrintFileName({
      orderNumber: params.orderNumber,
      productType: params.productType,
      extension: "pdf",
      rowIndex: row.rowIndex,
    });

    results.push({
      rowIndex: row.rowIndex,
      fileName,
      pdfBuffer,
    });
  }

  return results;
}

/**
 * Packages generated print files into a single ZIP buffer using archiver.
 */
export async function packageFilesAsZip(
  files: Array<{ fileName: string; buffer: Buffer }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", reject);
    archive.pipe(stream);

    for (const f of files) {
      archive.append(f.buffer, { name: f.fileName });
    }

    void archive.finalize();
  });
}
