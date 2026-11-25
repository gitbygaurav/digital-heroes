import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProductsWithDetails } from "@/lib/catalogue/queries";

const updateProductSchema = z.object({
  id: z.string().uuid(),
  base_unit_price: z.number().int().min(0).optional(),
  setup_fee: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function GET() {
  const auth = await authorizeApiRequest("admin");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const products = await getProductsWithDetails();
  return NextResponse.json({ products });
}

export async function PATCH(request: Request) {
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

  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product update." }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (parsed.data.base_unit_price !== undefined) {
    updates.base_unit_price = parsed.data.base_unit_price;
  }
  if (parsed.data.setup_fee !== undefined) {
    updates.setup_fee = parsed.data.setup_fee;
  }
  if (parsed.data.is_active !== undefined) {
    updates.is_active = parsed.data.is_active;
  }

  const { data, error } = await admin
    .from("products")
    .update(updates)
    .eq("id", parsed.data.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data });
}
