import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";

export const maxDuration = 30;

const BUCKET = "character-photos";
const PROBE_PATH = "_health-check/probe.png";
const PROBE_PAYLOAD = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const steps: { name: string; ms: number }[] = [];

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let currentStep = "signed_url";
  let failed = false;
  let failedStep = "";
  let errorMsg = "";

  // ── Steps: signed_url → put → verify ──────────────────────────────────
  try {
    // Step 1: Generate signed upload URL
    const t0 = Date.now();
    const { data: urlData, error: urlError } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(PROBE_PATH);

    steps.push({ name: "signed_url", ms: Date.now() - t0 });

    if (urlError || !urlData?.signedUrl) {
      throw new Error(urlError?.message ?? "No signed URL returned");
    }

    // Step 2: PUT via fetch (mirrors client-side upload pattern)
    currentStep = "put";
    const t1 = Date.now();
    const putRes = await fetch(urlData.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: PROBE_PAYLOAD,
    });

    steps.push({ name: "put", ms: Date.now() - t1 });

    if (!putRes.ok) {
      throw new Error(`PUT returned ${putRes.status}`);
    }

    // Step 3: Verify content round-trips correctly
    currentStep = "verify";
    const t2 = Date.now();
    const { data: downloaded, error: dlError } = await admin.storage
      .from(BUCKET)
      .download(PROBE_PATH);

    steps.push({ name: "verify", ms: Date.now() - t2 });

    if (dlError || !downloaded) {
      throw new Error(dlError?.message ?? "Download returned no data");
    }

    const buf = Buffer.from(await downloaded.arrayBuffer());
    if (!buf.equals(PROBE_PAYLOAD)) {
      throw new Error(
        `Content mismatch: expected ${PROBE_PAYLOAD.length} bytes, got ${buf.length} bytes`
      );
    }
  } catch (e: unknown) {
    failed = true;
    failedStep = currentStep;
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  // ── Cleanup (always runs, swallows errors) ────────────────────────────
  const t3 = Date.now();
  try {
    await admin.storage.from(BUCKET).remove([PROBE_PATH]);
  } catch (e) {
    console.error("Health check cleanup failed:", e);
  }
  steps.push({ name: "cleanup", ms: Date.now() - t3 });

  const elapsed_ms = Date.now() - startedAt;

  // ── Failure path ──────────────────────────────────────────────────────
  if (failed) {
    logEvent({
      event_type: "health_check.upload",
      status: "error",
      message: `Upload health check failed at ${failedStep}: ${errorMsg}`,
      metadata: { elapsed_ms, steps, failed_step: failedStep, error: errorMsg },
    });

    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL!,
        subject: "[Storybound] Upload health check failed",
        html: `
          <p><strong>Upload health check failed</strong></p>
          <p><strong>Failed step:</strong> ${failedStep}</p>
          <p><strong>Error:</strong> ${errorMsg}</p>
          <p><strong>Elapsed:</strong> ${elapsed_ms}ms</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        `,
      });
    } catch (e) {
      console.error("Health check alert email failed:", e);
    }

    return NextResponse.json(
      { status: "error", failed_step: failedStep, error: errorMsg, elapsed_ms, steps },
      { status: 500 }
    );
  }

  // ── Success path ──────────────────────────────────────────────────────
  logEvent({
    event_type: "health_check.upload",
    status: "success",
    message: `Upload health check passed in ${elapsed_ms}ms`,
    metadata: { elapsed_ms, steps },
  });

  return NextResponse.json({ status: "ok", elapsed_ms, steps });
}
