"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  type AuthActionState,
} from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    forgotPasswordAction,
    initialState
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">
        Reset password
      </h1>
      <p className="mt-1 text-sm text-muted-ink">
        Enter your email and we will send you a password reset link.
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
            htmlFor="email"
            className="block font-mono text-xs font-medium uppercase text-ink"
          >
            Email
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

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-accent-deep px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink disabled:opacity-60"
        >
          {isPending ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-ink">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-accent-deep hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
