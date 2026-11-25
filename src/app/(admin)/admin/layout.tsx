import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { signOutAction } from "@/app/(auth)/actions";
import { BarChart3, Layers, LogOut, PackageCheck, ShieldCheck, Users } from "lucide-react";

async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-40 border-b border-ink/20 bg-ink text-paper">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 text-paper">
              <ShieldCheck className="h-5 w-5 text-accent" />
              <span className="font-display text-base font-bold tracking-tight">
                DIGITAL HEROES <span className="font-mono text-xs text-accent">ADMIN</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-5 text-sm font-medium text-paper/80 md:flex">
              <Link href="/admin" className="hover:text-paper">
                Pipeline
              </Link>
              <Link href="/admin/products" className="inline-flex items-center gap-1.5 hover:text-paper">
                <Layers className="h-3.5 w-3.5" />
                Catalogue
              </Link>
              <Link href="/admin/users" className="inline-flex items-center gap-1.5 hover:text-paper">
                <Users className="h-3.5 w-3.5" />
                Users
              </Link>
              <Link href="/admin/reports" className="inline-flex items-center gap-1.5 hover:text-paper">
                <BarChart3 className="h-3.5 w-3.5" />
                Reports
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-xs text-paper/70 sm:inline">
              <PackageCheck className="mr-1 inline h-3.5 w-3.5 text-accent" />
              {session.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md border border-paper/20 px-3 py-1.5 text-xs font-medium text-paper hover:bg-paper/10"
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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper font-mono text-xs text-muted-ink">
          Loading admin console...
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
