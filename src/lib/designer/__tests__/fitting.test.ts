import { describe, expect, it } from "vitest";
import { fitTextToBox } from "@/lib/designer/fitting";
import { clampObjectToPrintArea } from "@/lib/designer/constraints";
import { sceneJsonSchema } from "@/lib/designer/scene";

describe("Placeholder Fitting & Print-Area Constraints (§8.1, §8.3)", () => {
  it("keeps maxPt when short text fits comfortably", () => {
    const res = fitTextToBox({
      text: "104",
      boxWidthMm: 140,
      boxHeightMm: 60,
      minPt: 12,
      maxPt: 72,
    });

    expect(res.fits).toBe(true);
    expect(res.fontSizePt).toBe(72);
    expect(res.tracking).toBe(0);
  });

  it("shrinks font size between maxPt and minPt before applying negative tracking", () => {
    const res = fitTextToBox({
      text: "ALEXANDER HAMILTON",
      boxWidthMm: 70,
      boxHeightMm: 20,
      minPt: 10,
      maxPt: 48,
      minTracking: -60,
    });

    expect(res.fits).toBe(true);
    expect(res.fontSizePt).toBeLessThan(48);
    expect(res.fontSizePt).toBeGreaterThanOrEqual(10);
  });

  it("flags 'text too long' when text overflows even at minPt and minTracking", () => {
    const res = fitTextToBox({
      text: "THIS IS AN EXTREMELY LONG RIDER NAME THAT CANNOT POSSIBLY FIT INSIDE A TINY STAMP",
      boxWidthMm: 30,
      boxHeightMm: 10,
      minPt: 12,
      maxPt: 24,
      minTracking: -60,
    });

    expect(res.fits).toBe(false);
    expect(res.error).toBe("text too long");
  });

  it("clamps objects strictly inside the print area + safe margin", () => {
    const clamped = clampObjectToPrintArea(
      { x: -15, y: 120, w: 60, h: 40 },
      { id: "pa1", x: 0, y: 0, w: 100, h: 100, shape: "rect", safeMarginMm: 5 }
    );

    expect(clamped.x).toBe(5);
    expect(clamped.y).toBe(55); // 100 - 5 - 40 = 55
    expect(clamped.w).toBe(60);
    expect(clamped.h).toBe(40);
  });

  it("validates Scene JSON schema in mm", () => {
    const valid = sceneJsonSchema.safeParse({
      version: 1,
      unit: "mm",
      canvas: { width: 100, height: 60, bleed: 3 },
      printAreas: [{ id: "pa1", x: 0, y: 0, w: 100, h: 60, shape: "rect" }],
      objects: [
        {
          type: "text",
          id: "t1",
          text: "123",
          x: 10,
          y: 10,
          w: 80,
          h: 30,
          fontSizePt: 48,
        },
      ],
    });
    expect(valid.success).toBe(true);
  });
});
