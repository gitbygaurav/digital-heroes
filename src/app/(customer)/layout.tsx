import Link from "next/link";
import { Suspense } from "react";
import { requireAuth } from "@/lib/auth/guards";
import { signOutAction } from "@/app/(auth)/actions";
import { FileCheck, Layers, LogOut, Package, Palette, User } from "lucide-react";

async function CustomerShell({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-border-ink bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 text-ink">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper">
                <Layers className="h-4 w-4 text-accent" />
              </span>
              <span className="font-display text-base font-bold tracking-tight">
                DIGITAL HEROES
              </span>
            </Link>

            <nav className="hidden items-center gap-5 text-sm font-medium text-muted-ink md:flex">
              <Link href="/dashboard" className="hover:text-ink">
                Overview
              </Link>
              <Link href="/orders" className="inline-flex items-center gap-1.5 hover:text-ink">
                <Package className="h-3.5 w-3.5" />
                Orders
              </Link>
              <Link href="/designs" className="inline-flex items-center gap-1.5 hover:text-ink">
                <Palette className="h-3.5 w-3.5" />
                Saved Designs
              </Link>
              <Link href="/proofs" className="inline-flex items-center gap-1.5 hover:text-ink">
                <FileCheck className="h-3.5 w-3.5" />
                Proofs
              </Link>
              <Link href="/cart" className="hover:text-ink">
                Cart
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted-ink sm:inline">
              <User className="mr-1 inline h-3.5 w-3.5" />
              {session.profile.full_name ?? session.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md border border-border-ink bg-paper-elevated px-3 py-1.5 text-xs font-medium text-ink hover:border-ink"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper font-mono text-xs text-muted-ink">
          Loading customer portal...
        </div>
      }
    >
      <CustomerShell>{children}</CustomerShell>
    </Suspense>
  );
}
