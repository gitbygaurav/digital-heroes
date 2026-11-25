"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  calculateProductPrice,
  DEFAULT_PRICING_CONFIG,
  formatMoney,
} from "@/lib/pricing/engine";
import type { ProductWithDetails } from "@/types/catalogue";
import type { PricingConfig } from "@/types/database";
import { ArrowRight, CheckCircle2, Info, ShoppingCart, Sparkles } from "lucide-react";

interface ProductConfiguratorProps {
  products: ProductWithDetails[];
  initialProductSlug?: string;
  allowProductSwitch?: boolean;
  pricingConfig?: PricingConfig;
}

function buildDefaultOptions(product: ProductWithDetails): Record<string, string> {
  const opts: Record<string, string> = {};
  for (const param of product.parameters) {
    if (param.default_value) {
      opts[param.key] = param.default_value;
    } else if (param.options[0]) {
      opts[param.key] = param.options[0].value;
    }
  }
  return opts;
}

export function ProductConfigurator({
  products,
  initialProductSlug,
  allowProductSwitch = false,
  pricingConfig = DEFAULT_PRICING_CONFIG,
}: ProductConfiguratorProps) {
  const router = useRouter();
  const initialProduct =
    products.find(
      (p) => p.slug === initialProductSlug || p.division_slug === initialProductSlug
    ) ?? products[0];

  const [selectedProductId, setSelectedProductId] = useState(initialProduct.id);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  const product = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? products[0],
    [products, selectedProductId]
  );

  const [widthMm, setWidthMm] = useState<number>(product.size_rule.default_width_mm);
  const [heightMm, setHeightMm] = useState<number>(product.size_rule.default_height_mm);
  const [shape, setShape] = useState<string>(product.size_rule.allowed_shapes[0] ?? "rect");
  const [quantity, setQuantity] = useState<number>(Math.max(product.min_qty, 50));
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() =>
    buildDefaultOptions(product)
  );

  function handleProductChange(newId: string) {
    const next = products.find((p) => p.id === newId);
    if (!next) return;
    setSelectedProductId(next.id);
    setWidthMm(next.size_rule.default_width_mm);
    setHeightMm(next.size_rule.default_height_mm);
    setShape(next.size_rule.allowed_shapes[0] ?? "rect");
    setQuantity(Math.max(next.min_qty, 50));
    setSelectedOptions(buildDefaultOptions(next));
  }

  const price = useMemo(
    () =>
      calculateProductPrice(
        product,
        {
          width_mm: Number.isFinite(widthMm) ? widthMm : 0,
          height_mm: Number.isFinite(heightMm) ? heightMm : 0,
          shape,
          quantity: Number.isFinite(quantity) ? Math.trunc(quantity) : 0,
          selectedOptions,
        },
        pricingConfig
      ),
    [product, widthMm, heightMm, shape, quantity, selectedOptions, pricingConfig]
  );

  const presetQuantities = [
    product.min_qty,
    50,
    99,
    100,
    250,
    500,
  ].filter(
    (q, idx, arr) =>
      q >= product.min_qty && q <= product.max_qty && arr.indexOf(q) === idx
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left: Parameter Controls */}
      <div className="space-y-6 rounded-xl border border-border-ink bg-paper-elevated p-6 lg:col-span-7">
        {allowProductSwitch && (
          <div>
            <label
              htmlFor="calc-product-select"
              className="block font-mono text-xs font-semibold uppercase text-ink"
            >
              Product Division
            </label>
            <select
              id="calc-product-select"
              value={product.id}
              onChange={(e) => handleProductChange(e.target.value)}
              className="mt-2 w-full rounded-md border border-border-ink bg-paper px-3 py-2.5 text-sm font-medium text-ink focus:border-accent-deep focus:outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.division_name} — {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Shape Selector */}
        {product.size_rule.allowed_shapes.length > 1 && (
          <div>
            <span className="block font-mono text-xs font-semibold uppercase text-ink">
              Cut Shape
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.size_rule.allowed_shapes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShape(s)}
                  className={`rounded-md border px-3.5 py-2 font-mono text-xs uppercase transition-colors ${
                    shape === s
                      ? "border-accent-deep bg-accent-deep text-paper"
                      : "border-border-ink bg-paper text-ink hover:border-ink"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Millimetre Dimensions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="width-mm"
              className="flex items-center justify-between font-mono text-xs font-semibold uppercase text-ink"
            >
              <span>Width (mm)</span>
              <span className="text-[11px] font-normal text-muted-ink">
                {product.size_rule.min_width_mm}–{product.size_rule.max_width_mm} mm
              </span>
            </label>
            <input
              id="width-mm"
              type="number"
              min={product.size_rule.min_width_mm}
              max={product.size_rule.max_width_mm}
              value={widthMm}
              onChange={(e) => setWidthMm(Number(e.target.value))}
              className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent-deep focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="height-mm"
              className="flex items-center justify-between font-mono text-xs font-semibold uppercase text-ink"
            >
              <span>Height (mm)</span>
              <span className="text-[11px] font-normal text-muted-ink">
                {product.size_rule.min_height_mm}–{product.size_rule.max_height_mm} mm
              </span>
            </label>
            <input
              id="height-mm"
              type="number"
              min={product.size_rule.min_height_mm}
              max={product.size_rule.max_height_mm}
              value={heightMm}
              onChange={(e) => setHeightMm(Number(e.target.value))}
              className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent-deep focus:outline-none"
            />
          </div>
        </div>

        {/* Dynamic Product Parameters */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {product.parameters.map((param) => (
            <div key={param.id}>
              <label
                htmlFor={`param-${param.key}`}
                className="block font-mono text-xs font-semibold uppercase text-ink"
              >
                {param.label}
              </label>
              <select
                id={`param-${param.key}`}
                value={selectedOptions[param.key] ?? param.default_value ?? ""}
                onChange={(e) =>
                  setSelectedOptions((prev) => ({
                    ...prev,
                    [param.key]: e.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
              >
                {param.options.map((opt) => (
                  <option key={opt.id} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Quantity & Quick Presets */}
        <div>
          <label
            htmlFor="quantity-input"
            className="flex items-center justify-between font-mono text-xs font-semibold uppercase text-ink"
          >
            <span>Quantity</span>
            <span className="text-[11px] font-normal text-muted-ink">
              Min {product.min_qty} · Max {product.max_qty.toLocaleString()}
            </span>
          </label>
          <input
            id="quantity-input"
            type="number"
            min={product.min_qty}
            max={product.max_qty}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent-deep focus:outline-none"
          />

          <div className="mt-2.5 flex flex-wrap gap-2">
            {presetQuantities.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setQuantity(preset)}
                className={`rounded border px-2.5 py-1 font-mono text-xs transition-colors ${
                  quantity === preset
                    ? "border-ink bg-ink text-paper"
                    : "border-border-ink bg-paper text-muted-ink hover:border-ink hover:text-ink"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Instant Price Summary */}
      <div className="flex flex-col justify-between rounded-xl border border-ink/20 bg-ink p-6 text-paper lg:col-span-5">
        <div>
          <div className="flex items-center justify-between border-b border-paper/15 pb-4">
            <div>
              <p className="font-mono text-xs uppercase text-accent">
                Instant Estimate
              </p>
              <h2 className="mt-0.5 font-display text-xl font-bold">
                {product.name}
              </h2>
            </div>
            <span className="rounded bg-paper/10 px-2.5 py-1 font-mono text-xs text-paper/80">
              {product.bleed_mm}mm bleed · {product.output_dpi} DPI
            </span>
          </div>

          {!price.valid ? (
            <div
              role="alert"
              className="mt-6 rounded-md border border-copper/50 bg-copper/15 p-4 text-sm text-paper"
            >
              {price.error}
            </div>
          ) : (
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between text-paper/80">
                <span>Print area</span>
                <span className="font-mono">
                  {widthMm} × {heightMm} mm ({price.areaCm2} cm²)
                </span>
              </div>

              <div className="flex justify-between text-paper/80">
                <span>Unit price</span>
                <span className="font-mono">
                  {formatMoney(price.unitPrice, price.currencySymbol)}
                </span>
              </div>

              {price.discountPercent > 0 && (
                <div className="flex justify-between text-accent">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Volume discount
                  </span>
                  <span className="font-mono font-semibold">
                    −{price.discountPercent}%
                  </span>
                </div>
              )}

              <div className="flex justify-between text-paper/80">
                <span>Setup fee</span>
                <span className="font-mono">
                  {price.setupFee === 0
                    ? "Included"
                    : formatMoney(price.setupFee, price.currencySymbol)}
                </span>
              </div>

              <div className="border-t border-paper/15 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-base font-semibold">
                    Total ({price.taxLabel}-inclusive)
                  </span>
                  <span className="font-mono text-3xl font-bold text-accent">
                    {formatMoney(price.lineTotal, price.currencySymbol)}
                  </span>
                </div>
                <p className="mt-1 flex items-center justify-between font-mono text-xs text-paper/65">
                  <span>
                    Includes {price.taxRatePercent}% {price.taxLabel}
                  </span>
                  <span>
                    {formatMoney(price.taxAmount, price.currencySymbol)}
                  </span>
                </p>
              </div>

              {price.nextTierNudge && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-paper/90">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>
                    Add{" "}
                    <strong className="font-mono">
                      {price.nextTierNudge.unitsAway}
                    </strong>{" "}
                    more (qty {price.nextTierNudge.minQty}+) to unlock{" "}
                    <strong className="text-accent">
                      {price.nextTierNudge.discountPercent}% off
                    </strong>{" "}
                    per unit.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {cartError && (
            <p role="alert" className="rounded bg-danger/20 px-3 py-2 text-xs text-paper">
              {cartError}
            </p>
          )}
          <button
            type="button"
            disabled={!price.valid || addingToCart}
            onClick={async () => {
              if (!price.valid) return;
              setAddingToCart(true);
              setCartError(null);
              try {
                const res = await fetch("/api/cart", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    product_id: product.id,
                    config: {
                      width_mm: widthMm,
                      height_mm: heightMm,
                      shape,
                      quantity,
                      selectedOptions,
                    },
                  }),
                });
                if (res.status === 401) {
                  router.push(`/login?next=/products/${product.division_slug}`);
                  return;
                }
                const data = (await res.json()) as { error?: string };
                if (!res.ok) {
                  setCartError(data.error ?? "Could not add item to cart.");
                  return;
                }
                router.push("/cart");
              } catch {
                setCartError("Network error adding item to cart.");
              } finally {
                setAddingToCart(false);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-paper disabled:opacity-50"
          >
            <ShoppingCart className="h-4 w-4" />
            {addingToCart ? "Adding to cart..." : "Add to Cart & Checkout"}
          </button>

          <Link
            href={`/designer?product=${product.slug}`}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-paper/30 px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-paper/10"
          >
            Design or Upload Artwork
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[11px] text-paper/60">
            <Info className="h-3 w-3" />
            No quote forms · Server-verified at checkout
          </p>
        </div>
      </div>
    </div>
  );
}
