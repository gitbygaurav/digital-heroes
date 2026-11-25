"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, User } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  role: "customer" | "admin";
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function reloadUsers() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) setUsers(data.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users")
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (active && ok) setUsers(d.users ?? []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggleRole(user: UserRow) {
    const nextRole = user.role === "admin" ? "customer" : "admin";
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, role: nextRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error ?? "Failed to update role.");
      return;
    }
    setFeedback(`Updated ${user.email} to ${nextRole}.`);
    await reloadUsers();
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">
          Access Control (Decision D16)
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          User Management
        </h1>
      </div>

      {feedback && (
        <div className="rounded-md border border-ink/20 bg-paper-elevated px-4 py-2.5 font-mono text-xs text-ink">
          {feedback}
        </div>
      )}

      {loading ? (
        <p className="font-mono text-sm text-muted-ink">Loading users...</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-ink bg-paper-elevated p-4"
            >
              <div>
                <p className="font-display text-base font-bold text-ink">
                  {u.full_name ?? u.email}
                </p>
                <p className="font-mono text-xs text-muted-ink">
                  {u.email} · {u.company || "Individual"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-mono text-xs uppercase ${
                    u.role === "admin"
                      ? "bg-ink text-paper"
                      : "bg-paper-muted text-ink"
                  }`}
                >
                  {u.role === "admin" ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                  {u.role}
                </span>

                <button
                  type="button"
                  onClick={() => toggleRole(u)}
                  className="rounded border border-border-ink bg-paper px-3 py-1.5 font-mono text-xs text-ink hover:border-ink"
                >
                  Switch to {u.role === "admin" ? "customer" : "admin"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
