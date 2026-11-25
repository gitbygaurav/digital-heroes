import { requireAdmin } from "@/lib/auth/guards";
import { AdminPipelineConsole } from "@/components/admin/AdminPipelineConsole";

export const metadata = {
  title: "Admin Production Pipeline",
};

export default async function AdminDashboardPage() {
  const session = await requireAdmin();

  return (
    <div className="space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">
          Internal Production Console
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Production Pipeline &amp; Job Database
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Signed in as <span className="font-mono text-ink">{session.email}</span> ·
          Quote → Order → Artwork → Proof → Production → Completed
        </p>
      </div>

      <AdminPipelineConsole />
    </div>
  );
}
