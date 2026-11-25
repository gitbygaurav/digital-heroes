"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, FabricImage, Rect, Textbox } from "fabric";
import type { ProductWithDetails } from "@/types/catalogue";
import { DEFAULT_TEMPLATES } from "@/lib/designer/templates";
import type { SceneJson, SceneObject } from "@/lib/designer/scene";
import { clampObjectToPrintArea } from "@/lib/designer/constraints";
import { fitTextToBox } from "@/lib/designer/fitting";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Plus,
  Save,
  ShoppingCart,
  Type,
  Upload,
} from "lucide-react";

interface WebToPrintDesignerProps {
  products: ProductWithDetails[];
  initialProductSlug?: string;
}

const PX_PER_MM = 2.6;

export function WebToPrintDesigner({
  products,
  initialProductSlug,
}: WebToPrintDesignerProps) {
  const router = useRouter();
  const initialProduct =
    products.find(
      (p) => p.slug === initialProductSlug || p.division_slug === initialProductSlug
    ) ?? products[0];

  const [productId, setProductId] = useState(initialProduct.id);
  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? products[0],
    [products, productId]
  );

  const template = DEFAULT_TEMPLATES[product.product_type];
  const [mode, setMode] = useState<"designer" | "upload">(
    product.product_type === "LaserCut" ? "upload" : "designer"
  );
  const [designName, setDesignName] = useState(`${product.name} Design`);
  const [scene, setScene] = useState<SceneJson>(() => template.scene);
  const [selectedId, setSelectedId] = useState<string | null>(
    template.scene.objects[0]?.id ?? null
  );
  const [showBleedOverlay, setShowBleedOverlay] = useState(true);
  const [fitError, setFitError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Upload path state
  const [uploadedFile, setUploadedFile] = useState<{
    id: string;
    file_name: string;
    status: string;
    previewUrl?: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);

  const primaryPrintArea = scene.printAreas[0];
  const pxPerMm = useMemo(() => {
    const totalW = scene.canvas.width + scene.canvas.bleed * 2;
    const totalH = scene.canvas.height + scene.canvas.bleed * 2;
    return Math.min(PX_PER_MM, 520 / totalW, 460 / totalH);
  }, [scene.canvas.width, scene.canvas.height, scene.canvas.bleed]);

  // Reset scene when product changes
  function handleProductChange(newId: string) {
    const next = products.find((p) => p.id === newId);
    if (!next) return;
    const nextTemplate = DEFAULT_TEMPLATES[next.product_type];
    setProductId(next.id);
    setDesignName(`${next.name} Design`);
    setScene(nextTemplate.scene);
    setSelectedId(nextTemplate.scene.objects[0]?.id ?? null);
    setMode(next.product_type === "LaserCut" ? "upload" : "designer");
    setUploadedFile(null);
    setFitError(null);
    setStatusMsg(null);
  }

  // Initialize Fabric.js canvas (only rebuilds on product/mode/overlay/canvas-size change)
  useEffect(() => {
    if (mode !== "designer" || !canvasElRef.current) return;

    const totalW = (scene.canvas.width + scene.canvas.bleed * 2) * pxPerMm;
    const totalH = (scene.canvas.height + scene.canvas.bleed * 2) * pxPerMm;
    const bleedPx = scene.canvas.bleed * pxPerMm;

    const canvas = new Canvas(canvasElRef.current, {
      width: totalW,
      height: totalH,
      backgroundColor: "#FFFFFF",
      selection: true,
    });
    fabricRef.current = canvas;

    // Draw print-area & bleed guides (non-selectable, explicit top-left origin for Fabric v6)
    if (showBleedOverlay) {
      const trimRect = new Rect({
        left: bleedPx,
        top: bleedPx,
        originX: "left",
        originY: "top",
        width: scene.canvas.width * pxPerMm,
        height: scene.canvas.height * pxPerMm,
        fill: "transparent",
        stroke: "#0B0B1A",
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });

      const margin = primaryPrintArea.safeMarginMm * pxPerMm;
      const safeRect = new Rect({
        left: bleedPx + primaryPrintArea.x * pxPerMm + margin,
        top: bleedPx + primaryPrintArea.y * pxPerMm + margin,
        originX: "left",
        originY: "top",
        width: Math.max(10, primaryPrintArea.w * pxPerMm - margin * 2),
        height: Math.max(10, primaryPrintArea.h * pxPerMm - margin * 2),
        fill: "transparent",
        stroke: "#2F5D45",
        strokeDashArray: [5, 4],
        strokeWidth: 1.2,
        selectable: false,
        evented: false,
      });

      canvas.add(trimRect, safeRect);
    }

    // Render Scene JSON objects with explicit left/top origin
    for (const obj of scene.objects) {
      if (obj.type === "text") {
        const tb = new Textbox(obj.text, {
          left: bleedPx + obj.x * pxPerMm,
          top: bleedPx + obj.y * pxPerMm,
          originX: "left",
          originY: "top",
          width: obj.w * pxPerMm,
          fontFamily: obj.font,
          fontSize: obj.fontSizePt * 0.352778 * pxPerMm,
          fill: obj.fill,
          textAlign: obj.align,
          charSpacing: obj.tracking,
          hasControls: true,
        });
        tb.set("dataId", obj.id);
        canvas.add(tb);
      } else if (obj.type === "image") {
        void FabricImage.fromURL(obj.src).then((img) => {
          if (fabricRef.current !== canvas) return;
          const targetW = obj.w * pxPerMm;
          const scale = targetW / (img.width || targetW);
          img.scale(scale);
          img.set({
            left: bleedPx + obj.x * pxPerMm,
            top: bleedPx + obj.y * pxPerMm,
            originX: "left",
            originY: "top",
          });
          img.set("dataId", obj.id);
          canvas.add(img);
          canvas.renderAll();
        });
      }
    }

    // Enforce print-area constraints on move/scale (PRD §8.1)
    const enforceBounds = (
      target: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
        scaleX?: number;
        scaleY?: number;
        set: (props: Record<string, unknown>) => void;
        get?: (k: string) => unknown;
      },
      commitToState: boolean
    ) => {
      const xMm = ((target.left ?? 0) - bleedPx) / pxPerMm;
      const yMm = ((target.top ?? 0) - bleedPx) / pxPerMm;
      const wMm = ((target.width ?? 40) * (target.scaleX ?? 1)) / pxPerMm;
      const hMm = ((target.height ?? 20) * (target.scaleY ?? 1)) / pxPerMm;

      const clamped = clampObjectToPrintArea(
        { x: xMm, y: yMm, w: wMm, h: hMm },
        primaryPrintArea
      );

      target.set({
        left: bleedPx + clamped.x * pxPerMm,
        top: bleedPx + clamped.y * pxPerMm,
      });

      if (commitToState) {
        const id = target.get?.("dataId") as string | undefined;
        if (id) {
          setScene((prev) => ({
            ...prev,
            objects: prev.objects.map((o) =>
              o.id === id ? { ...o, x: clamped.x, y: clamped.y } : o
            ),
          }));
        }
      }
    };

    canvas.on("object:moving", (e) => {
      if (e.target) enforceBounds(e.target, false);
    });
    canvas.on("object:scaling", (e) => {
      if (e.target) enforceBounds(e.target, false);
    });
    canvas.on("object:modified", (e) => {
      if (e.target) enforceBounds(e.target, true);
    });
    canvas.on("selection:created", (e) => {
      const id = e.selected?.[0]?.get("dataId") as string | undefined;
      if (id) setSelectedId(id);
    });
    canvas.on("selection:updated", (e) => {
      const id = e.selected?.[0]?.get("dataId") as string | undefined;
      if (id) setSelectedId(id);
    });

    canvas.renderAll();

    return () => {
      void canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, productId, scene.canvas, showBleedOverlay, pxPerMm]);

  const selectedObj: SceneObject | undefined = scene.objects.find(
    (o) => o.id === selectedId
  );

  function updateSelectedText(nextText: string) {
    if (!selectedObj || selectedObj.type !== "text") return;

    const fitCfg = selectedObj.fit ?? {
      mode: "shrink_to_fit" as const,
      minPt: 8,
      maxPt: selectedObj.fontSizePt,
      minTracking: -60,
    };

    const fitted = fitTextToBox({
      text: nextText,
      boxWidthMm: selectedObj.w,
      boxHeightMm: selectedObj.h,
      minPt: fitCfg.minPt,
      maxPt: fitCfg.maxPt,
      minTracking: fitCfg.minTracking,
      fitMode: fitCfg.mode,
    });

    setFitError(fitted.fits ? null : fitted.error ?? "text too long");

    setScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) =>
        o.id === selectedObj.id && o.type === "text"
          ? {
              ...o,
              text: nextText,
              fontSizePt: fitted.fontSizePt,
              tracking: fitted.tracking,
            }
          : o
      ),
    }));

    // Update live Fabric Textbox in-place
    const canvas = fabricRef.current;
    if (canvas) {
      const match = canvas
        .getObjects()
        .find((obj) => obj.get("dataId") === selectedObj.id);
      if (match && match instanceof Textbox) {
        match.set({
          text: nextText,
          fontSize: fitted.fontSizePt * 0.352778 * pxPerMm,
          charSpacing: fitted.tracking,
        });
        canvas.renderAll();
      }
    }
  }

  function addNewTextObject() {
    const newId = `t-${Date.now()}`;
    const clamped = clampObjectToPrintArea(
      { x: 12, y: 12, w: 60, h: 16 },
      primaryPrintArea
    );
    const newObj: SceneObject = {
      type: "text",
      id: newId,
      text: "NEW TEXT",
      x: clamped.x,
      y: clamped.y,
      w: clamped.w,
      h: clamped.h,
      rotation: 0,
      font: "Inter",
      fontSizePt: 16,
      tracking: 0,
      fill: "#0B0B1A",
      align: "center",
      fit: { mode: "shrink_to_fit", minPt: 8, maxPt: 24, minTracking: -60 },
    };
    setScene((prev) => ({ ...prev, objects: [...prev.objects, newObj] }));
    setSelectedId(newId);

    const canvas = fabricRef.current;
    if (canvas) {
      const bleedPx = scene.canvas.bleed * pxPerMm;
      const tb = new Textbox(newObj.text, {
        left: bleedPx + newObj.x * pxPerMm,
        top: bleedPx + newObj.y * pxPerMm,
        originX: "left",
        originY: "top",
        width: newObj.w * pxPerMm,
        fontFamily: newObj.font,
        fontSize: newObj.fontSizePt * 0.352778 * pxPerMm,
        fill: newObj.fill,
        textAlign: newObj.align,
        hasControls: true,
      });
      tb.set("dataId", newId);
      canvas.add(tb);
      canvas.setActiveObject(tb);
      canvas.renderAll();
    }
  }

  async function handleLogoUpload(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !fabricRef.current) return;
      const img = await FabricImage.fromURL(dataUrl);
      const targetWMm = Math.min(40, primaryPrintArea.w * 0.4);
      const targetWPx = targetWMm * pxPerMm;
      const scale = targetWPx / (img.width || targetWPx);
      const targetHMm = ((img.height || targetWPx) * scale) / pxPerMm;

      const clamped = clampObjectToPrintArea(
        {
          x: primaryPrintArea.x + primaryPrintArea.safeMarginMm + 4,
          y: primaryPrintArea.y + primaryPrintArea.safeMarginMm + 4,
          w: targetWMm,
          h: targetHMm,
        },
        primaryPrintArea
      );

      const bleedPx = scene.canvas.bleed * pxPerMm;
      const imgId = `img-${Date.now()}`;
      img.scale(scale);
      img.set({
        left: bleedPx + clamped.x * pxPerMm,
        top: bleedPx + clamped.y * pxPerMm,
        originX: "left",
        originY: "top",
      });
      img.set("dataId", imgId);
      fabricRef.current.add(img);
      fabricRef.current.setActiveObject(img);
      fabricRef.current.renderAll();

      setScene((prev) => ({
        ...prev,
        objects: [
          ...prev.objects,
          {
            type: "image",
            id: imgId,
            src: dataUrl,
            x: clamped.x,
            y: clamped.y,
            w: clamped.w,
            h: clamped.h,
            rotation: 0,
          },
        ],
      }));
    };
    reader.readAsDataURL(file);
  }

  async function handleFinishedArtworkUpload(file: File) {
    setUploading(true);
    setStatusMsg(null);
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error ?? "Upload failed.");
        return;
      }
      const previewUrl =
        file.type === "image/png" || file.type === "image/svg+xml"
          ? URL.createObjectURL(file)
          : undefined;

      setUploadedFile({
        id: data.upload.id,
        file_name: data.upload.file_name,
        status: data.upload.status,
        previewUrl,
      });
      setStatusMsg(`Uploaded "${data.upload.file_name}" (${data.upload.status}).`);
    } catch {
      setStatusMsg("Network error uploading file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveAndAddToCart(addToCart: boolean) {
    if (fitError) {
      setStatusMsg("Please shorten overflowing text before saving.");
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          name: designName,
          source: mode,
          config: {
            width_mm: scene.canvas.width,
            height_mm: scene.canvas.height,
            shape: product.size_rule.allowed_shapes[0] ?? "rect",
            quantity: Math.max(product.min_qty, 50),
            selectedOptions: Object.fromEntries(
              product.parameters.map((p) => [
                p.key,
                p.default_value ?? p.options[0]?.value ?? "",
              ])
            ),
          },
          scene_json: mode === "designer" ? scene : undefined,
          upload_id: uploadedFile?.id,
        }),
      });
      if (res.status === 401) {
        router.push("/login?next=/designer");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error ?? "Could not save design.");
        return;
      }

      if (addToCart) {
        await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: product.id,
            design_id: data.design.id,
            config: {
              width_mm: scene.canvas.width,
              height_mm: scene.canvas.height,
              shape: product.size_rule.allowed_shapes[0] ?? "rect",
              quantity: Math.max(product.min_qty, 50),
              selectedOptions: Object.fromEntries(
                product.parameters.map((p) => [
                  p.key,
                  p.default_value ?? p.options[0]?.value ?? "",
                ])
              ),
            },
          }),
        });
        router.push("/cart");
      } else {
        setStatusMsg(`Saved design "${data.design.name}" to your account.`);
      }
    } catch {
      setStatusMsg("Network error saving design.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-ink bg-paper-elevated p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Select product"
            value={product.id}
            onChange={(e) => handleProductChange(e.target.value)}
            className="rounded-md border border-border-ink bg-paper px-3 py-2 text-sm font-medium text-ink"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.division_name} — {p.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            aria-label="Design name"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            className="rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("designer")}
            className={`rounded-md px-3.5 py-2 font-mono text-xs font-semibold ${
              mode === "designer"
                ? "bg-ink text-paper"
                : "border border-border-ink bg-paper text-ink"
            }`}
          >
            In-Browser Designer
          </button>
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`rounded-md px-3.5 py-2 font-mono text-xs font-semibold ${
              mode === "upload"
                ? "bg-ink text-paper"
                : "border border-border-ink bg-paper text-ink"
            }`}
          >
            Upload Finished File
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-md border border-accent-deep/30 bg-accent/15 px-4 py-2.5 text-sm text-ink">
          <CheckCircle2 className="h-4 w-4 text-accent-deep" />
          {statusMsg}
        </div>
      )}

      {fitError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger"
        >
          <AlertTriangle className="h-4 w-4" />
          Placeholder overflow: {fitError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: Canvas or Upload Dropzone */}
        <div className="rounded-xl border border-border-ink bg-paper-muted/50 p-6 lg:col-span-8">
          {mode === "designer" ? (
            <div className="flex flex-col items-center">
              <div className="mb-3 flex w-full items-center justify-between font-mono text-xs text-muted-ink">
                <span>
                  {scene.canvas.width} × {scene.canvas.height} mm ·{" "}
                  {scene.canvas.bleed} mm bleed
                </span>
                <button
                  type="button"
                  onClick={() => setShowBleedOverlay((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded border border-border-ink bg-paper px-2.5 py-1 text-ink"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showBleedOverlay ? "Hide Bleed/Safe Overlay" : "Show Proof Overlay"}
                </button>
              </div>

              <div className="overflow-auto rounded border border-ink/20 bg-white p-2 shadow-sm">
                <canvas ref={canvasElRef} />
              </div>

              <p className="mt-3 font-mono text-[11px] text-muted-ink">
                Green dashed = safe print zone · Solid black = trim edge ·
                Objects snap inside safe bounds automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-ink bg-paper p-10 text-center">
              <Upload className="h-10 w-10 text-accent-deep" />
              <h2 className="mt-3 font-display text-lg font-bold text-ink">
                Upload Print-Ready Artwork
              </h2>
              <p className="mt-1 text-sm text-muted-ink">
                Accepted formats: <code>.pdf</code>, <code>.svg</code>,{" "}
                <code>.ai</code> (PDF-compatible), <code>.png</code> (max 20 MB).
              </p>

              <label className="mt-5 cursor-pointer rounded-md bg-accent-deep px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink">
                {uploading ? "Uploading..." : "Choose Artwork File"}
                <input
                  type="file"
                  accept=".pdf,.svg,.ai,.png"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFinishedArtworkUpload(f);
                  }}
                />
              </label>

              {uploadedFile && (
                <div className="mt-6 w-full max-w-md rounded-lg border border-border-ink bg-paper-elevated p-4 text-left">
                  <p className="font-mono text-xs text-ink">
                    File: <strong>{uploadedFile.file_name}</strong>
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-ink">
                    Validation status: {uploadedFile.status}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Inspector & Actions */}
        <div className="space-y-5 rounded-xl border border-border-ink bg-paper-elevated p-6 lg:col-span-4">
          {mode === "designer" && (
            <>
              <div className="flex items-center justify-between border-b border-border-ink pb-3">
                <span className="font-mono text-xs font-semibold uppercase text-ink">
                  Layer Controls
                </span>
                <button
                  type="button"
                  onClick={addNewTextObject}
                  className="inline-flex items-center gap-1 rounded border border-border-ink bg-paper px-2.5 py-1 font-mono text-xs text-ink hover:border-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Text
                </button>
              </div>

              {selectedObj?.type === "text" && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="designer-text-input"
                      className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase text-ink"
                    >
                      <Type className="h-3.5 w-3.5" />
                      {selectedObj.placeholderKey
                        ? `Placeholder: ${selectedObj.placeholderKey}`
                        : "Text Content"}
                    </label>
                    <input
                      id="designer-text-input"
                      type="text"
                      value={selectedObj.text}
                      onChange={(e) => updateSelectedText(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-border-ink bg-paper px-3 py-2 text-sm text-ink"
                    />
                    <p className="mt-1 font-mono text-[11px] text-muted-ink">
                      Auto-fit: {selectedObj.fontSizePt}pt · tracking{" "}
                      {selectedObj.tracking}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="designer-color"
                      className="block font-mono text-xs font-semibold uppercase text-ink"
                    >
                      Ink Colour
                    </label>
                    <input
                      id="designer-color"
                      type="color"
                      value={selectedObj.fill}
                      onChange={(e) => {
                        const nextFill = e.target.value;
                        setScene((prev) => ({
                          ...prev,
                          objects: prev.objects.map((o) =>
                            o.id === selectedObj.id && o.type === "text"
                              ? { ...o, fill: nextFill }
                              : o
                          ),
                        }));
                        const canvas = fabricRef.current;
                        if (canvas) {
                          const match = canvas
                            .getObjects()
                            .find((obj) => obj.get("dataId") === selectedObj.id);
                          if (match) {
                            match.set("fill", nextFill);
                            canvas.renderAll();
                          }
                        }
                      }}
                      className="mt-1.5 h-9 w-20 cursor-pointer rounded border border-border-ink bg-paper"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-mono text-xs font-semibold uppercase text-ink">
                  Add Logo (PNG / SVG)
                </label>
                <input
                  type="file"
                  accept="image/png,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLogoUpload(f);
                  }}
                  className="mt-1.5 block w-full text-xs text-muted-ink"
                />
              </div>
            </>
          )}

          <div className="space-y-3 border-t border-border-ink pt-5">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAndAddToCart(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-deep px-4 py-3 text-sm font-semibold text-paper hover:bg-ink disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />
              {saving ? "Saving..." : "Save Design & Add to Cart"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAndAddToCart(false)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border-ink bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Design Only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
