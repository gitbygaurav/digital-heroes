import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments/stripe";
import { generateInvoicePdfBuffer } from "@/lib/invoices/generate";
import { sendOrderConfirmationEmail } from "@/lib/email/send";
import { getPricingConfig, getProductsWithDetails } from "@/lib/catalogue/queries";

/**
 * Idempotent Stripe Webhook handler (§7.2):
 * - Verifies signature via PaymentProvider
 * - On checkout.session.completed: marks paid, moves status quote -> order,
 *   writes order_status_history, generates invoice PDF, clears cart, sends email.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  const rawBody = await request.text();
  const provider = getPaymentProvider();

  let event;
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Invalid webhook signature.",
      },
      { status: 400 }
    );
  }

  if (event.type !== "checkout.completed" || !event.orderId) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("*")
    .eq("id", event.orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Idempotency guard: if already paid, do nothing and return 200
  if (order.payment_status === "paid") {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // 1. Mark paid & transition quote -> order
  const previousStatus = order.status;
  const nextStatus = previousStatus === "quote" ? "order" : previousStatus;

  await admin
    .from("orders")
    .update({
      payment_status: "paid",
      status: nextStatus,
      stripe_payment_intent: event.paymentIntentId ?? order.stripe_payment_intent,
    })
    .eq("id", order.id);

  await admin.from("order_status_history").insert({
    order_id: order.id,
    from_status: previousStatus,
    to_status: nextStatus,
    changed_by: null,
    note: "Payment confirmed via Stripe Checkout webhook",
  });

  // 2. Clear owner's cart
  const { data: cart } = await admin
    .from("carts")
    .select("id")
    .eq("owner_id", order.owner_id)
    .maybeSingle();

  if (cart) {
    await admin.from("cart_items").delete().eq("cart_id", cart.id);
  }

  // 3. Create invoice record & upload PDF
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, company")
    .eq("id", order.owner_id)
    .single();

  const { data: orderItems } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  const [products, pricingConfig] = await Promise.all([
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  const { data: existingInvoice } = await admin
    .from("invoices")
    .select("*")
    .eq("order_id", order.id)
    .maybeSingle();

  if (!existingInvoice) {
    const { data: invoiceRow } = await admin
      .from("invoices")
      .insert({ order_id: order.id })
      .select("*")
      .single();

    if (invoiceRow) {
      const pdfBuffer = await generateInvoicePdfBuffer({
        invoiceNumber: invoiceRow.invoice_number,
        orderNumber: order.order_number,
        issuedAt: invoiceRow.issued_at,
        customerName: profile?.full_name ?? profile?.email ?? "Customer",
        customerEmail: profile?.email ?? "",
        companyName: profile?.company,
        currencySymbol: pricingConfig.currency_symbol,
        taxLabel: pricingConfig.tax_label,
        taxRatePercent: Number(order.tax_rate),
        taxInclusive: Boolean(order.tax_inclusive),
        subtotal: Number(order.subtotal),
        taxTotal: Number(order.tax_total),
        total: Number(order.total),
        items: (orderItems ?? []).map((oi) => {
          const prod = products.find((p) => p.id === oi.product_id);
          const cfg = oi.config as Record<string, unknown>;
          return {
            name: prod?.name ?? "Print Product",
            specs: `${String(cfg.width_mm ?? "")}×${String(cfg.height_mm ?? "")} mm · ${String(cfg.shape ?? "rect")}`,
            quantity: Number(oi.quantity),
            lineTotal: Number(oi.line_total),
          };
        }),
      });

      const storagePath = `${order.owner_id}/${invoiceRow.invoice_number}.pdf`;
      const { error: uploadErr } = await admin.storage
        .from("invoices")
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadErr) {
        await admin
          .from("invoices")
          .update({ pdf_path: storagePath })
          .eq("id", invoiceRow.id);
      }
    }
  }

  // 4. Send confirmation email
  if (profile?.email) {
    await sendOrderConfirmationEmail({
      to: profile.email,
      customerName: profile.full_name ?? profile.email,
      orderNumber: order.order_number,
      orderId: order.id,
      totalMinor: Number(order.total),
      currencySymbol: pricingConfig.currency_symbol,
    });
  }

  return NextResponse.json({ received: true });
}
