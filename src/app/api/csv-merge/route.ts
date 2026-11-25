import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { validateCsvForScene } from "@/lib/csv/validate";
import { packageFilesAsZip, processCsvChunk } from "@/lib/csv/merge";
import { buildPrintFileName, buildPrintStoragePath } from "@/lib/render/naming";
import { DEFAULT_TEMPLATES } from "@/lib/designer/templates";
import { sceneJsonSchema } from "@/lib/designer/scene";
import type { ProductType } from "@/types/catalogue";

const CHUNK_SIZE = 50;

/**
 * Server-side CSV Variable-Data Merge endpoint (§9.2, Decision D15):
 * - Validates CSV headers, required columns, duplicates, and placeholder fitting
 * - Processes rows in chunks on the server (never on client)
 * - Stores per-row PDFs + ZIP in private `print-files` bucket
 */
export async function POST(request: Request) {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rl = checkRateLimit(`csv:${auth.session.userId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many CSV merge requests. Please wait a minute." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const orderItemId = formData.get("order_item_id")?.toString();

  if (!(file instanceof File) || !orderItemId) {
    return NextResponse.json(
      { error: "CSV file and order_item_id are required." },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  const admin = createAdminClient();

  const { data: orderItem, error: itemErr } = await admin
    .from("order_items")
    .select(
      "id, order_id, products!inner(product_type, output_dpi, bleed_mm), orders!inner(id, order_number, owner_id)"
    )
    .eq("id", orderItemId)
    .single();

  if (itemErr || !orderItem) {
    return NextResponse.json({ error: "Order item not found." }, { status: 404 });
  }

  const order = orderItem.orders as unknown as {
    id: string;
    order_number: string;
    owner_id: string;
  };
  const product = orderItem.products as unknown as {
    product_type: ProductType;
    output_dpi: number;
    bleed_mm: number;
  };

  if (order.owner_id !== auth.session.userId && auth.session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: latestProof } = await admin
    .from("proofs")
    .select("id, scene_snapshot")
    .eq("order_item_id", orderItem.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parsedScene = sceneJsonSchema.safeParse(latestProof?.scene_snapshot);
  const scene = parsedScene.success
    ? parsedScene.data
    : DEFAULT_TEMPLATES[product.product_type].scene;

  const validation = validateCsvForScene(csvText, scene, ["number"]);

  const { data: csvJob, error: jobErr } = await admin
    .from("csv_jobs")
    .insert({
      order_item_id: orderItem.id,
      source_path: `${order.order_number}/${file.name}`,
      total_rows: validation.totalRows,
      processed_rows: 0,
      status: validation.validRows.length > 0 ? "running" : "failed",
      error_report: validation.errorReport,
    })
    .select("*")
    .single();

  if (jobErr || !csvJob) {
    return NextResponse.json(
      { error: jobErr?.message ?? "Failed to create CSV job." },
      { status: 500 }
    );
  }

  if (validation.validRows.length === 0) {
    return NextResponse.json(
      {
        csv_job: csvJob,
        error_report: validation.errorReport,
      },
      { status: 400 }
    );
  }

  // Process in server-side chunks (Decision D15)
  const generatedAll: Array<{ fileName: string; buffer: Buffer; rowIndex: number }> = [];

  for (let i = 0; i < validation.validRows.length; i += CHUNK_SIZE) {
    const slice = validation.validRows.slice(i, i + CHUNK_SIZE);
    const renderedChunk = await processCsvChunk({
      orderNumber: order.order_number,
      productType: product.product_type,
      baseScene: scene,
      rows: slice,
      dpi: product.output_dpi,
    });

    for (const r of renderedChunk) {
      const storagePath = buildPrintStoragePath({
        orderNumber: order.order_number,
        fileName: r.fileName,
      });
      await admin.storage.from("print-files").upload(storagePath, r.pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

      await admin.from("print_files").insert({
        order_item_id: orderItem.id,
        proof_id: latestProof?.id ?? null,
        kind: "csv_row",
        storage_path: storagePath,
        file_name: r.fileName,
        dpi: product.output_dpi,
        bleed_mm: product.bleed_mm,
        row_index: r.rowIndex,
      });

      generatedAll.push({
        fileName: r.fileName,
        buffer: r.pdfBuffer,
        rowIndex: r.rowIndex,
      });
    }

    await admin
      .from("csv_jobs")
      .update({ processed_rows: generatedAll.length })
      .eq("id", csvJob.id);
  }

  const zipName = buildPrintFileName({
    orderNumber: order.order_number,
    productType: product.product_type,
    extension: "zip",
  });
  const zipPath = buildPrintStoragePath({
    orderNumber: order.order_number,
    fileName: zipName,
  });

  const zipBuffer = await packageFilesAsZip(generatedAll);
  await admin.storage.from("print-files").upload(zipPath, zipBuffer, {
    contentType: "application/zip",
    upsert: true,
  });

  await admin.from("print_files").insert({
    order_item_id: orderItem.id,
    proof_id: latestProof?.id ?? null,
    kind: "zip",
    storage_path: zipPath,
    file_name: zipName,
    dpi: product.output_dpi,
    bleed_mm: product.bleed_mm,
  });

  const { data: completedJob } = await admin
    .from("csv_jobs")
    .update({
      status: "done",
      processed_rows: generatedAll.length,
      zip_path: zipPath,
    })
    .eq("id", csvJob.id)
    .select("*")
    .single();

  return NextResponse.json(
    {
      csv_job: completedJob,
      generated_count: generatedAll.length,
      error_report: validation.errorReport,
    },
    { status: 201 }
  );
}
