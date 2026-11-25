import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border-ink bg-paper-elevated">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-sm font-bold tracking-tight text-ink">
            DIGITAL HEROES PRINT HOUSE
          </p>
          <p className="mt-1 font-mono text-xs text-muted-ink">
            6 DIVISIONS · PARAMETER-DRIVEN · SERVER-SIDE PRINT ENGINE
          </p>
        </div>

        <div className="flex flex-wrap gap-5 text-xs font-medium text-muted-ink">
          <Link href="/products" className="hover:text-ink">
            Product Hub
          </Link>
          <Link href="/calculator" className="hover:text-ink">
            Calculator
          </Link>
          <Link href="/gallery" className="hover:text-ink">
            Gallery
          </Link>
          <Link href="/login" className="hover:text-ink">
            Customer Portal
          </Link>
        </div>
      </div>
    </footer>
  );
}
