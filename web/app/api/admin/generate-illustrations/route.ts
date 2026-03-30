export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import {
  startFaceTraining,
  triggerIllustrationPipeline,
} from "@/app/admin/actions";

export async function POST(req: NextRequest) {
  const { harvestId, skipLora } = (await req.json()) as {
    harvestId: string;
    skipLora?: boolean;
  };

  console.log("Generate illustrations called, NODE_ENV:", process.env.NODE_ENV, "harvestId:", harvestId, "skipLora:", skipLora);

  if (skipLora || process.env.NODE_ENV === "development") {
    // Dev: full sync flow (no webhook needed)
    // Skip-LoRA: no training needed
    const result = await triggerIllustrationPipeline(harvestId, skipLora);
    return NextResponse.json(result);
  }

  // Production: async path — kick off training, return 202
  const trainResult = await startFaceTraining(harvestId);

  if ("error" in trainResult) {
    return NextResponse.json({ error: trainResult.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      status: "training",
      face_model_id: trainResult.face_model_id,
      message: "LoRA training started. Illustrations will generate automatically on completion.",
    },
    { status: 202 }
  );
}
