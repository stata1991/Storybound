import { createClient as createAdminClient } from "@supabase/supabase-js";

interface DispatchPhotoValidatorParams {
  bucket: string;
  storagePaths: string[];
  harvestId: string;
}

/**
 * Fire-and-forget dispatch to the Modal photo-validator pipeline.
 *
 * Generates short-lived signed URLs for the given storage paths, POSTs
 * them to MODAL_VALIDATE_PHOTOS_URL, and swallows any errors so the
 * calling server action always succeeds regardless of validator outcome.
 *
 * The validator calls back to PHOTO_VALIDATION_COMPLETE_WEBHOOK_URL
 * when it finishes; results land in audit_log (log-only mode).
 */
export async function dispatchPhotoValidator({
  bucket,
  storagePaths,
  harvestId,
}: DispatchPhotoValidatorParams): Promise<void> {
  if (!process.env.MODAL_VALIDATE_PHOTOS_URL) return;

  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: signedUrls } = await admin.storage
      .from(bucket)
      .createSignedUrls(storagePaths, 600);

    const urls = (signedUrls ?? [])
      .map((s) => s.signedUrl)
      .filter(Boolean);

    if (urls.length === 0) {
      console.log("Photo validator: no signed urls generated, skipping");
      return;
    }

    console.log("Photo validator: dispatching", {
      harvest_id: harvestId,
      url_count: urls.length,
    });

    try {
      const res = await fetch(process.env.MODAL_VALIDATE_PHOTOS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.MODAL_WEBHOOK_SECRET ?? "",
        },
        body: JSON.stringify({
          urls,
          harvest_id: harvestId,
          webhook_url:
            process.env.PHOTO_VALIDATION_COMPLETE_WEBHOOK_URL ?? "",
        }),
      });
      console.log("Photo validator: dispatch response", {
        harvest_id: harvestId,
        status: res.status,
      });
    } catch (e) {
      console.error("Photo validator dispatch failed:", e);
    }
  } catch (e) {
    console.error("Photo validator dispatch error:", e);
  }
}
