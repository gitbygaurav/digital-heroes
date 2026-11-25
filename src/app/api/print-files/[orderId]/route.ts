import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPrintFileApprovalGate } from "@/lib/proofs/gate";

/**
 * Admin-only Print-File Download endpoint with Server-Side Approval Gate (Decision D8).
 * Returns HTTP 403 if order.proof_approved is false.
 * Customers are blocked at role check (403).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const auth = await authorizeApiRequest("admin");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { orderId } = await context.params;
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, order_number, status, proof_approved")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const gate = checkPrintFileApprovalGate(order);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason, files_unlocked: false },
      { status: 403 }
    );
  }

  const { data: files } = await admin
    .from("print_files")
    .select("*, order_items!inner(order_id)")
    .eq("order_items.order_id", order.id);

  const signedFiles = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data: signed } = await admin.storage
        .from("print-files")
        .createSignedUrl(f.storage_path, 300);

      return {
        id: f.id,
        file_name: f.file_name,
        kind: f.kind,
        dpi: f.dpi,
        bleed_mm: f.bleed_mm,
        signed_url: signed?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({
    order_number: order.order_number,
    files_unlocked: true,
    files: signedFiles,
  });
}
