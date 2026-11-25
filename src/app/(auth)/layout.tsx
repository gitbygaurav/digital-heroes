import Link from "next/link";
import { Layers } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2.5 text-ink transition-opacity hover:opacity-80"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-paper">
          <Layers className="h-4 w-4 text-accent" />
        </span>
        <span className="font-display text-xl font-bold tracking-tight">
          DIGITAL HEROES
        </span>
      </Link>

      <div className="w-full max-w-md rounded-xl border border-border-ink bg-paper-elevated p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </div>
  );
}
