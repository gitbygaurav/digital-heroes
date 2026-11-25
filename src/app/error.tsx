"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-copper" />
      <h1 className="mt-4 font-display text-3xl font-bold text-ink">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-ink">
        {error.message || "An unexpected error occurred."}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-border-ink bg-paper-elevated px-5 py-2.5 text-sm font-semibold text-ink hover:border-ink"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
