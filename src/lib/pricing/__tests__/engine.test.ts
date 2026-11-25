import { describe, expect, it } from "vitest";
import {
  calculateProductPrice,
  DEFAULT_PRICING_CONFIG,
  formatMoney,
} from "@/lib/pricing/engine";
import type { ProductWithDetails } from "@/types/catalogue";

const mockStickerProduct: ProductWithDetails = {
  id: "prod-sticker-1",
  division_id: "div-1",
  division_slug: "labels-stickers",
  division_name: "Labels & Stickers",
  slug: "custom-die-cut-stickers",
  name: "Custom Die-Cut Stickers",
  description: "Parameter-driven sticker product",
  product_type: "Sticker",
  base_unit_price: 500, // ₹5.00
  setup_fee: 10000,     // ₹100.00
  min_qty: 10,
  max_qty: 5000,
  bleed_mm: 3,
  output_dpi: 300,
  is_active: true,
  size_rule: {
    id: "sr-1",
    product_id: "prod-sticker-1",
    min_width_mm: 20,
    max_width_mm: 300,
    min_height_mm: 20,
    max_height_mm: 300,
    default_width_mm: 80,
    default_height_mm: 80,
    allowed_shapes: ["rect", "circle", "oval"],
    area_rate_per_cm2: 10, // ₹0.10 per cm²
  },
  parameters: [
    {
      id: "param-mat",
      product_id: "prod-sticker-1",
      key: "material",
      label: "Material",
      type: "select",
      min_val: null,
      max_val: null,
      step_val: null,
      default_value: "white_vinyl",
      sort_order: 1,
      options: [
        {
          id: "opt-1",
          parameter_id: "param-mat",
          value: "white_vinyl",
          label: "White Vinyl",
          price_multiplier: 1,
          price_add: 0,
          sort_order: 1,
          is_active: true,
        },
        {
          id: "opt-2",
          parameter_id: "param-mat",
          value: "clear_vinyl",
          label: "Clear Vinyl",
          price_multiplier: 1.25,
          price_add: 100,
          sort_order: 2,
          is_active: true,
        },
      ],
    },
  ],
  discount_tiers: [
    { id: "t-1", product_id: "prod-sticker-1", min_qty: 100, discount_percent: 10 },
    { id: "t-2", product_id: "prod-sticker-1", min_qty: 500, discount_percent: 15 },
  ],
};

describe("Pricing Engine (§7.1)", () => {
  it("calculates exact area, option modifiers, setup fee, and GST-inclusive tax", () => {
    // 100mm x 100mm = 100 cm² -> unitBase = 500 + 100*10 = 1500
    // clear_vinyl -> 1500 * 1.25 + 100 = 1975
    // qty 50 (< 100) -> 0% discount -> lineSubtotal = 1975 * 50 + 10000 = 108750
    const res = calculateProductPrice(mockStickerProduct, {
      width_mm: 100,
      height_mm: 100,
      shape: "rect",
      quantity: 50,
      selectedOptions: { material: "clear_vinyl" },
    });

    expect(res.valid).toBe(true);
    if (!res.valid) return;
    expect(res.areaCm2).toBe(100);
    expect(res.unitBase).toBe(1500);
    expect(res.unitPrice).toBe(1975);
    expect(res.discountPercent).toBe(0);
    expect(res.lineTotal).toBe(108750);
    // Inclusive 18% GST: 108750 - round(108750 / 1.18) = 108750 - 92161 = 16589
    expect(res.taxAmount).toBe(16589);
    expect(res.nextTierNudge).toEqual({
      minQty: 100,
      discountPercent: 10,
      unitsAway: 50,
    });
  });

  it("applies volume discount at exact tier boundaries (99 vs 100 vs 500)", () => {
    const baseInput = {
      width_mm: 50,
      height_mm: 50, // 25 cm² -> unitBase = 500 + 250 = 750
      shape: "circle",
      selectedOptions: { material: "white_vinyl" },
    };

    const at99 = calculateProductPrice(mockStickerProduct, {
      ...baseInput,
      quantity: 99,
    });
    const at100 = calculateProductPrice(mockStickerProduct, {
      ...baseInput,
      quantity: 100,
    });
    const at500 = calculateProductPrice(mockStickerProduct, {
      ...baseInput,
      quantity: 500,
    });

    expect(at99.valid && at99.discountPercent).toBe(0);
    expect(at99.valid && at99.unitPrice).toBe(750);

    expect(at100.valid && at100.discountPercent).toBe(10);
    expect(at100.valid && at100.unitPrice).toBe(675);

    expect(at500.valid && at500.discountPercent).toBe(15);
    expect(at500.valid && at500.unitPrice).toBe(638); // round(750 * 0.85) = 638
  });

  it("rejects quantities below min_qty or above max_qty", () => {
    const low = calculateProductPrice(mockStickerProduct, {
      width_mm: 50,
      height_mm: 50,
      shape: "rect",
      quantity: 5,
      selectedOptions: { material: "white_vinyl" },
    });
    const high = calculateProductPrice(mockStickerProduct, {
      width_mm: 50,
      height_mm: 50,
      shape: "rect",
      quantity: 99999,
      selectedOptions: { material: "white_vinyl" },
    });

    expect(low.valid).toBe(false);
    expect(high.valid).toBe(false);
  });

  it("rejects out-of-range dimensions and disallowed shapes", () => {
    const tooSmall = calculateProductPrice(mockStickerProduct, {
      width_mm: 10,
      height_mm: 50,
      shape: "rect",
      quantity: 50,
      selectedOptions: { material: "white_vinyl" },
    });
    const badShape = calculateProductPrice(mockStickerProduct, {
      width_mm: 50,
      height_mm: 50,
      shape: "star",
      quantity: 50,
      selectedOptions: { material: "white_vinyl" },
    });

    expect(tooSmall.valid).toBe(false);
    expect(badShape.valid).toBe(false);
  });

  it("rejects invalid option values", () => {
    const badOpt = calculateProductPrice(mockStickerProduct, {
      width_mm: 50,
      height_mm: 50,
      shape: "rect",
      quantity: 50,
      selectedOptions: { material: "titanium_foil" },
    });
    expect(badOpt.valid).toBe(false);
  });

  it("enforces minimum order value when configured and formats money", () => {
    const configWithMin = {
      ...DEFAULT_PRICING_CONFIG,
      min_order_value_minor: 200000, // ₹2000.00
    };
    const res = calculateProductPrice(
      mockStickerProduct,
      {
        width_mm: 50,
        height_mm: 50,
        shape: "rect",
        quantity: 10,
        selectedOptions: { material: "white_vinyl" },
      },
      configWithMin
    );
    expect(res.valid).toBe(true);
    if (!res.valid) return;
    expect(res.minOrderEnforced).toBe(true);
    expect(res.lineTotal).toBe(200000);
    expect(formatMoney(res.lineTotal, "₹")).toBe("₹2000.00");
  });
});
