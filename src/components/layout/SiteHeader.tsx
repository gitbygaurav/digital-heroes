import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/guards";
import { signOutAction } from "@/app/(auth)/actions";
import { Layers, LogOut, ShieldCheck, User } from "lucide-react";

/**
 * Shared top navigation bar — adapts to visitor, customer, and admin roles.
 */
export async function SiteHeader() {
  const session = await getCurrentSession();

  return (
    <header className="sticky top-0 z-40 border-b border-border-ink bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-ink transition-opacity hover:opacity-80"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper">
              <Layers className="h-4 w-4 text-accent" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              DIGITAL HEROES
            </span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-6 text-sm font-medium text-muted-ink md:flex"
          >
            <Link href="/products" className="transition-colors hover:text-ink">
              Product Hub
            </Link>
            <Link href="/calculator" className="transition-colors hover:text-ink">
              Price Calculator
            </Link>
            <Link href="/gallery" className="transition-colors hover:text-ink">
              Live Work
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!session ? (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper-muted"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-accent-deep px-4 py-1.5 text-sm font-semibold text-paper transition-colors hover:bg-ink"
              >
                Start Order
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {session.role === "admin" ? (
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink/20 bg-ink px-3 py-1.5 text-xs font-mono font-medium text-paper transition-colors hover:bg-accent-deep"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                  Admin Console
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border-ink bg-paper-elevated px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ink"
                >
                  <User className="h-4 w-4 text-accent-deep" />
                  Dashboard
                </Link>
              )}

              <form action={signOutAction}>
                <button
                  type="submit"
                  title="Sign out"
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted-ink transition-colors hover:bg-paper-muted hover:text-ink"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
