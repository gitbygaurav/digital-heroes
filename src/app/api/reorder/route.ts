import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getPricingConfig, getProductsWithDetails } from "@/lib/catalogue/queries";
import { calculateProductPrice } from "@/lib/pricing/engine";

const reorderSchema = z.object({
  order_id: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
});

/**
 * One-click reorder (§11):
 * - Copies config + approved design from a past order (owner only)
 * - Allows optional quantity change
 * - Re-prices at current catalogue prices on the server
 * - Adds to cart and returns /cart so customer can go straight to checkout
 */
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid reorder request." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: pastOrder, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, owner_id, order_items(*)")
    .eq("id", parsed.data.order_id)
    .single();

  if (orderErr || !pastOrder) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (pastOrder.owner_id !== auth.session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const pastItems = (pastOrder.order_items ?? []) as Array<{
    product_id: string;
    design_id: string | null;
    config: Record<string, unknown>;
    quantity: number;
  }>;

  if (pastItems.length === 0) {
    return NextResponse.json(
      { error: "Original order has no items to reorder." },
      { status: 400 }
    );
  }

  const [products, pricingConfig] = await Promise.all([
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  // Ensure cart exists
  let { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("owner_id", auth.session.userId)
    .maybeSingle();

  if (!cart) {
    const { data: created, error: cartErr } = await supabase
      .from("carts")
      .insert({
        owner_id: auth.session.userId,
        account_id: auth.session.profile.account_id,
      })
      .select("id")
      .single();

    if (cartErr || !created) {
      return NextResponse.json(
        { error: cartErr?.message ?? "Failed to initialize cart." },
        { status: 500 }
      );
    }
    cart = created;
  }

  for (const item of pastItems) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) continue;

    const qty = parsed.data.quantity ?? item.quantity;
    const updatedConfig = {
      width_mm: Number(item.config.width_mm ?? product.size_rule.default_width_mm),
      height_mm: Number(item.config.height_mm ?? product.size_rule.default_height_mm),
      shape: String(item.config.shape ?? product.size_rule.allowed_shapes[0] ?? "rect"),
      quantity: qty,
      selectedOptions: (item.config.selectedOptions ?? {}) as Record<string, string>,
    };

    const repriced = calculateProductPrice(product, updatedConfig, pricingConfig);
    if (!repriced.valid) {
      return NextResponse.json({ error: repriced.error }, { status: 400 });
    }

    await supabase.from("cart_items").insert({
      cart_id: cart.id,
      product_id: product.id,
      design_id: item.design_id,
      config: updatedConfig,
      quantity: qty,
    });
  }

  return NextResponse.json({
    ok: true,
    reorder_of: pastOrder.order_number,
    redirectTo: "/cart",
  });
}
