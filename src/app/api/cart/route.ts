import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getPricingConfig, getProductsWithDetails } from "@/lib/catalogue/queries";
import { calculateProductPrice } from "@/lib/pricing/engine";
import { addToCartSchema } from "@/types/orders";

export async function GET() {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("owner_id", auth.session.userId)
    .maybeSingle();

  if (!cart) {
    return NextResponse.json({ items: [], total: 0, taxTotal: 0 });
  }

  const { data: items, error } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", cart.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [products, pricingConfig] = await Promise.all([
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  let total = 0;
  let taxTotal = 0;

  const enriched = (items ?? []).map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    const price = product
      ? calculateProductPrice(product, item.config, pricingConfig)
      : null;

    if (price?.valid) {
      total += price.lineTotal;
      taxTotal += price.taxAmount;
    }

    return {
      ...item,
      productName: product?.name ?? "Unknown product",
      divisionName: product?.division_name ?? "",
      price,
    };
  });

  return NextResponse.json({
    items: enriched,
    total,
    taxTotal,
    pricingConfig,
  });
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

  const parsed = addToCartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid cart item." },
      { status: 400 }
    );
  }

  const [products, pricingConfig] = await Promise.all([
    getProductsWithDetails(),
    getPricingConfig(),
  ]);

  const product = products.find((p) => p.id === parsed.data.product_id);
  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  // Server-authoritative validation of config + pricing
  const priceResult = calculateProductPrice(
    product,
    parsed.data.config,
    pricingConfig
  );
  if (!priceResult.valid) {
    return NextResponse.json({ error: priceResult.error }, { status: 400 });
  }

  const supabase = await createClient();

  let { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("owner_id", auth.session.userId)
    .maybeSingle();

  if (!cart) {
    const { data: created, error: createErr } = await supabase
      .from("carts")
      .insert({
        owner_id: auth.session.userId,
        account_id: auth.session.profile.account_id,
      })
      .select("id")
      .single();

    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create cart." },
        { status: 500 }
      );
    }
    cart = created;
  }

  const { data: item, error: insertErr } = await supabase
    .from("cart_items")
    .insert({
      cart_id: cart.id,
      product_id: product.id,
      design_id: parsed.data.design_id ?? null,
      config: parsed.data.config,
      quantity: parsed.data.config.quantity,
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ item, price: priceResult }, { status: 201 });
}
