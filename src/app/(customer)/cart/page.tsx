"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing/engine";
import type { PricingConfig } from "@/types/database";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";

interface CartApiItem {
  id: string;
  product_id: string;
  productName: string;
  divisionName: string;
  quantity: number;
  config: {
    width_mm: number;
    height_mm: number;
    shape: string;
    selectedOptions: Record<string, string>;
  };
  price: {
    valid: boolean;
    unitPrice: number;
    discountPercent: number;
    lineTotal: number;
    taxAmount: number;
  } | null;
}

export default function CartPage() {
  const [items, setItems] = useState<CartApiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [taxTotal, setTaxTotal] = useState(0);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshCart() {
    try {
      const res = await fetch("/api/cart");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load cart.");
      } else {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTaxTotal(data.taxTotal ?? 0);
        setPricingConfig(data.pricingConfig ?? null);
      }
    } catch {
      setError("Network error loading cart.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/cart")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setError(data.error ?? "Failed to load cart.");
        } else {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          setTaxTotal(data.taxTotal ?? 0);
          setPricingConfig(data.pricingConfig ?? null);
        }
      })
      .catch(() => {
        if (active) setError("Network error loading cart.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function removeItem(itemId: string) {
    await fetch(`/api/cart/${itemId}`, { method: "DELETE" });
    setLoading(true);
    await refreshCart();
  }

  async function handleCheckout() {
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Checkout failed.");
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setError("Network error starting checkout.");
    } finally {
      setCheckingOut(false);
    }
  }

  const symbol = pricingConfig?.currency_symbol ?? "₹";
  const taxLabel = pricingConfig?.tax_label ?? "GST";
  const taxRate = pricingConfig?.tax_rate_percent ?? 18;

  return (
    <div className="space-y-8">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">Checkout</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Your Print Cart
        </h1>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="font-mono text-sm text-muted-ink">Loading cart...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border-ink bg-paper-elevated p-10 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-muted-ink" />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">
            Your cart is empty
          </h2>
          <p className="mt-1 text-sm text-muted-ink">
            Configure a product with instant pricing to begin.
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
          >
            Browse 6 Divisions
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-border-ink bg-paper-elevated p-5"
              >
                <div>
                  <p className="font-mono text-[11px] uppercase text-copper">
                    {item.divisionName}
                  </p>
                  <h3 className="mt-0.5 font-display text-lg font-bold text-ink">
                    {item.productName}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-muted-ink">
                    {item.config.width_mm} × {item.config.height_mm} mm ·{" "}
                    {item.config.shape} · Qty {item.quantity}
                  </p>
                  {item.price?.valid && item.price.discountPercent > 0 && (
                    <span className="mt-2 inline-block rounded bg-accent/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-deep">
                      Volume discount −{item.price.discountPercent}% applied
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="font-mono text-base font-bold text-ink">
                    {item.price?.valid
                      ? formatMoney(item.price.lineTotal, symbol)
                      : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="inline-flex items-center gap-1 text-xs text-muted-ink hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div>
              <label
                htmlFor="order-notes"
                className="block font-mono text-xs font-semibold uppercase text-ink"
              >
                Production Notes (Optional)
              </label>
              <textarea
                id="order-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery instructions or job reference..."
                className="mt-1.5 w-full rounded-md border border-border-ink bg-paper-elevated px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
              />
            </div>
          </div>

          <div className="h-fit rounded-xl border border-ink/20 bg-ink p-6 text-paper lg:col-span-5">
            <p className="font-mono text-xs uppercase text-accent">
              Order Summary
            </p>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between text-paper/80">
                <span>Items</span>
                <span className="font-mono">{items.length}</span>
              </div>
              <div className="flex justify-between text-paper/80">
                <span>
                  Included {taxLabel} ({taxRate}%)
                </span>
                <span className="font-mono">
                  {formatMoney(taxTotal, symbol)}
                </span>
              </div>
              <div className="border-t border-paper/15 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-base font-semibold">
                    Total ({taxLabel}-inclusive)
                  </span>
                  <span className="font-mono text-2xl font-bold text-accent">
                    {formatMoney(total, symbol)}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={checkingOut}
              onClick={handleCheckout}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-paper disabled:opacity-50"
            >
              {checkingOut ? "Redirecting to Stripe..." : "Pay with Stripe"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
