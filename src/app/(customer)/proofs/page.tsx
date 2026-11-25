"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck, MessageSquareWarning } from "lucide-react";

interface ProofRow {
  id: string;
  version: number;
  status: string;
  file_path: string;
  created_at: string;
  order_items?: {
    orders?: {
      order_number: string;
      status: string;
      proof_approved: boolean;
    };
  };
  change_requests?: Array<{
    id: string;
    message: string;
    status: string;
    created_at: string;
  }>;
}

export default function CustomerProofsPage() {
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageMap, setMessageMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/proofs");
    const data = await res.json();
    if (res.ok) setProofs(data.proofs ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/proofs")
      .then((r) => r.json())
      .then((data) => {
        if (active) setProofs(data.proofs ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleApprove(proofId: string) {
    setFeedback(null);
    const res = await fetch(`/api/proofs/${proofId}/approve`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? "Approval failed.");
      return;
    }
    setFeedback("Proof approved! Production files are now unlocked for print.");
    await reload();
  }

  async function handleRequestChanges(proofId: string) {
    const msg = (messageMap[proofId] ?? "").trim();
    if (msg.length < 3) {
      setFeedback("Please enter a short note describing what to change.");
      return;
    }
    setFeedback(null);
    const res = await fetch(`/api/proofs/${proofId}/request-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? "Failed to submit change request.");
      return;
    }
    setFeedback("Change request sent to our production team.");
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">
          Versioned Proofing
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Proofs &amp; Approvals
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Every revision is logged. Production begins only once you approve a
          proof version.
        </p>
      </div>

      {feedback && (
        <div className="rounded-md border border-accent-deep/30 bg-accent/15 px-4 py-3 text-sm text-ink">
          {feedback}
        </div>
      )}

      {loading ? (
        <p className="font-mono text-sm text-muted-ink">Loading proofs...</p>
      ) : proofs.length === 0 ? (
        <div className="rounded-xl border border-border-ink bg-paper-elevated p-10 text-center">
          <FileCheck className="mx-auto h-10 w-10 text-muted-ink" />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">
            No proofs awaiting review
          </h2>
          <p className="mt-1 text-sm text-muted-ink">
            When you place an order and submit artwork, proof v1 appears here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {proofs.map((proof) => (
            <div
              key={proof.id}
              className="rounded-xl border border-border-ink bg-paper-elevated p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="font-mono text-xs font-semibold text-copper">
                    {proof.order_items?.orders?.order_number ?? "Order"} · PROOF v
                    {proof.version}
                  </span>
                  <p className="mt-1 font-mono text-xs text-muted-ink">
                    File: {proof.file_path}
                  </p>
                </div>

                <span
                  className={`rounded px-2.5 py-1 font-mono text-xs font-semibold uppercase ${
                    proof.status === "approved"
                      ? "bg-accent/25 text-accent-deep"
                      : proof.status === "changes_requested"
                        ? "bg-copper/20 text-ink"
                        : proof.status === "superseded"
                          ? "bg-paper-muted text-muted-ink"
                          : "bg-ink text-paper"
                  }`}
                >
                  {proof.status.replace("_", " ")}
                </span>
              </div>

              {proof.change_requests && proof.change_requests.length > 0 && (
                <div className="mt-4 space-y-1 rounded-md border border-border-ink bg-paper p-3">
                  {proof.change_requests.map((cr) => (
                    <p key={cr.id} className="text-xs text-muted-ink">
                      <strong className="font-mono text-ink">
                        [{cr.status}]
                      </strong>{" "}
                      {cr.message}
                    </p>
                  ))}
                </div>
              )}

              {proof.status === "pending" && (
                <div className="mt-5 flex flex-col gap-3 border-t border-border-ink pt-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => handleApprove(proof.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent-deep px-4 py-2 text-sm font-semibold text-paper hover:bg-ink"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve Proof v{proof.version}
                  </button>

                  <div className="flex flex-1 gap-2">
                    <input
                      type="text"
                      placeholder="Describe needed changes..."
                      value={messageMap[proof.id] ?? ""}
                      onChange={(e) =>
                        setMessageMap((prev) => ({
                          ...prev,
                          [proof.id]: e.target.value,
                        }))
                      }
                      className="flex-1 rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => handleRequestChanges(proof.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-ink bg-paper px-3.5 py-2 text-sm font-medium text-ink hover:border-ink"
                    >
                      <MessageSquareWarning className="h-4 w-4 text-copper" />
                      Request Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
