"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShoppingCart } from "lucide-react";

export function DesignOrderButton({
  productId,
  designId,
  config,
}: {
  productId: string;
  designId: string;
  config: Record<string, unknown>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    setLoading(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          design_id: designId,
          config: {
            width_mm: Number(config.width_mm ?? 75),
            height_mm: Number(config.height_mm ?? 75),
            shape: String(config.shape ?? "rect"),
            quantity: Number(config.quantity ?? 50),
            selectedOptions:
              (config.selectedOptions as Record<string, string>) ?? {},
          },
        }),
      });
      if (res.ok) {
        router.push("/cart");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleAdd}
      className="inline-flex items-center gap-1.5 rounded-md bg-accent-deep px-3 py-1.5 text-xs font-semibold text-paper hover:bg-ink disabled:opacity-50"
    >
      <ShoppingCart className="h-3.5 w-3.5" />
      {loading ? "Adding..." : "Order Again"}
    </button>
  );
}
