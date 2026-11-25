import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_EXTENSIONS = new Set(["pdf", "svg", "ai", "png"]);
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/svg+xml",
  "application/postscript",
  "application/illustrator",
  "image/png",
  "application/octet-stream", // some browsers send this for .ai
]);

/**
 * Artwork Upload Path (§8.1, Decision D10):
 * Accepts .pdf, .svg, .ai (PDF-compatible), .png only.
 */
export async function POST(request: Request) {
  const auth = await authorizeApiRequest();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rl = checkRateLimit(`upload:${auth.session.userId}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File must be between 1 byte and 20 MB." },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload PDF, SVG, AI, or PNG only." },
      { status: 400 }
    );
  }

  if (file.type && !ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: `Invalid MIME type (${file.type}). Allowed: PDF, SVG, AI, PNG.` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${auth.session.userId}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: storageErr } = await supabase.storage
    .from("uploads")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageErr) {
    return NextResponse.json({ error: storageErr.message }, { status: 500 });
  }

  // Decision D10: .ai files are flagged needs_review if manual verification is needed
  const status = ext === "ai" ? "needs_review" : "ok";

  const { data: uploadRow, error: dbErr } = await supabase
    .from("uploads")
    .insert({
      owner_id: auth.session.userId,
      storage_path: storagePath,
      file_name: file.name,
      mime: file.type || `application/${ext}`,
      size_bytes: file.size,
      status,
    })
    .select("*")
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ upload: uploadRow }, { status: 201 });
}
