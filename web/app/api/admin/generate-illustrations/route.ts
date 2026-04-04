export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import {
  startFaceTraining,
  triggerIllustrationPipeline,
} from "@/app/admin/actions";

export async function POST(req: NextRequest) {
  // Auth check — only admin can trigger illustration generation
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const { harvestId, skipLora: clientSkipLora } = body as {
    harvestId: string;
    skipLora?: boolean;
  };

  // Server is source of truth for skip_lora — override client if DB says LoRA exists
  let skipLora = clientSkipLora ?? false;

  if (skipLora) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: harvest } = await admin
      .from("harvests")
      .select("face_ref_generated, face_ref_path")
      .eq("id", harvestId)
      .single();

    if (harvest?.face_ref_generated && harvest?.face_ref_path) {
      skipLora = false;
    }
  }

  if (skipLora || process.env.NODE_ENV === "development") {
    const result = await triggerIllustrationPipeline(harvestId, skipLora);
    return NextResponse.json(result);
  }

  // Production: start training (sends photos to Modal, returns in <30s)
  // Training completion arrives via /api/admin/training-complete webhook
  const trainResult = await startFaceTraining(harvestId);

  if ("error" in trainResult) {
    return NextResponse.json({ error: trainResult.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      status: "training",
      message: trainResult.message ?? "Training started, webhook will notify when complete.",
    },
    { status: 202 }
  );
}
