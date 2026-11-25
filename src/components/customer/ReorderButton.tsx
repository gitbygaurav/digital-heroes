"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";

interface ReorderButtonProps {
  orderId: string;
  defaultQuantity?: number;
}

export function ReorderButton({
  orderId,
  defaultQuantity,
}: ReorderButtonProps) {
  const router = useRouter();
  const [qty, setQty] = useState<string>(
    defaultQuantity ? String(defaultQuantity) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReorder() {
    setLoading(true);
    setError(null);
    try {
      const parsedQty = qty ? Number(qty) : undefined;
      const res = await fetch("/api/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          quantity:
            parsedQty && Number.isFinite(parsedQty) && parsedQty > 0
              ? Math.trunc(parsedQty)
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Reorder failed.");
        return;
      }
      router.push(data.redirectTo ?? "/cart");
    } catch {
      setError("Network error during reorder.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {defaultQuantity !== undefined && (
          <input
            type="number"
            min={1}
            aria-label="Reorder quantity"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-20 rounded border border-border-ink bg-paper px-2 py-1 font-mono text-xs text-ink"
          />
        )}
        <button
          type="button"
          disabled={loading}
          onClick={handleReorder}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent-deep px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-ink disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {loading ? "Adding..." : "Reorder"}
        </button>
      </div>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
