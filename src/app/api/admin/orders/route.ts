import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin Searchable Job Database (§13.1):
 * Supports filtering by status, search text, archived state, and server-side pagination.
 */
export async function GET(request: Request) {
  const auth = await authorizeApiRequest("admin");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() || "";
  const query = searchParams.get("q")?.trim().toLowerCase() || "";
  const archived = searchParams.get("archived") === "true";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

  const admin = createAdminClient();
  let dbQuery = admin
    .from("orders")
    .select(
      `
      *,
      profiles!orders_owner_id_fkey(email, full_name, company),
      order_items(id, product_id, quantity, line_total, products(name, product_type))
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    dbQuery = dbQuery.eq("status", status);
  }
  if (archived) {
    dbQuery = dbQuery.not("archived_at", "is", null);
  } else {
    dbQuery = dbQuery.is("archived_at", null);
  }
  if (query) {
    dbQuery = dbQuery.ilike("order_number", `%${query}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  dbQuery = dbQuery.range(from, to);

  const { data, count, error } = await dbQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    orders: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}
