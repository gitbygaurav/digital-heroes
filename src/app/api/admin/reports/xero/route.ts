import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

function csvEscape(val: string | number): string {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Xero-ready Accounting CSV Export (§7.2, §13):
 * Columns: ContactName, InvoiceNumber, InvoiceDate, DueDate, Description,
 *          Quantity, UnitAmount, AccountCode, TaxType
 */
export async function GET() {
  const auth = await authorizeApiRequest("admin");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: orders, error } = await admin
    .from("orders")
    .select(
      `
      id, order_number, created_at, total, tax_rate,
      profiles!orders_owner_id_fkey(full_name, company, email),
      invoices(invoice_number, issued_at),
      order_items(quantity, unit_price, line_total, products(name))
    `
    )
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "ContactName",
    "InvoiceNumber",
    "InvoiceDate",
    "DueDate",
    "Description",
    "Quantity",
    "UnitAmount",
    "AccountCode",
    "TaxType",
  ].join(",");

  const rows: string[] = [header];

  for (const ord of orders ?? []) {
    const profile = ord.profiles as unknown as {
      full_name?: string;
      company?: string;
      email?: string;
    };
    const inv = Array.isArray(ord.invoices) ? ord.invoices[0] : ord.invoices;
    const contact =
      profile?.company || profile?.full_name || profile?.email || "Customer";
    const invNum =
      (inv as { invoice_number?: string } | null)?.invoice_number ??
      `INV-${ord.order_number}`;
    const invDate = String(ord.created_at).slice(0, 10);

    const items = (ord.order_items ?? []) as Array<{
      quantity: number;
      line_total: number;
      products?: { name?: string };
    }>;

    for (const item of items) {
      const unitMajor = (Number(item.line_total) / 100 / Math.max(1, item.quantity)).toFixed(2);
      rows.push(
        [
          csvEscape(contact),
          csvEscape(invNum),
          csvEscape(invDate),
          csvEscape(invDate),
          csvEscape(`${item.products?.name ?? "Print Job"} (${ord.order_number})`),
          csvEscape(item.quantity),
          csvEscape(unitMajor),
          csvEscape("200"),
          csvEscape(`GST ${ord.tax_rate}%`),
        ].join(",")
      );
    }
  }

  return new NextResponse(rows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="digital-heroes-xero-export.csv"',
    },
  });
}
