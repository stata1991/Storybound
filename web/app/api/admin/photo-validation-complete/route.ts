import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Read body first — Vercel connection-close prevention
  const body = await req.json();

  // Verify webhook secret
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.MODAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { harvest_id } = body;
  if (!harvest_id) {
    return NextResponse.json(
      { error: "Missing harvest_id" },
      { status: 400 }
    );
  }

  await logEvent({
    event_type: "photo_validation_run",
    status: body.set?.set_pass ? "info" : "warn",
    harvest_id,
    message: `Photo validation: ${body.set?.hard_pass_count ?? 0} hard-pass photos, set_pass=${body.set?.set_pass ?? false}`,
    metadata: {
      set: body.set,
      per_photo_verdicts: (body.per_photo ?? []).map(
        (p: { verdict: string; hard_fails: string[]; warnings: string[] }) => ({
          verdict: p.verdict,
          hard_fails: p.hard_fails,
          warnings: p.warnings,
        })
      ),
      timing_seconds: body.timing_seconds,
    },
  });

  return NextResponse.json({ status: "ok" });
}
