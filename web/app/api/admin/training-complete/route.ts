export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
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
  };

  if (!body.harvest_id || !body.face_model_id) {
    return NextResponse.json(
      { error: "Missing harvest_id or face_model_id" },
      { status: 400 }
    );
  }

  if (body.status !== "ok") {
    return NextResponse.json(
      { error: `Training failed with status: ${body.status}` },
      { status: 400 }
    );
  }

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
