import { Suspense } from "react";
import {
  getPricingConfig,
  getProductsWithDetails,
} from "@/lib/catalogue/queries";
import { ProductConfigurator } from "@/components/calculator/ProductConfigurator";

export const metadata = {
  title: "Instant Price Calculator",
};

async function CalculatorContent() {
  const [products, pricingConfig] = await Promise.all([
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  return (
    <ProductConfigurator
      products={products}
      allowProductSwitch
      pricingConfig={pricingConfig}
    />
  );
}

export default function CalculatorPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-copper">
          Instant Price Calculator
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink sm:text-4xl">
          Configure &amp; Price in Real Time
        </h1>
        <p className="mt-2 text-base text-muted-ink">
          No quote forms. Select any division, enter custom millimetre
          dimensions, and see automatic volume discounts and GST-inclusive
          totals instantly.
        </p>
      </div>

      <div className="mt-8">
        <Suspense
          fallback={
            <p className="font-mono text-xs text-muted-ink">
              Loading calculator...
            </p>
          }
        >
          <CalculatorContent />
        </Suspense>
      </div>
    </div>
  );
}
