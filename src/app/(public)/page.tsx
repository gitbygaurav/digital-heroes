import Link from "next/link";
import { ArrowRight, Calculator, Layers, ShieldCheck, Sparkles } from "lucide-react";

const DIVISIONS = [
  {
    slug: "labels-stickers",
    name: "Labels & Stickers",
    spec: "DIE-CUT · VINYL / PAPER",
    summary: "Custom shapes, mm-accurate sizing, matte or gloss finishes.",
  },
  {
    slug: "race-event-numbers",
    name: "Race & Event Numbers",
    spec: "CSV MERGE · TYVEK / PAPER",
    summary: "Variable-data bib numbers with automatic placeholder fitting.",
  },
  {
    slug: "mtb-boards",
    name: "MTB Boards",
    spec: "CORRUGATED · BULK JOBS",
    summary: "Number + rider name plates ready for trail and downhill races.",
  },
  {
    slug: "stamps",
    name: "Stamps",
    spec: "SELF-INKING · SHRINK-TO-FIT",
    summary: "Multi-line text stamps with live ink colour and orientation.",
  },
  {
    slug: "trophies",
    name: "Trophies",
    spec: "PLAQUE · ACRYLIC / WOOD",
    summary: "Precision engraving text with min/max font constraints.",
  },
  {
    slug: "laser-cut-work",
    name: "Laser-Cut Work",
    spec: "VECTOR UPLOAD · CUT-PATH",
    summary: "Acrylic, plywood, and MDF cut to your vector specifications.",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border-ink bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border-ink bg-paper-elevated px-3 py-1 font-mono text-xs font-medium text-accent-deep">
              <Sparkles className="h-3.5 w-3.5 text-copper" />
              BOUTIQUE INDUSTRIAL WEB-TO-PRINT
            </p>
            <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
              Precision print,{" "}
              <span className="italic font-serif font-normal text-accent-deep">
                engineered
              </span>{" "}
              from browser to press.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-ink sm:text-lg">
              Six specialized production divisions under one roof. Configure exact
              millimetre specs, see instant GST-inclusive pricing, design inside
              locked print zones, and approve versioned proofs.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/calculator"
                className="inline-flex items-center gap-2 rounded-md bg-accent-deep px-5 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink"
              >
                <Calculator className="h-4 w-4" />
                Instant Price Calculator
              </Link>
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-md border border-border-ink bg-paper-elevated px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink"
              >
                Explore 6 Divisions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-4 border-t border-border-ink pt-8 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <Layers className="mt-0.5 h-5 w-5 text-accent-deep" />
              <div>
                <p className="font-mono text-xs font-semibold uppercase text-ink">
                  6 Product Divisions
                </p>
                <p className="mt-1 text-xs text-muted-ink">
                  Parameter-driven catalogue — zero per-size SKUs.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-accent-deep" />
              <div>
                <p className="font-mono text-xs font-semibold uppercase text-ink">
                  Locked Proof Gate
                </p>
                <p className="mt-1 text-xs text-muted-ink">
                  Print-ready PDF/PNG & CSV merge unlock only after approval.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calculator className="mt-0.5 h-5 w-5 text-accent-deep" />
              <div>
                <p className="font-mono text-xs font-semibold uppercase text-ink">
                  Instant Transparent Pricing
                </p>
                <p className="mt-1 text-xs text-muted-ink">
                  Volume discounts and VAT/GST-inclusive totals at a glance.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6 Divisions Hub Preview */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-copper">
              Production Hub
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
              Six Divisions, One Console
            </h2>
          </div>
          <Link
            href="/products"
            className="text-sm font-semibold text-accent-deep hover:underline"
          >
            View all →
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DIVISIONS.map((div, index) => (
            <Link
              key={div.slug}
              href={`/products/${div.slug}`}
              className="group flex flex-col justify-between rounded-lg border border-border-ink bg-paper-elevated p-6 transition-all hover:-translate-y-0.5 hover:border-ink"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-ink">
                    0{index + 1}
                  </span>
                  <span className="rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] font-medium text-ink">
                    {div.spec}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-ink group-hover:text-accent-deep">
                  {div.name}
                </h3>
                <p className="mt-2 text-sm text-muted-ink">{div.summary}</p>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-accent-deep">
                Configure & price
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
