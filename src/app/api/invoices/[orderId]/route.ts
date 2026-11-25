import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { generateInvoicePdfBuffer } from "@/lib/invoices/generate";
import { getPricingConfig, getProductsWithDetails } from "@/lib/catalogue/queries";

/**
 * Generates or downloads the PDF invoice for an order (owner or admin only).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { orderId } = await context.params;
  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.owner_id !== auth.session.userId && auth.session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [{ data: invoice }, { data: orderItems }, { data: profile }, products, pricingConfig] =
    await Promise.all([
      supabase.from("invoices").select("*").eq("order_id", order.id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", order.id),
      supabase.from("profiles").select("email, full_name, company").eq("id", order.owner_id).single(),
      getProductsWithDetails(),
      getPricingConfig(),
    ]);

  const pdfBuffer = await generateInvoicePdfBuffer({
    invoiceNumber: invoice?.invoice_number ?? `INV-${order.order_number}`,
    orderNumber: order.order_number,
    issuedAt: invoice?.issued_at ?? order.created_at,
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

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice?.invoice_number ?? order.order_number}.pdf"`,
    },
  });
}
