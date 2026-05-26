export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { completeIllustrationGeneration } from "@/app/admin/actions";

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get("x-webhook-secret");
  const expected = process.env.MODAL_WEBHOOK_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    harvest_id: string;
    child_id?: string;
    face_model_id: string;
    status: string;
    message?: string;
  };

  if (!body.harvest_id || !body.face_model_id) {
    return NextResponse.json(
      { error: "Missing harvest_id or face_model_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Training failed — reset harvest so it can be retried ──
  if (body.status !== "ok") {
    console.error(
      `Training failed for harvest ${body.harvest_id}: ${body.message ?? body.status}`
    );
    await admin
      .from("harvests")
      .update({ status: "processing" })
      .eq("id", body.harvest_id);
    // Return 200 — Modal must not retry this callback
    return NextResponse.json({
      success: false,
      reason: "training_error",
      message: body.message ?? `Training failed with status: ${body.status}`,
    });
  }

  // ── Training succeeded — store model ID and generate illustrations ──
  await admin
    .from("harvests")
    .update({ face_ref_path: body.face_model_id })
    .eq("id", body.harvest_id);

  // Fire off illustration generation (runs in this request's context)
  const result = await completeIllustrationGeneration(
    body.harvest_id,
    body.face_model_id
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
