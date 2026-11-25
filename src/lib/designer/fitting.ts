/**
 * Shared Placeholder Fitting Algorithm (PRD §8.3).
 * Used identically by the browser Designer and server Print-File / CSV Renderer.
 *
 * Steps:
 * 1. Start at maxPt.
 * 2. If text overflows the box (in mm), reduce fontSizePt down to minPt.
 * 3. If it still overflows at minPt, apply negative horizontal tracking in [minTracking, 0].
 * 4. If it still does not fit, return fits: false with error "text too long".
 */

export interface FitTextParams {
  text: string;
  boxWidthMm: number;
  boxHeightMm: number;
  minPt: number;
  maxPt: number;
  minTracking?: number; // e.g. -60 (thousandths of em)
  fitMode?: "shrink_to_fit" | "none";
}

export interface FitTextResult {
  fits: boolean;
  fontSizePt: number;
  tracking: number;
  error?: string;
}

const MM_PER_PT = 0.352778;
// Conservative average character width ratio for geometric/grotesk fonts
const AVG_CHAR_WIDTH_RATIO = 0.56;
const LINE_HEIGHT_RATIO = 1.2;

/**
 * Estimates rendered text width in mm for a given font size (pt) and tracking.
 */
export function estimateTextWidthMm(
  text: string,
  fontSizePt: number,
  tracking = 0
): number {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  const fontSizeMm = fontSizePt * MM_PER_PT;
  const trackingFactor = Math.max(0.75, 1 + tracking / 1000);

  let maxLineWidth = 0;
  for (const line of lines) {
    const lineWidth =
      line.length * fontSizeMm * AVG_CHAR_WIDTH_RATIO * trackingFactor;
    if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
  }
  return maxLineWidth;
}

export function estimateTextHeightMm(text: string, fontSizePt: number): number {
  const lines = Math.max(1, text.split(/\r?\n/).length);
  return lines * fontSizePt * MM_PER_PT * LINE_HEIGHT_RATIO;
}

export function fitTextToBox(params: FitTextParams): FitTextResult {
  const {
    text,
    boxWidthMm,
    boxHeightMm,
    minPt,
    maxPt,
    minTracking = -60,
    fitMode = "shrink_to_fit",
  } = params;

  const fitsAt = (pt: number, tracking: number) =>
    estimateTextWidthMm(text, pt, tracking) <= boxWidthMm &&
    estimateTextHeightMm(text, pt) <= boxHeightMm;

  if (fitMode === "none") {
    const ok = fitsAt(maxPt, 0);
    return {
      fits: ok,
      fontSizePt: maxPt,
      tracking: 0,
      error: ok ? undefined : "text too long",
    };
  }

  // Step 1 & 2: shrink font size from maxPt down to minPt
  for (let pt = maxPt; pt >= minPt; pt -= 0.5) {
    if (fitsAt(pt, 0)) {
      return {
        fits: true,
        fontSizePt: Number(pt.toFixed(1)),
        tracking: 0,
      };
    }
  }

  // Step 3: at minPt, tighten horizontal tracking down to minTracking
  for (let tracking = -5; tracking >= minTracking; tracking -= 5) {
    if (fitsAt(minPt, tracking)) {
      return {
        fits: true,
        fontSizePt: minPt,
        tracking,
      };
    }
  }

  // Step 4: still overflows
  return {
    fits: false,
    fontSizePt: minPt,
    tracking: minTracking,
    error: "text too long",
  };
}
