import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get("x-webhook-secret");
  if (secret !== process.env.MODAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { harvest_id, status } = body;

  if (!harvest_id) {
    return NextResponse.json(
      { error: "Missing harvest_id" },
      { status: 400 }
    );
  }

  if (status !== "complete") {
    console.error("Illustration generation failed:", body);
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 400 }
    );
  }

  // Update harvest status to complete
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { error } = await supabase
    .from("harvests")
    .update({ status: "complete" })
    .eq("id", harvest_id);

  if (error) {
    console.error("Failed to update harvest:", error);
    return NextResponse.json(
      { error: "DB update failed" },
      { status: 500 }
    );
  }

  console.log(`Illustrations complete for harvest ${harvest_id}`);

  // Clean up LoRA weights
  const { data: harvest, error: harvestError } = await supabase
    .from("harvests")
    .select("face_ref_path, child_id")
    .eq("id", harvest_id)
    .single();

  if (!harvestError && harvest?.face_ref_path) {
    try {
      const deleteUrl = process.env.MODAL_FLUX_DELETE_URL!;
      await fetch(deleteUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MODAL_AUTH_TOKEN}`,
        },
        body: JSON.stringify({
          face_model_id: harvest.face_ref_path,
          child_id: harvest.child_id,
          harvest_id: harvest_id,
        }),
      });
      console.log(`Face model deleted for harvest ${harvest_id}`);
    } catch (e) {
      console.error("Failed to delete face model:", e);
      // Don't fail the webhook — deletion failure is non-critical
    }
  }

  return NextResponse.json({ status: "ok" });
}
