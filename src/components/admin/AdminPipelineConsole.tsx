"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing/engine";
import { getNextValidStages } from "@/lib/pipeline/transitions";
import type { OrderStatus } from "@/types/orders";
import { Archive, Download, Lock, Search, Unlock } from "lucide-react";

interface AdminOrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: string;
  total: number;
  proof_approved: boolean;
  archived_at: string | null;
  created_at: string;
  profiles?: {
    email?: string;
    full_name?: string;
    company?: string;
  };
  order_items?: Array<{
    id: string;
    quantity: number;
    products?: { name?: string; product_type?: string };
  }>;
}

const STATUS_OPTIONS = [
  "all",
  "quote",
  "order",
  "artwork",
  "proof",
  "production",
  "completed",
  "cancelled",
];

export function AdminPipelineConsole() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<
    Record<string, Array<{ file_name: string; signed_url: string | null }>>
  >({});

  async function fetchOrders(
    nextStatus = statusFilter,
    nextSearch = search,
    nextArchived = archived
  ) {
    setLoading(true);
    const params = new URLSearchParams({
      status: nextStatus,
      q: nextSearch,
      archived: String(nextArchived),
    });
    try {
      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders ?? []);
        setTotal(data.total ?? 0);
      } else {
        setFeedback(data.error ?? "Failed to load orders.");
      }
    } catch {
      setFeedback("Network error loading orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/orders?status=all&q=&archived=false")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (ok) {
          setOrders(data.orders ?? []);
          setTotal(data.total ?? 0);
        } else {
          setFeedback(data.error ?? "Failed to load orders.");
        }
      })
      .catch(() => {
        if (active) setFeedback("Network error loading orders.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleTransition(orderId: string, toStatus: OrderStatus) {
    setFeedback(null);
    const note =
      toStatus === "cancelled"
        ? window.prompt("Enter cancellation reason (min 3 chars):") ?? ""
        : undefined;

    const res = await fetch(`/api/admin/orders/${orderId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? "Transition rejected.");
      return;
    }
    setFeedback(`Order moved to ${toStatus}.`);
    await fetchOrders();
  }

  async function handleArchive(orderId: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: "completed", archive: true }),
    });
    if (res.ok) {
      setFeedback("Order archived.");
      await fetchOrders();
    }
  }

  async function handleGenerateProof(orderItemId: string) {
    setFeedback(null);
    const res = await fetch("/api/proofs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_item_id: orderItemId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? "Failed to generate proof.");
      return;
    }
    setFeedback(`Generated Proof v${data.proof?.version ?? 1} (pending customer approval).`);
    await fetchOrders();
  }

  async function handleGeneratePrintFiles(orderItemId: string) {
    setFeedback(null);
    const res = await fetch("/api/print-files/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_item_id: orderItemId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(`HTTP ${res.status}: ${data.error ?? "Failed to generate print files."}`);
      return;
    }
    setFeedback(`Generated ${(data.print_files ?? []).length} print-ready file(s) (PDF + PNG).`);
  }

  async function handleCsvMerge(orderItemId: string, file: File) {
    setFeedback("Running server-side CSV variable-data merge...");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("order_item_id", orderItemId);
    const res = await fetch("/api/csv-merge", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(`CSV Merge error: ${data.error ?? "Failed"}`);
      return;
    }
    const errCount = (data.error_report ?? []).length;
    setFeedback(
      `CSV Merge done: generated ${data.generated_count} row PDFs + ZIP. Bad rows reported: ${errCount}.`
    );
  }

  async function handleDownloadPrintFiles(orderId: string) {
    setFeedback(null);
    const res = await fetch(`/api/print-files/${orderId}`);
    const data = await res.json();
    if (!res.ok) {
      setFeedback(`HTTP ${res.status}: ${data.error ?? "Access denied."}`);
      return;
    }
    if (!data.files || data.files.length === 0) {
      setFeedback("Approval gate passed, but no print files generated yet — click 'Generate Print Files' first.");
      return;
    }
    setDownloadLinks((prev) => ({ ...prev, [orderId]: data.files }));
    setFeedback(`Unlocked ${data.files.length} print-ready file(s) for download.`);
  }

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-ink bg-paper-elevated p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-ink" />
            <input
              type="search"
              placeholder="Search order # (e.g. DH-001001)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchOrders(statusFilter, search, archived);
              }}
              className="w-full rounded-md border border-border-ink bg-paper py-2 pl-9 pr-3 font-mono text-xs text-ink"
            />
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              void fetchOrders(e.target.value, search, archived);
            }}
            className="rounded-md border border-border-ink bg-paper px-3 py-2 font-mono text-xs uppercase text-ink"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All Stages" : s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              const next = !archived;
              setArchived(next);
              void fetchOrders(statusFilter, search, next);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 font-mono text-xs ${
              archived
                ? "border-ink bg-ink text-paper"
                : "border-border-ink bg-paper text-ink"
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            {archived ? "Viewing Archived" : "Show Archived"}
          </button>
        </div>

        <span className="font-mono text-xs text-muted-ink">
          {total} jobs found
        </span>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-md border border-ink/20 bg-paper-elevated px-4 py-3 font-mono text-xs text-ink"
        >
          {feedback}
        </div>
      )}

      {/* Job Table */}
      {loading ? (
        <p className="font-mono text-sm text-muted-ink">Loading jobs...</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border-ink bg-paper-elevated p-8 text-center text-sm text-muted-ink">
          No jobs match the current filter.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((ord) => {
            const nextStages = getNextValidStages(ord.status, ord.proof_approved);

            return (
              <div
                key={ord.id}
                className="rounded-xl border border-border-ink bg-paper-elevated p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-base font-bold text-ink">
                        {ord.order_number}
                      </span>
                      <span className="rounded bg-ink px-2 py-0.5 font-mono text-[11px] uppercase text-paper">
                        {ord.status}
                      </span>
                      {ord.proof_approved ? (
                        <span className="inline-flex items-center gap-1 rounded bg-accent/25 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-deep">
                          <Unlock className="h-3 w-3" />
                          Ready for Production
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] text-muted-ink">
                          <Lock className="h-3 w-3" />
                          Files Locked (Awaiting Proof)
                        </span>
                      )}
                    </div>

                    <p className="mt-1.5 text-xs text-muted-ink">
                      Customer:{" "}
                      <strong className="text-ink">
                        {ord.profiles?.full_name ?? ord.profiles?.email ?? "—"}
                      </strong>{" "}
                      ({ord.profiles?.company || "Individual"}) · Total:{" "}
                      <span className="font-mono font-semibold text-ink">
                        {formatMoney(ord.total)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {ord.order_items?.[0]?.id &&
                      (ord.status === "order" ||
                        ord.status === "artwork" ||
                        ord.status === "proof") && (
                        <button
                          type="button"
                          onClick={() =>
                            handleGenerateProof(ord.order_items![0].id)
                          }
                          className="rounded border border-accent-deep/40 bg-accent/15 px-3 py-1.5 font-mono text-xs font-semibold text-accent-deep hover:bg-accent/25"
                        >
                          Generate Proof
                        </button>
                      )}

                    {ord.order_items?.[0]?.id && ord.proof_approved && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleGeneratePrintFiles(ord.order_items![0].id)
                          }
                          className="rounded border border-ink/30 bg-paper px-3 py-1.5 font-mono text-xs font-semibold text-ink hover:border-ink"
                        >
                          Generate Print Files
                        </button>
                        <label className="cursor-pointer rounded border border-ink/30 bg-paper px-3 py-1.5 font-mono text-xs font-semibold text-ink hover:border-ink">
                          CSV Merge
                          <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void handleCsvMerge(ord.order_items![0].id, f);
                            }}
                          />
                        </label>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownloadPrintFiles(ord.id)}
                      className="inline-flex items-center gap-1.5 rounded border border-border-ink bg-paper px-3 py-1.5 font-mono text-xs text-ink hover:border-ink"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Print Files
                    </button>

                    {nextStages.map((next) => (
                      <button
                        key={next}
                        type="button"
                        onClick={() => handleTransition(ord.id, next)}
                        className={`rounded px-3 py-1.5 font-mono text-xs font-semibold uppercase ${
                          next === "cancelled"
                            ? "border border-danger/30 text-danger hover:bg-danger/10"
                            : "bg-accent-deep text-paper hover:bg-ink"
                        }`}
                      >
                        → {next}
                      </button>
                    ))}

                    {ord.status === "completed" && !ord.archived_at && (
                      <button
                        type="button"
                        onClick={() => handleArchive(ord.id)}
                        className="rounded border border-border-ink bg-paper px-3 py-1.5 font-mono text-xs text-muted-ink hover:text-ink"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>

                {downloadLinks[ord.id] && downloadLinks[ord.id].length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border-ink pt-3">
                    {downloadLinks[ord.id].map((f) =>
                      f.signed_url ? (
                        <a
                          key={f.file_name}
                          href={f.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-accent/20 px-2.5 py-1 font-mono text-xs font-semibold text-accent-deep hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          {f.file_name}
                        </a>
                      ) : (
                        <span
                          key={f.file_name}
                          className="font-mono text-xs text-muted-ink"
                        >
                          {f.file_name}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
