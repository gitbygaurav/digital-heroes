import Link from "next/link";
import { Suspense } from "react";
import { getDivisions, getProductsWithDetails } from "@/lib/catalogue/queries";
import { formatMoney } from "@/lib/pricing/engine";
import { ArrowRight } from "lucide-react";

export const metadata = {
  title: "Product Hub — Six Production Divisions",
};

async function ProductsGrid() {
  const [divisions, products] = await Promise.all([
    getDivisions(),
    getProductsWithDetails(),
  ]);

  return (
    <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {divisions.map((div, index) => {
        const product = products.find((p) => p.division_id === div.id);

        return (
          <Link
            key={div.id}
            href={`/products/${div.slug}`}
            className="group flex flex-col justify-between rounded-xl border border-border-ink bg-paper-elevated p-6 transition-all hover:-translate-y-0.5 hover:border-ink"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-ink">
                  DIVISION 0{index + 1}
                </span>
                {product && (
                  <span className="rounded bg-paper-muted px-2 py-0.5 font-mono text-[11px] font-medium text-ink">
                    From {formatMoney(product.base_unit_price)}
                  </span>
                )}
              </div>

              <h2 className="mt-4 font-display text-2xl font-bold text-ink group-hover:text-accent-deep">
                {div.name}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-ink">
                {div.description}
              </p>

              {product && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {product.parameters.map((param) => (
                    <span
                      key={param.id}
                      className="rounded border border-border-ink bg-paper px-2 py-0.5 font-mono text-[11px] text-muted-ink"
                    >
                      {param.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border-ink pt-4 text-xs font-semibold text-accent-deep">
              <span>Configure &amp; price</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function ProductsHubPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-copper">
          Product Hub
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink sm:text-4xl">
          Six Specialized Print Divisions
        </h1>
        <p className="mt-3 text-base text-muted-ink">
          Every product is parameter-driven — configure exact millimetre sizing,
          material, and quantity with instant GST-inclusive pricing.
        </p>
      </div>

      <Suspense
        fallback={
          <p className="mt-10 font-mono text-xs text-muted-ink">
            Loading divisions...
          </p>
        }
      >
        <ProductsGrid />
      </Suspense>
    </div>
  );
}
