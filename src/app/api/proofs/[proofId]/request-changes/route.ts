import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransitionProofStatus, type ProofStatus } from "@/lib/proofs/gate";
import { sendProofNotificationEmail } from "@/lib/email/send";

const changeRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(3, "Please describe the requested changes.")
    .max(1000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ proofId: string }> }
) {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = changeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 }
    );
  }

  const { proofId } = await context.params;
  const admin = createAdminClient();

  const { data: proof, error: proofErr } = await admin
    .from("proofs")
    .select(
      "*, order_items!inner(id, order_id, orders!inner(id, order_number, owner_id, status))"
    )
    .eq("id", proofId)
    .single();

  if (proofErr || !proof) {
    return NextResponse.json({ error: "Proof not found." }, { status: 404 });
  }

  const orderItem = proof.order_items as unknown as {
    id: string;
    order_id: string;
    orders: { id: string; order_number: string; owner_id: string; status: string };
  };

  if (
    orderItem.orders.owner_id !== auth.session.userId &&
    auth.session.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (
    !canTransitionProofStatus(proof.status as ProofStatus, "changes_requested")
  ) {
    return NextResponse.json(
      { error: `Cannot request changes on proof in status "${proof.status}".` },
      { status: 400 }
    );
  }

  await admin
    .from("proofs")
    .update({ status: "changes_requested" })
    .eq("id", proof.id);

  await admin.from("change_requests").insert({
    proof_id: proof.id,
    requested_by: auth.session.userId,
    message: parsed.data.message,
    status: "open",
  });

  // Appendix B: proof -> artwork on change request
  if (orderItem.orders.status === "proof") {
    await admin
      .from("orders")
      .update({ status: "artwork", proof_approved: false })
      .eq("id", orderItem.orders.id);

    await admin.from("order_status_history").insert({
      order_id: orderItem.orders.id,
      from_status: "proof",
      to_status: "artwork",
      changed_by: auth.session.userId,
      note: `Changes requested on proof v${proof.version}`,
    });
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
      event: "changes_requested",
      message: parsed.data.message,
    });
  }

  return NextResponse.json({
    ok: true,
    proofId: proof.id,
    status: "changes_requested",
  });
}
