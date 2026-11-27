"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, type AuthActionState } from "@/app/(auth)/actions";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const initialState: AuthActionState = {};

function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    signInAction,
    initialState
  );
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const callbackError = searchParams.get("error");
  const verified = searchParams.get("verified");

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-muted-ink">
        Access your designs, proofs, orders, and one-click reorders.
      </p>

      {verified && (
        <div
          role="status"
          className="mt-4 rounded-md border border-accent-deep/30 bg-accent/15 px-3.5 py-2.5 text-sm text-accent-deep"
        >
          Email verified! Please sign in with your email and password.
        </div>
      )}

      {(state.error || callbackError) && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
        >
          {state.error ??
            (callbackError === "auth_callback_failed"
              ? "Authentication verification failed. Please try again."
              : callbackError)}
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />

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
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted-ink/60 focus:border-accent-deep focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block font-mono text-xs font-medium uppercase text-ink"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-accent-deep hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink focus:border-accent-deep focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-accent-deep px-4 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink disabled:opacity-60"
        >
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-ink">
        New to Digital Heroes?{" "}
        <Link
          href="/register"
          className="font-semibold text-accent-deep hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-sm">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
