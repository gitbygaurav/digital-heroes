"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export default function CustomerAccountPage() {
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          company,
          phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? "Failed to update profile.");
      } else {
        setStatus("Profile updated successfully.");
      }
    } catch {
      setStatus("Network error updating profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">
          Account Settings
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Profile &amp; Billing Details
        </h1>
      </div>

      {status && (
        <div className="flex items-center gap-2 rounded-md border border-accent-deep/30 bg-accent/15 px-4 py-3 text-sm text-ink">
          <CheckCircle2 className="h-4 w-4 text-accent-deep" />
          {status}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-xl border border-border-ink bg-paper-elevated p-6"
      >
        <div>
          <label
            htmlFor="acc-name"
            className="block font-mono text-xs font-semibold uppercase text-ink"
          >
            Full Name *
          </label>
          <input
            id="acc-name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink"
          />
        </div>

        <div>
          <label
            htmlFor="acc-company"
            className="block font-mono text-xs font-semibold uppercase text-ink"
          >
            Company
          </label>
          <input
            id="acc-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company or club name"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink"
          />
        </div>

        <div>
          <label
            htmlFor="acc-phone"
            className="block font-mono text-xs font-semibold uppercase text-ink"
          >
            Phone
          </label>
          <input
            id="acc-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 ..."
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
