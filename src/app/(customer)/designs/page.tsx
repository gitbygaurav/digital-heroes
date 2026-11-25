import Link from "next/link";
import { requireAuth } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { DesignOrderButton } from "@/components/customer/DesignOrderButton";
import { Palette } from "lucide-react";

export const metadata = {
  title: "Saved Designs",
};

export default async function SavedDesignsPage() {
  const session = await requireAuth();

  let designs: Array<{
    id: string;
    product_id: string;
    name: string;
    source: string;
    is_approved: boolean;
    config: Record<string, unknown>;
    updated_at: string;
  }> = [];

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("designs")
      .select("id, product_id, name, source, is_approved, config, updated_at")
      .eq("owner_id", session.userId)
      .order("updated_at", { ascending: false });

    designs = (data ?? []) as typeof designs;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-ink pb-5">
        <div>
          <p className="font-mono text-xs uppercase text-copper">
            Saved Artwork
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-ink">
            Saved Designs &amp; Configurations
          </h1>
        </div>
        <Link
          href="/designer"
          className="rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-paper hover:bg-ink"
        >
          Create New Design
        </Link>
      </div>

      {designs.length === 0 ? (
        <div className="rounded-xl border border-border-ink bg-paper-elevated p-10 text-center">
          <Palette className="mx-auto h-10 w-10 text-muted-ink" />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">
            No saved designs yet
          </h2>
          <p className="mt-1 text-sm text-muted-ink">
            Save artwork in the Web-to-Print Designer for one-click repeat
            ordering.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => (
            <div
              key={d.id}
              className="flex flex-col justify-between rounded-xl border border-border-ink bg-paper-elevated p-5"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] uppercase text-ink">
                    {d.source}
                  </span>
                  {d.is_approved && (
                    <span className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-deep">
                      Approved
                    </span>
                  )}
                </div>
                <h2 className="mt-3 font-display text-lg font-bold text-ink">
                  {d.name}
                </h2>
                <p className="mt-1 font-mono text-xs text-muted-ink">
                  Size: {String(d.config.width_mm ?? "—")} ×{" "}
                  {String(d.config.height_mm ?? "—")} mm · Shape:{" "}
                  {String(d.config.shape ?? "rect")}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-ink">
                  Default Qty: {String(d.config.quantity ?? 50)}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border-ink pt-4">
                <span className="font-mono text-[11px] text-muted-ink">
                  {new Date(d.updated_at).toLocaleDateString("en-IN")}
                </span>
                <DesignOrderButton
                  productId={d.product_id}
                  designId={d.id}
                  config={d.config}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
