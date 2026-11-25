import type { PricingConfig } from "@/types/database";
import {
  priceConfigInputSchema,
  type PriceConfigInput,
  type ProductWithDetails,
  type VolumeDiscountTier,
} from "@/types/catalogue";

export interface PriceBreakdown {
  valid: true;
  areaCm2: number;
  unitBase: number;
  unitOptions: number;
  discountPercent: number;
  unitPrice: number;
  setupFee: number;
  lineSubtotal: number;
  lineTotal: number;
  minOrderEnforced: boolean;
  taxAmount: number;
  taxLabel: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  currency: string;
  currencySymbol: string;
  nextTierNudge: {
    minQty: number;
    discountPercent: number;
    unitsAway: number;
  } | null;
}

export interface PriceError {
  valid: false;
  error: string;
}

export type PriceResult = PriceBreakdown | PriceError;

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  currency: "INR",
  currency_symbol: "₹",
  tax_label: "GST",
  tax_rate_percent: 18,
  tax_inclusive: true,
  min_order_value_minor: 0,
};

/**
 * Pure pricing engine shared identically between browser calculator and server checkout.
 * All monetary inputs and outputs are integer minor units (e.g. paise / pence).
 * Implements PRD §7.1 and Decisions D1, D2.
 */
export function calculateProductPrice(
  product: ProductWithDetails,
  rawInput: PriceConfigInput,
  pricingConfig: PricingConfig = DEFAULT_PRICING_CONFIG
): PriceResult {
  const parsed = priceConfigInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      valid: false,
      error: parsed.error.issues[0]?.message ?? "Invalid configuration input.",
    };
  }

  const { width_mm, height_mm, shape, quantity, selectedOptions } = parsed.data;
  const rules = product.size_rule;

  // 1. Validate quantity bounds
  if (quantity < product.min_qty) {
    return {
      valid: false,
      error: `Minimum order quantity is ${product.min_qty}.`,
    };
  }
  if (quantity > product.max_qty) {
    return {
      valid: false,
      error: `Maximum order quantity is ${product.max_qty}.`,
    };
  }

  // 2. Validate size bounds & shape
  if (width_mm < rules.min_width_mm || width_mm > rules.max_width_mm) {
    return {
      valid: false,
      error: `Width must be between ${rules.min_width_mm} mm and ${rules.max_width_mm} mm.`,
    };
  }
  if (height_mm < rules.min_height_mm || height_mm > rules.max_height_mm) {
    return {
      valid: false,
      error: `Height must be between ${rules.min_height_mm} mm and ${rules.max_height_mm} mm.`,
    };
  }
  if (!rules.allowed_shapes.includes(shape)) {
    return {
      valid: false,
      error: `Shape "${shape}" is not supported for ${product.name}.`,
    };
  }

  // 3. Validate parameter options & accumulate multiplier / additive modifiers
  let multiplierProduct = 1;
  let additiveSum = 0;

  for (const param of product.parameters) {
    if (param.type !== "select") continue;

    const chosenValue = selectedOptions[param.key] ?? param.default_value;
    if (!chosenValue) {
      return {
        valid: false,
        error: `Please select an option for ${param.label}.`,
      };
    }

    const matchedOption = param.options.find(
      (opt) => opt.is_active && opt.value === chosenValue
    );

    if (!matchedOption) {
      return {
        valid: false,
        error: `Invalid option "${chosenValue}" for ${param.label}.`,
      };
    }

    multiplierProduct *= matchedOption.price_multiplier;
    additiveSum += matchedOption.price_add;
  }

  // 4. Core pricing formula (PRD §7.1)
  const areaCm2 = (width_mm * height_mm) / 100;
  const unitBase = product.base_unit_price + areaCm2 * rules.area_rate_per_cm2;
  const unitOptions = unitBase * multiplierProduct + additiveSum;

  // 5. Volume discount tier (highest tier where quantity >= tier.min_qty)
  const sortedTiers: VolumeDiscountTier[] = [...product.discount_tiers].sort(
    (a, b) => a.min_qty - b.min_qty
  );

  let discountPercent = 0;
  for (const tier of sortedTiers) {
    if (quantity >= tier.min_qty && tier.discount_percent >= discountPercent) {
      discountPercent = tier.discount_percent;
    }
  }

  const nextTier = sortedTiers.find((t) => t.min_qty > quantity) ?? null;

  const unitPrice = Math.round(unitOptions * (1 - discountPercent / 100));
  const setupFee = product.setup_fee;
  const lineSubtotal = unitPrice * quantity + setupFee;

  const minOrderValue = pricingConfig.min_order_value_minor ?? 0;
  const minOrderEnforced = minOrderValue > 0 && lineSubtotal < minOrderValue;
  const lineTotal = minOrderEnforced ? minOrderValue : lineSubtotal;

  // 6. VAT/GST-inclusive tax extraction (Decision D1)
  const rate = pricingConfig.tax_rate_percent / 100;
  const taxAmount = pricingConfig.tax_inclusive
    ? lineTotal - Math.round(lineTotal / (1 + rate))
    : Math.round(lineTotal * rate);

  return {
    valid: true,
    areaCm2: Number(areaCm2.toFixed(2)),
    unitBase: Math.round(unitBase),
    unitOptions: Math.round(unitOptions),
    discountPercent,
    unitPrice,
    setupFee,
    lineSubtotal,
    lineTotal,
    minOrderEnforced,
    taxAmount,
    taxLabel: pricingConfig.tax_label,
    taxRatePercent: pricingConfig.tax_rate_percent,
    taxInclusive: pricingConfig.tax_inclusive,
    currency: pricingConfig.currency,
    currencySymbol: pricingConfig.currency_symbol,
    nextTierNudge: nextTier
      ? {
          minQty: nextTier.min_qty,
          discountPercent: nextTier.discount_percent,
          unitsAway: nextTier.min_qty - quantity,
        }
      : null,
  };
}

/**
 * Formats integer minor units (e.g. 12500 paise -> ₹125.00).
 */
export function formatMoney(
  minorUnits: number,
  currencySymbol = "\u20B9"
): string {
  const cleanSymbol =
    currencySymbol.includes("â") ? "\u20B9" : currencySymbol;
  const major = (minorUnits / 100).toFixed(2);
  return `${cleanSymbol}${major}`;
}
