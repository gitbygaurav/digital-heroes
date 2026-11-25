import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/engine";
import { ReorderButton } from "@/components/customer/ReorderButton";
import { SubmitProofButton } from "@/components/customer/SubmitProofButton";
import { Download, Package } from "lucide-react";

const PIPELINE_STAGES = [
  "quote",
  "order",
  "artwork",
  "proof",
  "production",
  "completed",
];

export const metadata = {
  title: "Order History",
};

export default async function CustomerOrdersPage() {
  const session = await requireAuth();

  let orders: Array<{
    id: string;
    order_number: string;
    status: string;
    payment_status: string;
    total: number;
    proof_approved: boolean;
    reorder_of: string | null;
    created_at: string;
    order_items?: Array<{ id: string; quantity: number }>;
  }> = [];

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total, proof_approved, reorder_of, created_at, order_items(id, quantity)"
      )
      .eq("owner_id", session.userId)
      .order("created_at", { ascending: false });

    orders = (data ?? []) as typeof orders;
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">Order History</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Your Orders &amp; Pipeline Status
        </h1>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-border-ink bg-paper-elevated p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-ink" />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">
            No orders yet
          </h2>
          <Link
            href="/products"
            className="mt-5 inline-block rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
          >
            Configure a Product
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((ord) => {
            const stageIdx = PIPELINE_STAGES.indexOf(ord.status);
            const firstQty = ord.order_items?.[0]?.quantity ?? 50;

            return (
              <div
                key={ord.id}
                className="rounded-xl border border-border-ink bg-paper-elevated p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-base font-bold text-ink">
                        {ord.order_number}
                      </span>
                      <span className="rounded bg-ink px-2 py-0.5 font-mono text-[11px] uppercase text-paper">
                        {ord.status}
                      </span>
                      {ord.reorder_of && (
                        <span className="rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] text-muted-ink">
                          Reorder
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-ink">
                      Placed{" "}
                      {new Date(ord.created_at).toLocaleDateString("en-IN")} ·
                      Payment: {ord.payment_status} · Proof:{" "}
                      {ord.proof_approved ? "Approved" : "Pending"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-base font-bold text-ink">
                      {formatMoney(ord.total)}
                    </span>
                    <a
                      href={`/api/invoices/${ord.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-border-ink bg-paper px-3 py-1.5 font-mono text-xs text-ink hover:border-ink"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Invoice
                    </a>
                    {(ord.status === "order" || ord.status === "artwork") &&
                      ord.order_items?.[0]?.id && (
                        <SubmitProofButton orderItemId={ord.order_items[0].id} />
                      )}
                    <ReorderButton
                      orderId={ord.id}
                      defaultQuantity={firstQty}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-6 gap-1.5">
                  {PIPELINE_STAGES.map((stage, i) => (
                    <div key={stage} className="text-center">
                      <div
                        className={`h-1.5 rounded-full ${
                          i <= stageIdx ? "bg-accent-deep" : "bg-paper-muted"
                        }`}
                      />
                      <span className="mt-1 block font-mono text-[10px] uppercase text-muted-ink">
                        {stage}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
