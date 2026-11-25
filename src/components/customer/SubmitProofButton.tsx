"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileCheck } from "lucide-react";

export function SubmitProofButton({ orderItemId }: { orderItemId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch("/api/proofs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_item_id: orderItemId }),
      });
      if (res.ok) {
        router.push("/proofs");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleSubmit}
      className="inline-flex items-center gap-1 rounded border border-accent-deep/40 bg-accent/15 px-3 py-1.5 font-mono text-xs font-semibold text-accent-deep hover:bg-accent/25 disabled:opacity-50"
    >
      <FileCheck className="h-3.5 w-3.5" />
      {loading ? "Generating..." : "Generate Proof"}
    </button>
  );
}
