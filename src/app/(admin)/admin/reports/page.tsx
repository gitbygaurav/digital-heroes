import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney } from "@/lib/pricing/engine";
import { Download } from "lucide-react";

export const metadata = {
  title: "Admin Reports & Xero Export",
};

export default async function AdminReportsPage() {
  await requireAdmin();

  let totalOrders = 0;
  let paidRevenue = 0;
  let approvedCount = 0;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    const admin = createAdminClient();
    const { data: orders } = await admin
      .from("orders")
      .select("total, payment_status, proof_approved");

    for (const o of orders ?? []) {
      totalOrders += 1;
      if (o.payment_status === "paid") paidRevenue += Number(o.total);
      if (o.proof_approved) approvedCount += 1;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-ink pb-5">
        <div>
          <p className="font-mono text-xs uppercase text-copper">
            Analytics &amp; Accounting
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-ink">
            Reports &amp; Xero Export
          </h1>
        </div>

        <a
          href="/api/admin/reports/xero"
          className="inline-flex items-center gap-2 rounded-md bg-accent-deep px-4 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
        >
          <Download className="h-4 w-4" />
          Export to Xero CSV
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border-ink bg-paper-elevated p-5">
          <p className="font-mono text-xs uppercase text-muted-ink">
            Total Orders
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-ink">
            {totalOrders}
          </p>
        </div>

        <div className="rounded-xl border border-border-ink bg-paper-elevated p-5">
          <p className="font-mono text-xs uppercase text-muted-ink">
            Paid Revenue (GST-Inclusive)
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-accent-deep">
            {formatMoney(paidRevenue)}
          </p>
        </div>

        <div className="rounded-xl border border-border-ink bg-paper-elevated p-5">
          <p className="font-mono text-xs uppercase text-muted-ink">
            Proofs Approved
          </p>
          <p className="mt-2 font-display text-3xl font-bold text-ink">
            {approvedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
