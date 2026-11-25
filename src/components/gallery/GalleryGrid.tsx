"use client";

import { useMemo, useState } from "react";
import type { DivisionRecord, GalleryItem } from "@/types/catalogue";

interface GalleryGridProps {
  divisions: DivisionRecord[];
  items: GalleryItem[];
  initialDivision?: string;
}

export function GalleryGrid({
  divisions,
  items,
  initialDivision = "all",
}: GalleryGridProps) {
  const [activeDivision, setActiveDivision] = useState(initialDivision);

  const filtered = useMemo(() => {
    if (activeDivision === "all") return items;
    return items.filter((item) => item.division_slug === activeDivision);
  }, [items, activeDivision]);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Filter gallery by product division"
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeDivision === "all"}
          onClick={() => setActiveDivision("all")}
          className={`rounded-md border px-3.5 py-1.5 font-mono text-xs transition-colors ${
            activeDivision === "all"
              ? "border-ink bg-ink text-paper"
              : "border-border-ink bg-paper-elevated text-ink hover:border-ink"
          }`}
        >
          All Divisions ({items.length})
        </button>

        {divisions.map((div) => (
          <button
            key={div.id}
            type="button"
            role="tab"
            aria-selected={activeDivision === div.slug}
            onClick={() => setActiveDivision(div.slug)}
            className={`rounded-md border px-3.5 py-1.5 font-mono text-xs transition-colors ${
              activeDivision === div.slug
                ? "border-ink bg-ink text-paper"
                : "border-border-ink bg-paper-elevated text-ink hover:border-ink"
            }`}
          >
            {div.name}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item, idx) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-xl border border-border-ink bg-paper-elevated transition-all hover:border-ink"
          >
            {/* Technical specimen preview card */}
            <div className="relative flex h-44 items-center justify-center border-b border-border-ink bg-paper-muted/60 p-6">
              <div className="flex h-full w-full flex-col items-center justify-center rounded border border-dashed border-ink/30 bg-paper p-4 text-center">
                <span className="font-mono text-[10px] uppercase tracking-widest text-copper">
                  {item.division_name}
                </span>
                <span className="mt-1 font-display text-sm font-bold text-ink">
                  SPECIMEN #{String(idx + 1).padStart(2, "0")}
                </span>
                <span className="mt-1 font-mono text-[11px] text-muted-ink">
                  300 DPI · PRINT-READY
                </span>
              </div>
            </div>

            <div className="p-5">
              <h3 className="font-display text-base font-bold text-ink">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-ink">{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
