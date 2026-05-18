import { createClient as createAdminClient } from "@supabase/supabase-js";

/* ─── Gate constants ──────────────────────────────────────────────────────── */

export const MIN_HARD_PASS_COUNT = 5;
export const MIN_EFFECTIVE_PHOTO_COUNT = 5;

/* ─── Hard-fail code → readable string ────────────────────────────────────── */

const HARD_FAIL_LABELS: Record<string, string> = {
  multiple_faces: "multiple people in photo",
  blurry: "photo is blurry",
  no_face: "no face detected",
  embedding_failed: "couldn't extract face features",
  small_face: "face too small in frame",
};

/* ─── Gate check ──────────────────────────────────────────────────────────── */

type GateResult =
  | { allowed: true; hardPassCount: number; effectivePhotoCount: number }
  | { allowed: false; reason: string; errors: string[]; failedPaths: string[] };

/**
 * Check the most recent photo-validation run for a harvest and decide
 * whether training is allowed. Returns { allowed: true } with counts on
 * success, or { allowed: false, reason, errors } on failure.
 */
export async function checkPhotoValidationGate(
  harvestId: string
): Promise<GateResult> {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: row } = await admin
    .from("audit_log")
    .select("metadata")
    .eq("event_type", "photo_validation_run")
    .eq("harvest_id", harvestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return {
      allowed: false,
      reason:
        "Photos haven't been validated yet — wait for validation to complete and try again.",
      errors: [],
      failedPaths: [],
    };
  }

  // Defensively parse metadata
  const meta = row.metadata as Record<string, unknown> | null;
  const set = meta?.set as Record<string, unknown> | undefined;
  const perPhotoVerdicts = meta?.per_photo_verdicts as
    | Array<Record<string, unknown>>
    | undefined;

  if (!set || !Array.isArray(perPhotoVerdicts)) {
    return {
      allowed: false,
      reason: "Validation result is malformed.",
      errors: [],
      failedPaths: [],
    };
  }

  const hardPassCount = (set.hard_pass_count as number) ?? 0;
  const effectivePhotoCount = (set.effective_photo_count as number) ?? 0;
  const identityConsistency = set.identity_consistency as
    Record<string, unknown> | undefined;
  const outlierIndices = Array.isArray(identityConsistency?.outlier_indices)
    ? (identityConsistency!.outlier_indices as number[])
    : [];

  // Build per-photo error list + corresponding paths (used on any failure path)
  function buildErrors(): { errors: string[]; failedPaths: string[] } {
    const errors: string[] = [];
    const failedPaths: string[] = [];
    for (let i = 0; i < perPhotoVerdicts!.length; i++) {
      const v = perPhotoVerdicts![i];
      const hardFails = Array.isArray(v.hard_fails) ? (v.hard_fails as string[]) : [];
      if (v.verdict === "fail" || hardFails.length > 0) {
        const reasons = hardFails.map(
          (code) => HARD_FAIL_LABELS[code] ?? code
        );
        errors.push(
          `Photo ${i + 1}: ${reasons.length > 0 ? reasons.join(" and ") : "failed quality check"}`
        );
        failedPaths.push(typeof v.photo_path === "string" ? v.photo_path : "");
      }
    }
    for (const i of outlierIndices) {
      errors.push(`Photo ${i + 1}: appears to show a different person`);
      const v = perPhotoVerdicts![i];
      failedPaths.push(typeof v?.photo_path === "string" ? v.photo_path : "");
    }
    return { errors, failedPaths };
  }

  // Gate checks in priority order (most-actionable first)
  if (hardPassCount < MIN_HARD_PASS_COUNT) {
    const { errors, failedPaths } = buildErrors();
    return {
      allowed: false,
      reason: `Only ${hardPassCount} of ${MIN_HARD_PASS_COUNT} required photos passed quality check.`,
      errors,
      failedPaths,
    };
  }

  if (effectivePhotoCount < MIN_EFFECTIVE_PHOTO_COUNT) {
    const { errors, failedPaths } = buildErrors();
    return {
      allowed: false,
      reason: `Only ${effectivePhotoCount} of ${MIN_EFFECTIVE_PHOTO_COUNT} required unique photos provided.`,
      errors,
      failedPaths,
    };
  }

  if (outlierIndices.length > 0) {
    const { errors, failedPaths } = buildErrors();
    return {
      allowed: false,
      reason:
        "Some photos appear to show a different person — please make sure all photos are of the same child.",
      errors,
      failedPaths,
    };
  }

  return { allowed: true, hardPassCount, effectivePhotoCount };
}

/* ─── Dispatch helper ─────────────────────────────────────────────────────── */

export interface PhotoSource {
  bucket: string;
  paths: string[];
}

/**
 * Fire-and-forget dispatch to the Modal photo-validator pipeline.
 *
 * Generates short-lived signed URLs for each source (bucket + paths),
 * merges them into a single array, and POSTs to MODAL_VALIDATE_PHOTOS_URL.
 * Swallows errors so the calling server action always succeeds.
 *
 * The validator calls back to PHOTO_VALIDATION_COMPLETE_WEBHOOK_URL
 * when it finishes; results land in audit_log.
 */
export async function dispatchPhotoValidator({
  sources,
  harvestId,
}: {
  sources: PhotoSource[];
  harvestId: string;
}): Promise<void> {
  if (!process.env.MODAL_VALIDATE_PHOTOS_URL) return;

  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const urls: string[] = [];

    for (const source of sources) {
      if (source.paths.length === 0) continue;
      try {
        const { data: signedUrls } = await admin.storage
          .from(source.bucket)
          .createSignedUrls(source.paths, 600);

        const sourceUrls = (signedUrls ?? [])
          .map((s) => s.signedUrl)
          .filter(Boolean);

        urls.push(...sourceUrls);
      } catch (e) {
        console.error(`Photo validator: failed to sign URLs for bucket "${source.bucket}":`, e);
      }
    }

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
