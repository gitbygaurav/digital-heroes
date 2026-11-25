import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { sceneJsonSchema } from "@/lib/designer/scene";

const createDesignSchema = z.object({
  product_id: z.string().min(1),
  template_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(["designer", "upload"]),
  scene_json: sceneJsonSchema.optional(),
  upload_id: z.string().uuid().optional(),
});

export async function GET() {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("designs")
    .select("*")
    .eq("owner_id", auth.session.userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ designs: data ?? [] });
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

  const parsed = createDesignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid design payload." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: design, error } = await supabase
    .from("designs")
    .insert({
      owner_id: auth.session.userId,
      account_id: auth.session.profile.account_id,
      product_id: parsed.data.product_id,
      template_id: parsed.data.template_id ?? null,
      name: parsed.data.name,
      config: parsed.data.config,
      scene_json: parsed.data.scene_json ?? {},
      source: parsed.data.source,
    })
    .select("*")
    .single();

  if (error || !design) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save design." },
      { status: 500 }
    );
  }

  if (parsed.data.upload_id) {
    await supabase
      .from("uploads")
      .update({ design_id: design.id })
      .eq("id", parsed.data.upload_id)
      .eq("owner_id", auth.session.userId);
  }

  return NextResponse.json({ design }, { status: 201 });
}
