import { z } from "zod";

export type ProductType =
  | "Sticker"
  | "RaceNumber"
  | "MtbBoard"
  | "Stamp"
  | "Trophy"
  | "LaserCut";

export type ParameterType = "number_range" | "select" | "boolean" | "text";

export interface DivisionRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  hero_image: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProductParameterOption {
  id: string;
  parameter_id: string;
  value: string;
  label: string;
  price_multiplier: number;
  price_add: number; // integer minor units
  sort_order: number;
  is_active: boolean;
}

export interface ProductParameter {
  id: string;
  product_id: string;
  key: string;
  label: string;
  type: ParameterType;
  min_val: number | null;
  max_val: number | null;
  step_val: number | null;
  default_value: string | null;
  sort_order: number;
  options: ProductParameterOption[];
}

export interface SizeRule {
  id: string;
  product_id: string;
  min_width_mm: number;
  max_width_mm: number;
  min_height_mm: number;
  max_height_mm: number;
  default_width_mm: number;
  default_height_mm: number;
  allowed_shapes: string[];
  area_rate_per_cm2: number; // integer minor units
}

export interface VolumeDiscountTier {
  id: string;
  product_id: string | null;
  min_qty: number;
  discount_percent: number;
}

export interface ProductWithDetails {
  id: string;
  division_id: string;
  division_slug: string;
  division_name: string;
  slug: string;
  name: string;
  description: string;
  product_type: ProductType;
  base_unit_price: number; // integer minor units
  setup_fee: number;       // integer minor units
  min_qty: number;
  max_qty: number;
  bleed_mm: number;
  output_dpi: number;
  is_active: boolean;
  size_rule: SizeRule;
  parameters: ProductParameter[];
  discount_tiers: VolumeDiscountTier[];
}

export interface GalleryItem {
  id: string;
  division_id: string;
  division_slug: string;
  division_name: string;
  title: string;
  image_url: string;
  description: string;
  sort_order: number;
}

export const priceConfigInputSchema = z.object({
  width_mm: z.number().finite().positive(),
  height_mm: z.number().finite().positive(),
  shape: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  selectedOptions: z.record(z.string(), z.string()),
});

export type PriceConfigInput = z.infer<typeof priceConfigInputSchema>;
