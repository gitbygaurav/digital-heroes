import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pricing/engine";
import { ReorderButton } from "@/components/customer/ReorderButton";
import {
  ArrowRight,
  Download,
  FileCheck,
  Package,
  Palette,
  User,
} from "lucide-react";

const PIPELINE_STAGES = [
  "quote",
  "order",
  "artwork",
  "proof",
  "production",
  "completed",
];

export default async function CustomerDashboardPage() {
  const session = await requireAuth();

  let orders: Array<{
    id: string;
    order_number: string;
    status: string;
    total: number;
    currency: string;
    proof_approved: boolean;
    created_at: string;
  }> = [];

  let designs: Array<{
    id: string;
    name: string;
    source: string;
    is_approved: boolean;
    config: Record<string, unknown>;
  }> = [];

  let proofs: Array<{
    id: string;
    version: number;
    status: string;
  }> = [];

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = await createClient();
    const [ordRes, desRes, prfRes] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, status, total, currency, proof_approved, created_at"
        )
        .eq("owner_id", session.userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("designs")
        .select("id, name, source, is_approved, config")
        .eq("owner_id", session.userId)
        .order("updated_at", { ascending: false })
        .limit(4),
      supabase
        .from("proofs")
        .select("id, version, status")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    orders = ordRes.data ?? [];
    designs = desRes.data ?? [];
    proofs = prfRes.data ?? [];
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-ink pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase text-copper">
            Customer Dashboard
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-ink">
            Welcome, {session.profile.full_name ?? session.email}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-ink">
            Account: {session.profile.company || "Individual"} ·{" "}
            {session.profile.account_id ?? "Active"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/designer"
            className="rounded-md border border-border-ink bg-paper-elevated px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
          >
            Open Designer
          </Link>
          <Link
            href="/products"
            className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-paper hover:bg-ink"
          >
            New Print Job
          </Link>
        </div>
      </div>

      {/* Module 1: Account & Profile Status + Summary Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/account"
          className="rounded-xl border border-border-ink bg-paper-elevated p-5 transition-colors hover:border-ink"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase text-muted-ink">
              1. Account &amp; Profile
            </span>
            <User className="h-4 w-4 text-accent-deep" />
          </div>
          <p className="mt-2 font-display text-lg font-bold text-ink">
            {session.email}
          </p>
          <p className="mt-1 text-xs text-accent-deep">
            Manage profile &amp; settings →
          </p>
        </Link>

        <Link
          href="/orders"
          className="rounded-xl border border-border-ink bg-paper-elevated p-5 transition-colors hover:border-ink"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase text-muted-ink">
              2. Order History
            </span>
            <Package className="h-4 w-4 text-accent-deep" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-ink">
            {orders.length}
          </p>
          <p className="mt-1 text-xs text-accent-deep">
            Track pipeline &amp; invoices →
          </p>
        </Link>

        <Link
          href="/proofs"
          className="rounded-xl border border-border-ink bg-paper-elevated p-5 transition-colors hover:border-ink"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase text-muted-ink">
              4. Active Proofs
            </span>
            <FileCheck className="h-4 w-4 text-accent-deep" />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-ink">
            {proofs.filter((p) => p.status === "pending").length} pending
          </p>
          <p className="mt-1 text-xs text-accent-deep">
            Review &amp; approve proofs →
          </p>
        </Link>
      </div>

      {/* Module 2, 5 & 6: Order History + Pipeline Tracker + Reorder + Invoices */}
      <section className="rounded-xl border border-border-ink bg-paper-elevated p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">
            Recent Orders &amp; One-Click Reorder
          </h2>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-deep hover:underline"
          >
            All orders <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-muted-ink">
            No orders yet. Configure a product or open the designer to place
            your first order.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {orders.map((ord) => {
              const stageIdx = PIPELINE_STAGES.indexOf(ord.status);
              return (
                <div
                  key={ord.id}
                  className="rounded-lg border border-border-ink bg-paper p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-mono text-sm font-bold text-ink">
                        {ord.order_number}
                      </span>
                      <span className="ml-3 rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] uppercase text-ink">
                        {ord.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-ink">
                        {formatMoney(ord.total)}
                      </span>
                      <a
                        href={`/api/invoices/${ord.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-border-ink bg-paper-elevated px-2.5 py-1.5 font-mono text-xs text-ink hover:border-ink"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Invoice PDF
                      </a>
                      <ReorderButton orderId={ord.id} />
                    </div>
                  </div>

                  {/* Pipeline Tracker */}
                  <div className="mt-3 grid grid-cols-6 gap-1">
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
      </section>

      {/* Module 3: Scope / Configuration of Saved Designs */}
      <section className="rounded-xl border border-border-ink bg-paper-elevated p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-accent-deep" />
            <h2 className="font-display text-xl font-bold text-ink">
              Saved Designs &amp; Configurations
            </h2>
          </div>
          <Link
            href="/designs"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-deep hover:underline"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {designs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-ink">
            No saved designs yet. Create one in the Web-to-Print Designer.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {designs.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-border-ink bg-paper p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-ink">
                    {d.name}
                  </h3>
                  <span className="rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] uppercase text-ink">
                    {d.source}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-ink">
                  {String(d.config.width_mm ?? "—")} ×{" "}
                  {String(d.config.height_mm ?? "—")} mm · Qty{" "}
                  {String(d.config.quantity ?? "—")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
