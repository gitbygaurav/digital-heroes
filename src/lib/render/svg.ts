import type { SceneJson, SceneTextObject } from "@/lib/designer/scene";
import { fitTextToBox } from "@/lib/designer/fitting";

const PT_TO_MM = 0.352778;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Renders a Scene JSON into a print-ready SVG in millimetre units with bleed expanded (PRD §9.1).
 * Applies the shared placeholder fitting algorithm to every text object.
 */
export function sceneToSvg(
  scene: SceneJson,
  options: { includeCropMarks?: boolean } = {}
): string {
  const bleed = scene.canvas.bleed;
  const totalW = scene.canvas.width + bleed * 2;
  const totalH = scene.canvas.height + bleed * 2;

  const elements: string[] = [];

  // White substrate background covering full bleed box
  elements.push(
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#FFFFFF" />`
  );

  for (const obj of scene.objects) {
    if (obj.type === "text") {
      elements.push(renderTextObject(obj, bleed));
    }
  }

  if (options.includeCropMarks) {
    elements.push(
      `<rect x="${bleed}" y="${bleed}" width="${scene.canvas.width}" height="${scene.canvas.height}" fill="none" stroke="#0B0B1A" stroke-width="0.25" stroke-dasharray="2 2" />`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">`,
    ...elements,
    `</svg>`,
  ].join("\n");
}

function renderTextObject(obj: SceneTextObject, bleedMm: number): string {
  let fontSizePt = obj.fontSizePt;
  let tracking = obj.tracking;

  if (obj.fit) {
    const fitted = fitTextToBox({
      text: obj.text,
      boxWidthMm: obj.w,
      boxHeightMm: obj.h,
      minPt: obj.fit.minPt,
      maxPt: obj.fit.maxPt,
      minTracking: obj.fit.minTracking,
      fitMode: obj.fit.mode,
    });
    fontSizePt = fitted.fontSizePt;
    tracking = fitted.tracking;
  }

  const fontSizeMm = Number((fontSizePt * PT_TO_MM).toFixed(3));
  const letterSpacingEm = Number((tracking / 1000).toFixed(4));

  let anchor = "middle";
  let textX = bleedMm + obj.x + obj.w / 2;
  if (obj.align === "left") {
    anchor = "start";
    textX = bleedMm + obj.x;
  } else if (obj.align === "right") {
    anchor = "end";
    textX = bleedMm + obj.x + obj.w;
  }

  const textY = bleedMm + obj.y + obj.h / 2 + fontSizeMm * 0.35;

  return `<text x="${textX.toFixed(2)}" y="${textY.toFixed(
    2
  )}" font-family="${escapeXml(
    obj.font
  )}, sans-serif" font-size="${fontSizeMm}" letter-spacing="${letterSpacingEm}em" fill="${escapeXml(
    obj.fill
  )}" text-anchor="${anchor}">${escapeXml(obj.text)}</text>`;
}
