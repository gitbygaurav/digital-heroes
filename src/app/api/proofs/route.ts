import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getNextProofVersion } from "@/lib/proofs/gate";
import { sendProofNotificationEmail } from "@/lib/email/send";

const createProofSchema = z.object({
  order_item_id: z.string().uuid(),
  scene_snapshot: z.record(z.string(), z.unknown()).default({}),
  file_path: z.string().optional(),
});

export async function GET() {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proofs")
    .select(
      `
      *,
      proof_approvals(*),
      change_requests(*),
      order_items!inner(
        id,
        order_id,
        orders!inner(id, order_number, owner_id, status, proof_approved)
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proofs: data ?? [] });
}

export async function POST(request: Request) {
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

  const parsed = createProofSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid proof payload." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: orderItem, error: itemErr } = await admin
    .from("order_items")
    .select("id, order_id, orders!inner(id, order_number, owner_id, status)")
    .eq("id", parsed.data.order_item_id)
    .single();

  if (itemErr || !orderItem) {
    return NextResponse.json({ error: "Order item not found." }, { status: 404 });
  }

  const order = orderItem.orders as unknown as {
    id: string;
    order_number: string;
    owner_id: string;
    status: string;
  };

  if (order.owner_id !== auth.session.userId && auth.session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Fetch existing versions to compute next sequential version (v1, v2, ...)
  const { data: existingProofs } = await admin
    .from("proofs")
    .select("id, version, status")
    .eq("order_item_id", orderItem.id);

  const nextVersion = getNextProofVersion(
    (existingProofs ?? []).map((p) => Number(p.version))
  );

  // Mark prior non-superseded proofs as superseded (never delete history)
  await admin
    .from("proofs")
    .update({ status: "superseded" })
    .eq("order_item_id", orderItem.id)
    .neq("status", "superseded");

  const { data: proof, error: insertErr } = await admin
    .from("proofs")
    .insert({
      order_item_id: orderItem.id,
      version: nextVersion,
      file_path: parsed.data.file_path ?? `proofs/${order.order_number}/v${nextVersion}.png`,
      scene_snapshot: parsed.data.scene_snapshot,
      status: "pending",
      created_by: auth.session.userId,
    })
    .select("*")
    .single();

  if (insertErr || !proof) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create proof." },
      { status: 500 }
    );
  }

  // Transition order status to 'proof' if currently in 'order' or 'artwork'
  if (order.status === "order" || order.status === "artwork") {
    await admin
      .from("orders")
      .update({ status: "proof", proof_approved: false })
      .eq("id", order.id);

    await admin.from("order_status_history").insert({
      order_id: order.id,
      from_status: order.status,
      to_status: "proof",
      changed_by: auth.session.userId,
      note: `Proof v${nextVersion} generated`,
    });
  }

  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", order.owner_id)
    .single();

  if (ownerProfile?.email) {
    await sendProofNotificationEmail({
      to: ownerProfile.email,
      orderNumber: order.order_number,
      orderId: order.id,
      version: nextVersion,
      event: "proof_ready",
    });
  }

  return NextResponse.json({ proof }, { status: 201 });
}
