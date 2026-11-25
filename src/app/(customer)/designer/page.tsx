import { Suspense } from "react";
import { getProductsWithDetails } from "@/lib/catalogue/queries";
import { WebToPrintDesigner } from "@/components/designer/WebToPrintDesigner";

export const metadata = {
  title: "Web-to-Print Designer",
};

async function DesignerContent({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const [{ product }, products] = await Promise.all([
    searchParams,
    getProductsWithDetails(),
  ]);

  return (
    <div className="space-y-6">
      <div className="border-b border-border-ink pb-5">
        <p className="font-mono text-xs uppercase text-copper">
          In-Browser Studio
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          Web-to-Print Designer
        </h1>
        <p className="mt-1 text-sm text-muted-ink">
          Design inside locked print zones or upload finished PDF/SVG/AI/PNG
          artwork. What you approve is what is printed.
        </p>
      </div>

      <WebToPrintDesigner
        products={products}
        initialProductSlug={product}
      />
    </div>
  );
}

export default function DesignerPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="py-12 font-mono text-xs text-muted-ink">
          Loading studio...
        </div>
      }
    >
      <DesignerContent searchParams={searchParams} />
    </Suspense>
  );
}
