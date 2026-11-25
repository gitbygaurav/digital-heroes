import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getGalleryItems,
  getPricingConfig,
  getProductByDivisionOrSlug,
  getProductsWithDetails,
} from "@/lib/catalogue/queries";
import { ProductConfigurator } from "@/components/calculator/ProductConfigurator";
import { ArrowLeft } from "lucide-react";

async function ProductDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [product, allProducts, pricingConfig] = await Promise.all([
    getProductByDivisionOrSlug(slug),
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  if (!product) {
    notFound();
  }

  const examples = await getGalleryItems(product.division_slug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-ink hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All 6 Divisions
      </Link>

      <div className="mt-4 max-w-3xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-copper">
          {product.division_name}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink sm:text-4xl">
          {product.name}
        </h1>
        <p className="mt-2 text-base text-muted-ink">{product.description}</p>
      </div>

      <div className="mt-8">
        <ProductConfigurator
          products={allProducts}
          initialProductSlug={product.slug}
          pricingConfig={pricingConfig}
        />
      </div>

      {examples.length > 0 && (
        <section className="mt-16 border-t border-border-ink pt-12">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-xs uppercase text-copper">
                Live Work Examples
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-ink">
                Recent {product.division_name} Jobs
              </h2>
            </div>
            <Link
              href="/gallery"
              className="text-sm font-semibold text-accent-deep hover:underline"
            >
              Full gallery →
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border-ink bg-paper-elevated p-5"
              >
                <p className="font-mono text-[11px] uppercase text-copper">
                  {item.division_name}
                </p>
                <h3 className="mt-1 font-display text-base font-bold text-ink">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-ink">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-12 font-mono text-xs text-muted-ink sm:px-6 lg:px-8">
          Loading product configurator...
        </div>
      }
    >
      <ProductDetailContent params={params} />
    </Suspense>
  );
}
