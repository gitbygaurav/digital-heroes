import { Resvg } from "@resvg/resvg-js";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import type { SceneJson } from "@/lib/designer/scene";
import { sceneToSvg } from "@/lib/render/svg";

const MM_TO_PT = 72 / 25.4;
const MM_TO_INCH = 1 / 25.4;

export interface RenderOutput {
  svg: string;
  pngBuffer: Buffer;
  pdfBuffer: Buffer;
  widthPx: number;
  heightPx: number;
}

/**
 * Server-side Print-File Render Pipeline (PRD §9.1):
 * Scene JSON -> SVG (mm, bleed expanded) -> PNG (resvg at target DPI) + Vector PDF (pdfkit + svg-to-pdfkit).
 */
export async function renderSceneToPrintFiles(
  scene: SceneJson,
  dpi = 300
): Promise<RenderOutput> {
  const totalWmm = scene.canvas.width + scene.canvas.bleed * 2;
  const totalHmm = scene.canvas.height + scene.canvas.bleed * 2;

  const widthPx = Math.round(totalWmm * MM_TO_INCH * dpi);
  const heightPx = Math.round(totalHmm * MM_TO_INCH * dpi);

  const svg = sceneToSvg(scene, { includeCropMarks: false });

  // 1. High-res PNG via @resvg/resvg-js
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  // 2. Vector PDF via pdfkit + svg-to-pdfkit
  const widthPt = totalWmm * MM_TO_PT;
  const heightPt = totalHmm * MM_TO_PT;

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [widthPt, heightPt],
      margin: 0,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    SVGtoPDF(doc, svg, 0, 0, {
      width: widthPt,
      height: heightPt,
      preserveAspectRatio: "xMidYMid meet",
    });

    doc.end();
  });

  return {
    svg,
    pngBuffer,
    pdfBuffer,
    widthPx,
    heightPx,
  };
}
