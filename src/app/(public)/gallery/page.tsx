import { Suspense } from "react";
import { getDivisions, getGalleryItems } from "@/lib/catalogue/queries";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";

export const metadata = {
  title: "Live Work Gallery",
};

async function GalleryContent() {
  const [divisions, items] = await Promise.all([
    getDivisions(),
    getGalleryItems(),
  ]);

  return <GalleryGrid divisions={divisions} items={items} />;
}

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-copper">
          Live Work Gallery
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink sm:text-4xl">
          Production Specimens Across All 6 Divisions
        </h1>
        <p className="mt-2 text-base text-muted-ink">
          Filter real print and laser-cut jobs by product family.
        </p>
      </div>

      <div className="mt-8">
        <Suspense
          fallback={
            <p className="font-mono text-xs text-muted-ink">
              Loading gallery...
            </p>
          }
        >
          <GalleryContent />
        </Suspense>
      </div>
    </div>
  );
}
