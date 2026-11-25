import type { PrintAreaSpec } from "@/lib/designer/scene";

export interface BoxBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Clamps an object's position and dimensions inside the safe print area (PRD §8.1).
 * Unprintable artwork cannot leave the print area + safe margin.
 */
export function clampObjectToPrintArea(
  obj: BoxBounds,
  area: PrintAreaSpec
): BoxBounds {
  const margin = area.safeMarginMm ?? 0;
  const minX = area.x + margin;
  const minY = area.y + margin;
  const maxW = Math.max(4, area.w - margin * 2);
  const maxH = Math.max(4, area.h - margin * 2);

  const w = Math.min(Math.max(4, obj.w), maxW);
  const h = Math.min(Math.max(4, obj.h), maxH);

  const maxX = minX + maxW - w;
  const maxY = minY + maxH - h;

  const x = Math.min(Math.max(obj.x, minX), maxX);
  const y = Math.min(Math.max(obj.y, minY), maxY);

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    w: Number(w.toFixed(2)),
    h: Number(h.toFixed(2)),
  };
}
