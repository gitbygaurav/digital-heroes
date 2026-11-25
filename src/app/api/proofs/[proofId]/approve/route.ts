import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransitionProofStatus, type ProofStatus } from "@/lib/proofs/gate";
import { sendProofNotificationEmail } from "@/lib/email/send";

export async function POST(
  request: Request,
  context: { params: Promise<{ proofId: string }> }
) {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { proofId } = await context.params;
  const admin = createAdminClient();

  const { data: proof, error: proofErr } = await admin
    .from("proofs")
    .select(
      "*, order_items!inner(id, design_id, order_id, orders!inner(id, order_number, owner_id, status))"
    )
    .eq("id", proofId)
    .single();

  if (proofErr || !proof) {
    return NextResponse.json({ error: "Proof not found." }, { status: 404 });
  }

  const orderItem = proof.order_items as unknown as {
    id: string;
    design_id: string | null;
    order_id: string;
    orders: { id: string; order_number: string; owner_id: string; status: string };
  };

  if (
    orderItem.orders.owner_id !== auth.session.userId &&
    auth.session.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!canTransitionProofStatus(proof.status as ProofStatus, "approved")) {
    return NextResponse.json(
      { error: `Cannot approve proof in status "${proof.status}".` },
      { status: 400 }
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  await admin
    .from("proofs")
    .update({ status: "approved" })
    .eq("id", proof.id);

  await admin.from("proof_approvals").insert({
    proof_id: proof.id,
    approved_by: auth.session.userId,
    ip,
    user_agent: userAgent,
  });

  await admin
    .from("change_requests")
    .update({ status: "resolved", resolved_by: auth.session.userId })
    .eq("proof_id", proof.id)
    .eq("status", "open");

  // Unlock print files on the order (Decision D8)
  await admin
    .from("orders")
    .update({ proof_approved: true })
    .eq("id", orderItem.orders.id);

  if (orderItem.design_id) {
    await admin
      .from("designs")
      .update({ is_approved: true, approved_at: new Date().toISOString() })
      .eq("id", orderItem.design_id);
  }

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", orderItem.orders.owner_id)
    .single();

  if (ownerProfile?.email) {
    await sendProofNotificationEmail({
      to: ownerProfile.email,
      orderNumber: orderItem.orders.order_number,
      orderId: orderItem.orders.id,
      version: Number(proof.version),
      event: "proof_approved",
    });
  }

  return NextResponse.json({ ok: true, proofId: proof.id, status: "approved" });
}
