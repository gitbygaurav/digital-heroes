import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransitionOrderStatus } from "@/lib/pipeline/transitions";
import { sendOrderStatusEmail } from "@/lib/email/send";
import type { OrderStatus } from "@/types/orders";

const transitionSchema = z.object({
  to_status: z.enum([
    "quote",
    "order",
    "artwork",
    "proof",
    "production",
    "completed",
    "cancelled",
  ]),
  note: z.string().trim().max(500).optional(),
  archive: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
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

  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid transition payload." },
      { status: 400 }
    );
  }

  const { orderId } = await context.params;
  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, order_number, owner_id, status, proof_approved")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Handle archive-only toggle on completed orders
  if (parsed.data.archive && order.status === "completed") {
    await admin
      .from("orders")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", order.id);

    return NextResponse.json({ ok: true, archived: true });
  }

  const check = canTransitionOrderStatus({
    from: order.status as OrderStatus,
    to: parsed.data.to_status,
    proofApproved: Boolean(order.proof_approved),
    reason: parsed.data.note,
  });

  if (!check.allowed) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  await admin
    .from("orders")
    .update({ status: parsed.data.to_status })
    .eq("id", order.id);

  // Auto-create Proof v1/v2 when moving into 'proof' stage if no pending proof exists
  if (parsed.data.to_status === "proof") {
    const { data: items } = await admin
      .from("order_items")
      .select("id, design_id, designs(scene_json)")
      .eq("order_id", order.id);

    for (const item of items ?? []) {
      const { data: existing } = await admin
        .from("proofs")
        .select("id, version, status")
        .eq("order_item_id", item.id);

      const hasPending = (existing ?? []).some((p) => p.status === "pending");
      if (!hasPending) {
        const nextVersion =
          (existing ?? []).length === 0
            ? 1
            : Math.max(...(existing ?? []).map((p) => Number(p.version))) + 1;

        await admin
          .from("proofs")
          .update({ status: "superseded" })
          .eq("order_item_id", item.id)
          .neq("status", "superseded");

        const design = item.designs as unknown as {
          scene_json?: Record<string, unknown>;
        } | null;

        await admin.from("proofs").insert({
          order_item_id: item.id,
          version: nextVersion,
          file_path: `proofs/${order.order_number}/v${nextVersion}.png`,
          scene_snapshot: design?.scene_json ?? {},
          status: "pending",
          created_by: auth.session.userId,
        });
      }
    }

    await admin
      .from("orders")
      .update({ proof_approved: false })
      .eq("id", order.id);
  }

  await admin.from("order_status_history").insert({
    order_id: order.id,
    from_status: order.status,
    to_status: parsed.data.to_status,
    changed_by: auth.session.userId,
    note: parsed.data.note ?? null,
  });

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", order.owner_id)
    .single();

  if (ownerProfile?.email) {
    await sendOrderStatusEmail({
      to: ownerProfile.email,
      orderNumber: order.order_number,
      orderId: order.id,
      newStatus: parsed.data.to_status,
      note: parsed.data.note,
    });
  }

  return NextResponse.json({
    ok: true,
    from_status: order.status,
    to_status: parsed.data.to_status,
  });
}
