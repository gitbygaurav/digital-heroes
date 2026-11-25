"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(
    signUpAction,
    initialState
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">
        Create account
      </h1>
      <p className="mt-1 text-sm text-muted-ink">
        Save artwork, approve proofs, and reorder in one click.
      </p>

      {state.error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {state.error}
        </div>
      )}

      {state.success && (
        <div
          role="status"
          className="mt-4 rounded-md border border-accent-deep/30 bg-accent/15 px-3.5 py-2.5 text-sm text-accent-deep"
        >
          {state.success}
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="full_name"
            className="block font-mono text-xs font-medium uppercase text-ink"
          >
            Full Name *
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            placeholder="Aarav Sharma"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block font-mono text-xs font-medium uppercase text-ink"
          >
            Email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="company"
              className="block font-mono text-xs font-medium uppercase text-ink"
            >
              Company
            </label>
            <input
              id="company"
              name="company"
              type="text"
              placeholder="Optional"
              className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="phone"
              className="block font-mono text-xs font-medium uppercase text-ink"
            >
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              placeholder="Optional"
              className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block font-mono text-xs font-medium uppercase text-ink"
          >
            Password *
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-accent-deep px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink disabled:opacity-60"
        >
          {isPending ? "Creating account..." : "Create customer account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-ink">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-accent-deep hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
