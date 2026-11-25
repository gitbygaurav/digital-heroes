import { createClient } from "@/lib/supabase/server";
import {
  SEED_DIVISIONS,
  SEED_GALLERY_ITEMS,
  SEED_PRODUCTS,
} from "@/lib/catalogue/seed-data";
import { DEFAULT_PRICING_CONFIG } from "@/lib/pricing/engine";
import type {
  DivisionRecord,
  GalleryItem,
  ProductWithDetails,
  VolumeDiscountTier,
} from "@/types/catalogue";
import type { PricingConfig } from "@/types/database";

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function getPricingConfig(): Promise<PricingConfig> {
  if (!hasSupabaseEnv()) return DEFAULT_PRICING_CONFIG;

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "pricing_config")
      .single();

    if (data?.value) {
      const merged = {
        ...DEFAULT_PRICING_CONFIG,
        ...(data.value as Partial<PricingConfig>),
      };
      if (merged.currency === "INR") {
        merged.currency_symbol = "\u20B9";
      }
      return merged;
    }
  } catch {
    // Fallback to default pricing config
  }

  return DEFAULT_PRICING_CONFIG;
}

export async function getDivisions(): Promise<DivisionRecord[]> {
  if (!hasSupabaseEnv()) return SEED_DIVISIONS;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("divisions")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      return data as DivisionRecord[];
    }
  } catch {
    // Fallback to canonical seed data
  }

  return SEED_DIVISIONS;
}

export async function getProductsWithDetails(): Promise<ProductWithDetails[]> {
  if (!hasSupabaseEnv()) return SEED_PRODUCTS;

  try {
    const supabase = await createClient();
    const { data: products, error } = await supabase
      .from("products")
      .select(
        `
        *,
        divisions!inner(slug, name),
        size_rules(*),
        product_parameters(
          *,
          product_parameter_options(*)
        ),
        volume_discount_tiers(*)
      `
      )
      .eq("is_active", true);

    if (error || !products || products.length === 0) {
      return SEED_PRODUCTS;
    }

    const { data: globalTiers } = await supabase
      .from("volume_discount_tiers")
      .select("*")
      .is("product_id", null);

    return products.map((p) => {
      const div = p.divisions as unknown as { slug: string; name: string };
      const sizeRuleRaw = Array.isArray(p.size_rules)
        ? p.size_rules[0]
        : p.size_rules;
      const paramsRaw = (p.product_parameters ?? []) as Array<
        Record<string, unknown> & {
          product_parameter_options?: Array<Record<string, unknown>>;
        }
      >;
      const productTiers = (p.volume_discount_tiers ?? []) as VolumeDiscountTier[];
      const effectiveTiers =
        productTiers.length > 0
          ? productTiers
          : ((globalTiers ?? []) as VolumeDiscountTier[]);

      return {
        id: p.id,
        division_id: p.division_id,
        division_slug: div.slug,
        division_name: div.name,
        slug: p.slug,
        name: p.name,
        description: p.description,
        product_type: p.product_type,
        base_unit_price: Number(p.base_unit_price),
        setup_fee: Number(p.setup_fee),
        min_qty: Number(p.min_qty),
        max_qty: Number(p.max_qty),
        bleed_mm: Number(p.bleed_mm),
        output_dpi: Number(p.output_dpi),
        is_active: Boolean(p.is_active),
        size_rule: {
          ...sizeRuleRaw,
          min_width_mm: Number(sizeRuleRaw.min_width_mm),
          max_width_mm: Number(sizeRuleRaw.max_width_mm),
          min_height_mm: Number(sizeRuleRaw.min_height_mm),
          max_height_mm: Number(sizeRuleRaw.max_height_mm),
          default_width_mm: Number(sizeRuleRaw.default_width_mm),
          default_height_mm: Number(sizeRuleRaw.default_height_mm),
          area_rate_per_cm2: Number(sizeRuleRaw.area_rate_per_cm2),
        },
        parameters: paramsRaw
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
          .map((param) => ({
            id: String(param.id),
            product_id: String(param.product_id),
            key: String(param.key),
            label: String(param.label),
            type: param.type as ProductWithDetails["parameters"][number]["type"],
            min_val: param.min_val !== null ? Number(param.min_val) : null,
            max_val: param.max_val !== null ? Number(param.max_val) : null,
            step_val: param.step_val !== null ? Number(param.step_val) : null,
            default_value: param.default_value ? String(param.default_value) : null,
            sort_order: Number(param.sort_order),
            options: (param.product_parameter_options ?? [])
              .filter((o) => Boolean(o.is_active))
              .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
              .map((o) => ({
                id: String(o.id),
                parameter_id: String(o.parameter_id),
                value: String(o.value),
                label: String(o.label),
                price_multiplier: Number(o.price_multiplier),
                price_add: Number(o.price_add),
                sort_order: Number(o.sort_order),
                is_active: Boolean(o.is_active),
              })),
          })),
        discount_tiers: effectiveTiers.map((t) => ({
          id: t.id,
          product_id: t.product_id,
          min_qty: Number(t.min_qty),
          discount_percent: Number(t.discount_percent),
        })),
      } satisfies ProductWithDetails;
    });
  } catch {
    return SEED_PRODUCTS;
  }
}

export async function getProductByDivisionOrSlug(
  slug: string
): Promise<ProductWithDetails | null> {
  const products = await getProductsWithDetails();
  return (
    products.find((p) => p.division_slug === slug || p.slug === slug) ?? null
  );
}

export async function getGalleryItems(
  divisionSlug?: string
): Promise<GalleryItem[]> {
  if (!hasSupabaseEnv()) {
    return divisionSlug
      ? SEED_GALLERY_ITEMS.filter((g) => g.division_slug === divisionSlug)
      : SEED_GALLERY_ITEMS;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("gallery_items")
      .select("*, divisions!inner(slug, name)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return divisionSlug
        ? SEED_GALLERY_ITEMS.filter((g) => g.division_slug === divisionSlug)
        : SEED_GALLERY_ITEMS;
    }

    const mapped: GalleryItem[] = data.map((row) => {
      const div = row.divisions as unknown as { slug: string; name: string };
      return {
        id: row.id,
        division_id: row.division_id,
        division_slug: div.slug,
        division_name: div.name,
        title: row.title,
        image_url: row.image_url,
        description: row.description,
        sort_order: Number(row.sort_order),
      };
    });

    return divisionSlug
      ? mapped.filter((g) => g.division_slug === divisionSlug)
      : mapped;
  } catch {
    return divisionSlug
      ? SEED_GALLERY_ITEMS.filter((g) => g.division_slug === divisionSlug)
      : SEED_GALLERY_ITEMS;
  }
}
