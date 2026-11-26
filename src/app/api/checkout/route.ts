import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getPricingConfig, getProductsWithDetails } from "@/lib/catalogue/queries";
import { calculateProductPrice } from "@/lib/pricing/engine";
import { getPaymentProvider } from "@/lib/payments/stripe";
import { checkoutRequestSchema } from "@/types/orders";

/**
 * Server-authoritative Checkout endpoint (§7.2):
 * - Ignores any client-submitted prices
 * - Recomputes every cart item using calculateProductPrice()
 * - Creates pending order + order_items
 * - Redirects to Stripe Checkout Session
 */
export async function POST(request: Request) {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid checkout payload." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("owner_id", auth.session.userId)
    .maybeSingle();

  if (!cart) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }

  const { data: cartItems, error: itemsErr } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", cart.id);

  if (itemsErr || !cartItems || cartItems.length === 0) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }

  const [products, pricingConfig] = await Promise.all([
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  let orderSubtotal = 0;
  let orderDiscountTotal = 0;
  let orderTaxTotal = 0;
  let orderTotal = 0;

  const computedItems: Array<{
    product_id: string;
    product_name: string;
    design_id: string | null;
    config: Record<string, unknown>;
    quantity: number;
    unit_price: number;
    discount_percent: number;
    line_total: number;
  }> = [];

  for (const item of cartItems) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) {
      return NextResponse.json(
        { error: `Product ${item.product_id} is no longer available.` },
        { status: 400 }
      );
    }

    const price = calculateProductPrice(product, item.config, pricingConfig);
    if (!price.valid) {
      return NextResponse.json({ error: price.error }, { status: 400 });
    }

    const undiscountedLine = price.unitOptions * item.quantity + price.setupFee;
    orderSubtotal += price.lineSubtotal;
    orderDiscountTotal += Math.max(0, undiscountedLine - price.lineSubtotal);
    orderTaxTotal += price.taxAmount;
    orderTotal += price.lineTotal;

    computedItems.push({
      product_id: product.id,
      product_name: product.name,
      design_id: item.design_id,
      config: item.config,
      quantity: item.quantity,
      unit_price: price.unitPrice,
      discount_percent: price.discountPercent,
      line_total: price.lineTotal,
    });
  }

  // Create pending order (quote -> order upon payment webhook, Decision D4 & D6)
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      owner_id: auth.session.userId,
      account_id: auth.session.profile.account_id,
      status: "quote",
      subtotal: orderSubtotal,
      discount_total: orderDiscountTotal,
      tax_total: orderTaxTotal,
      total: orderTotal,
      currency: pricingConfig.currency,
      tax_rate: pricingConfig.tax_rate_percent,
      tax_inclusive: pricingConfig.tax_inclusive,
      payment_status: "pending",
      notes: parsed.data.notes ?? null,
    })
    .select("*")
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message ?? "Failed to create order." },
      { status: 500 }
    );
  }

  const { error: oiErr } = await supabase.from("order_items").insert(
    computedItems.map((ci) => ({
      order_id: order.id,
      product_id: ci.product_id,
      design_id: ci.design_id,
      config: ci.config,
      quantity: ci.quantity,
      unit_price: ci.unit_price,
      discount_percent: ci.discount_percent,
      line_total: ci.line_total,
    }))
  );

  if (oiErr) {
    return NextResponse.json({ error: oiErr.message }, { status: 500 });
  }

  const reqOrigin =
    request.headers.get("origin") ??
    (request.headers.get("x-forwarded-host")
      ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("x-forwarded-host")}`
      : null);
  const siteUrl =
    reqOrigin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const provider = getPaymentProvider();

  try {
    const session = await provider.createCheckoutSession({
      orderId: order.id,
      orderNumber: order.order_number,
      customerEmail: auth.session.email,
      currency: pricingConfig.currency,
      lineItems: computedItems.map((ci) => ({
        name: ci.product_name,
        description: `Qty ${ci.quantity} · ${String(ci.config.width_mm ?? "")}×${String(ci.config.height_mm ?? "")} mm`,
        unitAmountMinor: ci.line_total,
        quantity: 1,
      })),
      successUrl: `${siteUrl}/checkout/success?order=${order.order_number}`,
      cancelUrl: `${siteUrl}/checkout/cancel?order=${order.order_number}`,
    });

    await supabase
      .from("orders")
      .update({ stripe_session_id: session.sessionId })
      .eq("id", order.id);

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.order_number,
      checkoutUrl: session.checkoutUrl,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Payment provider initialization failed.",
      },
      { status: 500 }
    );
  }
}
