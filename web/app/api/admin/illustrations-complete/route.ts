import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/audit";

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase
      .from("harvests")
      .update({ status: "failed" })
      .eq("id", harvest_id);

    if (error) {
      console.error("Failed to update harvest to failed:", error);
    }

    logEvent({
      event_type: "illustration_generation_failed",
      status: "error",
      harvest_id,
      message: body.message ?? "Unknown error",
      metadata: { failed_labels: body.failed_labels },
    });

    return NextResponse.json({ status: "ok" });
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

  // Clean up harvest photos (LoRA retained for regen)
  const { data: harvest, error: harvestError } = await supabase
    .from("harvests")
    .select("photo_paths")
    .eq("id", harvest_id)
    .single();

  if (harvestError) {
    console.error(
      `[illustrations-complete] Failed to fetch photo_paths for harvest ${harvest_id}:`,
      harvestError
    );
  } else if (!harvest?.photo_paths || harvest.photo_paths.length === 0) {
    console.warn(
      `[illustrations-complete] harvest ${harvest_id} has no photo_paths — skipping photo cleanup`
    );
  } else {
    try {
      const { data: removed, error: removeError } = await supabase.storage
        .from("harvest-photos")
        .remove(harvest.photo_paths);

      if (removeError) {
        console.error(
          `[illustrations-complete] harvest-photos removal error for ${harvest_id}:`,
          removeError
        );
      } else {
        const removedCount = removed?.length ?? 0;
        const expectedCount = harvest.photo_paths.length;
        if (removedCount !== expectedCount) {
          console.error(
            `[illustrations-complete] harvest-photos count mismatch for ${harvest_id}: ` +
            `removed ${removedCount} vs expected ${expectedCount}`
          );
        } else {
          console.log(
            `[illustrations-complete] Deleted ${removedCount} harvest photos for ${harvest_id}`
          );
        }

        const { error: timestampError } = await supabase
          .from("harvests")
          .update({ photos_deleted_at: new Date().toISOString() })
          .eq("id", harvest_id);
        if (timestampError) {
          console.error(
            "[illustrations-complete] Failed to write photos_deleted_at:",
            timestampError
          );
        }
      }
    } catch (e) {
      console.error(
        `[illustrations-complete] harvest-photos cleanup threw for ${harvest_id}:`,
        e
      );
    }
  }

  return NextResponse.json({ status: "ok" });
}
