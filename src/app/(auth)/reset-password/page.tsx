"use client";

import { useActionState } from "react";
import {
  resetPasswordAction,
  type AuthActionState,
} from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    initialState
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">
        Set new password
      </h1>
      <p className="mt-1 text-sm text-muted-ink">
        Choose a strong password for your account.
      </p>

      {state.error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {state.error}
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block font-mono text-xs font-medium uppercase text-ink"
          >
            New Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block font-mono text-xs font-medium uppercase text-ink"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-accent-deep px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink disabled:opacity-60"
        >
          {isPending ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
