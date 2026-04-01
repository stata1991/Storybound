export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  startFaceTraining,
  triggerIllustrationPipeline,
} from "@/app/admin/actions";

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("Route entered, body:", JSON.stringify(body));

  const { harvestId, skipLora: clientSkipLora } = body as {
    harvestId: string;
    skipLora?: boolean;
  };

  // Server is source of truth for skip_lora — override client if DB says LoRA exists
  let skipLora = clientSkipLora ?? false;

  if (skipLora) {
    console.log("About to check harvest for skipLora override...");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data: harvest, error: fetchErr } = await admin
      .from("harvests")
      .select("face_ref_generated, face_ref_path")
      .eq("id", harvestId)
      .single();

    console.log("Harvest lookup result:", { harvest, fetchErr: fetchErr?.message });

    if (harvest?.face_ref_generated && harvest?.face_ref_path) {
      console.log("Server override: skipLora=false because face_ref_generated=true", {
        harvestId,
        face_ref_path: harvest.face_ref_path,
      });
      skipLora = false;
    }
  }

  console.log("Final decision — NODE_ENV:", process.env.NODE_ENV, "harvestId:", harvestId, "skipLora:", skipLora, "clientSkipLora:", clientSkipLora);

  if (skipLora || process.env.NODE_ENV === "development") {
    console.log("Calling triggerIllustrationPipeline with skipLora:", skipLora);
    const result = await triggerIllustrationPipeline(harvestId, skipLora);
    console.log("triggerIllustrationPipeline returned:", JSON.stringify(result).slice(0, 300));
    return NextResponse.json(result);
  }

  // Production: async path — kick off training, return 202
  console.log("Production async path — calling startFaceTraining");
  const trainResult = await startFaceTraining(harvestId);

  if ("error" in trainResult) {
    console.log("startFaceTraining error:", trainResult.error);
    return NextResponse.json({ error: trainResult.error }, { status: 400 });
  }

  console.log("Training started, returning 202:", { face_model_id: trainResult.face_model_id });
  return NextResponse.json(
    {
      status: "training",
      face_model_id: trainResult.face_model_id,
      message: "LoRA training started. Illustrations will generate automatically on completion.",
    },
    { status: 202 }
  );
}
