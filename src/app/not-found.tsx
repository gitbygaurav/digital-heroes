import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-copper">
        Error 404
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-ink">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-ink">
        The requested product, order, or console route does not exist.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink"
      >
        Return to Digital Heroes
      </Link>
    </div>
  );
}
