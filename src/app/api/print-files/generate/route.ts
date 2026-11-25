import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPrintFileApprovalGate } from "@/lib/proofs/gate";
import { renderSceneToPrintFiles } from "@/lib/render/pipeline";
import { buildPrintFileName, buildPrintStoragePath } from "@/lib/render/naming";
import { sceneJsonSchema } from "@/lib/designer/scene";
import { DEFAULT_TEMPLATES } from "@/lib/designer/templates";
import type { ProductType } from "@/types/catalogue";

const generateSchema = z.object({
  order_item_id: z.string().uuid(),
});

/**
 * Admin-only Print-File Generator (§9.1):
 * - Enforces approval gate (403 if order.proof_approved is false)
 * - Renders high-res PNG + vector PDF on server from approved Scene JSON
 * - Uploads to private `print-files` bucket & logs in `print_files`
 */
export async function POST(request: Request) {
  const auth = await authorizeApiRequest("admin");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order_item_id." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: orderItem, error: itemErr } = await admin
    .from("order_items")
    .select(
      "id, order_id, design_id, products!inner(product_type, output_dpi, bleed_mm), orders!inner(id, order_number, status, proof_approved)"
    )
    .eq("id", parsed.data.order_item_id)
    .single();

  if (itemErr || !orderItem) {
    return NextResponse.json({ error: "Order item not found." }, { status: 404 });
  }

  const order = orderItem.orders as unknown as {
    id: string;
    order_number: string;
    status: string;
    proof_approved: boolean;
  };
  const product = orderItem.products as unknown as {
    product_type: ProductType;
    output_dpi: number;
    bleed_mm: number;
  };

  const gate = checkPrintFileApprovalGate(order);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason }, { status: 403 });
  }

  // Load approved proof snapshot or fallback to design / template
  const { data: approvedProof } = await admin
    .from("proofs")
    .select("id, scene_snapshot")
    .eq("order_item_id", orderItem.id)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parsedScene = sceneJsonSchema.safeParse(approvedProof?.scene_snapshot);
  const scene = parsedScene.success
    ? parsedScene.data
    : DEFAULT_TEMPLATES[product.product_type].scene;

  const rendered = await renderSceneToPrintFiles(scene, product.output_dpi);

  const pdfName = buildPrintFileName({
    orderNumber: order.order_number,
    productType: product.product_type,
    extension: "pdf",
  });
  const pngName = buildPrintFileName({
    orderNumber: order.order_number,
    productType: product.product_type,
    extension: "png",
  });

  const pdfPath = buildPrintStoragePath({
    orderNumber: order.order_number,
    fileName: pdfName,
  });
  const pngPath = buildPrintStoragePath({
    orderNumber: order.order_number,
    fileName: pngName,
  });

  await Promise.all([
    admin.storage.from("print-files").upload(pdfPath, rendered.pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    }),
    admin.storage.from("print-files").upload(pngPath, rendered.pngBuffer, {
      contentType: "image/png",
      upsert: true,
    }),
  ]);

  const { data: insertedFiles } = await admin
    .from("print_files")
    .insert([
      {
        order_item_id: orderItem.id,
        proof_id: approvedProof?.id ?? null,
        kind: "pdf",
        storage_path: pdfPath,
        file_name: pdfName,
        width_px: rendered.widthPx,
        height_px: rendered.heightPx,
        dpi: product.output_dpi,
        bleed_mm: product.bleed_mm,
      },
      {
        order_item_id: orderItem.id,
        proof_id: approvedProof?.id ?? null,
        kind: "png",
        storage_path: pngPath,
        file_name: pngName,
        width_px: rendered.widthPx,
        height_px: rendered.heightPx,
        dpi: product.output_dpi,
        bleed_mm: product.bleed_mm,
      },
    ])
    .select("*");

  return NextResponse.json({ print_files: insertedFiles ?? [] }, { status: 201 });
}
