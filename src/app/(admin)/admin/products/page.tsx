import { requireAdmin } from "@/lib/auth/guards";
import { getProductsWithDetails } from "@/lib/catalogue/queries";
import { formatMoney } from "@/lib/pricing/engine";

export const metadata = {
  title: "Admin Catalogue",
};

export default async function AdminProductsPage() {
  await requireAdmin();
  const products = await getProductsWithDetails();

  return (
    <div className="space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">
          Parameter-Driven Catalogue
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Products, Parameters &amp; Rules
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {products.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-border-ink bg-paper-elevated p-5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase text-copper">
                {p.division_name}
              </span>
              <span className="rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] text-ink">
                {p.product_type}
              </span>
            </div>

            <h2 className="mt-2 font-display text-xl font-bold text-ink">
              {p.name}
            </h2>
            <p className="mt-1 font-mono text-xs text-muted-ink">
              Base: {formatMoney(p.base_unit_price)} · Setup:{" "}
              {formatMoney(p.setup_fee)} · Area rate:{" "}
              {formatMoney(p.size_rule.area_rate_per_cm2)}/cm²
            </p>
            <p className="mt-1 font-mono text-xs text-muted-ink">
              Size: {p.size_rule.min_width_mm}–{p.size_rule.max_width_mm} ×{" "}
              {p.size_rule.min_height_mm}–{p.size_rule.max_height_mm} mm ·{" "}
              {p.bleed_mm}mm bleed · {p.output_dpi} DPI
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
