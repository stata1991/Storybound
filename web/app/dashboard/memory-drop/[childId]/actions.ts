"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/audit";
import { dispatchPhotoValidator } from "@/lib/photo-validator";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ChildData {
  id: string;
  name: string;
  date_of_birth: string;
  default_archetype: string | null;
}

export interface HarvestData {
  id: string;
  quarter: number;
  year: number;
  season: string;
  window_opens_at: string;
  window_closes_at: string;
  submitted_at: string | null;
  status: string;
  milestone_description: string | null;
  current_interests: string[];
  character_archetype: string | null;
  notable_notes: string | null;
  photo_count: number | null;
  photo_paths: string[] | null;
}

export type ChildHarvestResult =
  | { status: "open"; child: ChildData; harvest: HarvestData }
  | { status: "submitted"; child: ChildData; harvest: HarvestData }
  | { status: "no_window"; child: ChildData | null }
  | { status: "not_found" };

/* ─── Queries ──────────────────────────────────────────────────────────────── */

export async function getChildAndHarvest(
  childId: string
): Promise<ChildHarvestResult> {
  const supabase = await createClient();

  // RLS ensures only the authenticated user's children are returned
  const { data: child } = await supabase
    .from("children")
    .select("id, name, date_of_birth, default_archetype")
    .eq("id", childId)
    .eq("active", true)
    .is("deleted_at", null)
    .single();

  if (!child) {
    return { status: "not_found" };
  }

  const now = new Date().toISOString();

  // Find harvest where window is currently open or recently submitted
  const { data: harvests } = await supabase
    .from("harvests")
    .select(
      "id, quarter, year, season, window_opens_at, window_closes_at, submitted_at, status, milestone_description, current_interests, character_archetype, notable_notes, photo_count, photo_paths"
    )
    .eq("child_id", childId)
    .lte("window_opens_at", now)
    .order("window_closes_at", { ascending: false })
    .limit(1);

  const harvest = harvests?.[0] as HarvestData | undefined;

  if (!harvest) {
    return { status: "no_window", child };
  }

  if (harvest.status === "submitted" || harvest.status === "processing" || harvest.status === "complete") {
    return { status: "submitted", child, harvest };
  }

  // Check if window is still open
  const closes = new Date(harvest.window_closes_at);
  if (new Date() > closes) {
    return { status: "no_window", child };
  }

  return { status: "open", child, harvest };
}

/* ─── Signed-URL Photo Upload ─────────────────────────────────────────────── */

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png"];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_PHOTO_COUNT = 5;
const MAX_PHOTO_COUNT = 12;

interface FileMetadata {
  name: string;
  type: string;
  size: number;
}

interface SignedUploadUrl {
  signedUrl: string;
  storagePath: string;
}

/**
 * Validates file metadata and returns per-file signed upload URLs for
 * direct browser-to-Supabase uploads of harvest photos.
 *
 * Ownership chain: user → family → child → harvest (all RLS-scoped).
 * Harvest must be in "pending" status — rejects uploads to submitted harvests.
 *
 * Cleans the harvest photo folder first so every upload session starts fresh.
 * Signed URLs are generated BEFORE cleanup so a partial URL failure doesn't
 * destroy existing photos for nothing.
 *
 * Storage path pattern: {family_id}/{child_id}/{harvest_id}/{uuid}.{ext}
 * RLS INSERT policy checks first folder segment = auth_family_id().
 */
export async function createHarvestPhotoUploadUrls(
  childId: string,
  files: FileMetadata[]
): Promise<{ error: string } | { uploads: SignedUploadUrl[] }> {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // ── Validate file metadata ───────────────────────────────────────────────
  if (!files || files.length === 0) {
    return { error: "No files provided." };
  }
  if (files.length > MAX_PHOTO_COUNT) {
    return { error: `Maximum ${MAX_PHOTO_COUNT} photos allowed.` };
  }
  for (const f of files) {
    if (!ALLOWED_PHOTO_TYPES.includes(f.type)) {
      return { error: `${f.name}: only JPEG and PNG files are accepted.` };
    }
    if (f.size > MAX_PHOTO_SIZE) {
      return { error: `${f.name} exceeds the 10 MB limit.` };
    }
    if (f.size === 0) {
      return { error: `${f.name} is empty.` };
    }
  }

  // ── Verify child ownership (RLS-scoped) ──────────────────────────────────
  const { data: child } = await supabase
    .from("children")
    .select("id, family_id")
    .eq("id", childId)
    .single();

  if (!child) return { error: "Child not found." };

  // ── Verify harvest exists, belongs to child, and is still pending ────────
  const now = new Date().toISOString();
  const { data: harvests } = await supabase
    .from("harvests")
    .select("id")
    .eq("child_id", childId)
    .eq("status", "pending")
    .lte("window_opens_at", now)
    .gte("window_closes_at", now)
    .limit(1);

  const harvest = harvests?.[0];
  if (!harvest) {
    return { error: "No open memory drop window." };
  }

  // ── Create signed upload URLs (user-scoped — RLS enforces INSERT policy) ──
  // Generated BEFORE folder cleanup so a partial failure here doesn't
  // destroy existing photos for nothing.
  const folderPath = `${child.family_id}/${childId}/${harvest.id}`;
  const uploads: SignedUploadUrl[] = [];

  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${folderPath}/${safeName}`;

    const { data, error } = await supabase.storage
      .from("harvest-photos")
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return {
        error: `Failed to prepare upload for ${f.name}: ${error?.message ?? "unknown error"}`,
      };
    }

    uploads.push({
      signedUrl: data.signedUrl,
      storagePath,
    });
  }

  // ── Clean folder (fresh slate) ───────────────────────────────────────────
  // Runs ONLY after all signed URLs succeeded. Admin client required
  // because there is no DELETE RLS policy on the harvest-photos bucket.
  // Guarded by the user-scoped ownership checks above.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: existing } = await admin.storage
    .from("harvest-photos")
    .list(folderPath, { limit: 100 });

  if (existing && existing.length > 0) {
    const toDelete = existing
      .filter((f) => f.name !== ".emptyFolderPlaceholder")
      .map((f) => `${folderPath}/${f.name}`);
    if (toDelete.length > 0) {
      await admin.storage.from("harvest-photos").remove(toDelete);
    }
  }

  return { uploads };
}

/* ─── Submit Harvest Memory ───────────────────────────────────────────────── */

interface HarvestTextFields {
  milestone: string;
  interests: string;
  character: string;
  notes: string;
}

interface HarvestPhoto {
  path: string;
  caption: string;
}

/**
 * Verifies all claimed photo paths exist in the harvest-photos bucket,
 * validates text fields, and atomically updates the harvest row with
 * all submission data. Redirects to dashboard on success.
 *
 * Ownership enforced by RLS (user-scoped client for child + harvest queries
 * and storage listing). Harvest must still be "pending" — prevents double
 * submission.
 */
export async function submitHarvestMemory(
  childId: string,
  data: { textFields: HarvestTextFields; photos: HarvestPhoto[] }
): Promise<{ error: string } | { success: true; harvestId: string }> {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // ── Verify child ownership (RLS-scoped) ──────────────────────────────────
  const { data: child } = await supabase
    .from("children")
    .select("id, family_id, default_archetype")
    .eq("id", childId)
    .single();

  if (!child) return { error: "Child not found." };

  // ── Verify harvest is still pending ──────────────────────────────────────
  const now = new Date().toISOString();
  const { data: harvests } = await supabase
    .from("harvests")
    .select("id, quarter, year")
    .eq("child_id", childId)
    .eq("status", "pending")
    .lte("window_opens_at", now)
    .gte("window_closes_at", now)
    .limit(1);

  const harvest = harvests?.[0];
  if (!harvest) {
    return { error: "No open memory drop window." };
  }

  // ── Validate photos ──────────────────────────────────────────────────────
  const { photos, textFields } = data;

  if (!photos || photos.length < MIN_PHOTO_COUNT) {
    return { error: `At least ${MIN_PHOTO_COUNT} photos are required.` };
  }
  if (photos.length > MAX_PHOTO_COUNT) {
    return { error: `Maximum ${MAX_PHOTO_COUNT} photos allowed.` };
  }

  // Validate captions
  for (const p of photos) {
    if (!p.caption.trim()) {
      return { error: "Each photo must have a caption." };
    }
    if (p.caption.length > 150) {
      return { error: "Each photo caption must be 150 characters or less." };
    }
    if (/[\n\r]/.test(p.caption)) {
      return { error: "Photo captions must not contain line breaks." };
    }
  }

  // ── Verify all claimed paths exist in storage (RLS SELECT enforces) ─────
  const folderPath = `${child.family_id}/${childId}/${harvest.id}`;
  const { data: files, error: listError } = await supabase.storage
    .from("harvest-photos")
    .list(folderPath, { limit: 100 });

  if (listError) {
    return { error: "Failed to verify uploads. Please try again." };
  }

  const existingFiles = new Set(
    (files ?? [])
      .filter((f) => f.name !== ".emptyFolderPlaceholder")
      .map((f) => `${folderPath}/${f.name}`)
  );

  const missing = photos.map((p) => p.path).filter((p) => !existingFiles.has(p));
  if (missing.length > 0) {
    return {
      error: `${missing.length} photo(s) failed to upload. Please re-upload your photos.`,
    };
  }

  // ── Validate text fields ─────────────────────────────────────────────────
  if (!textFields.milestone.trim()) {
    return { error: "Please describe this season's milestone." };
  }
  if (textFields.milestone.length > 500) {
    return { error: "Milestone description must be 500 characters or less." };
  }
  if (!textFields.interests.trim()) {
    return { error: "Please share what they're into right now." };
  }
  if (textFields.character && textFields.character.length > 100) {
    return { error: "Character must be 100 characters or less." };
  }
  if (textFields.character && /[\n\r]/.test(textFields.character)) {
    return { error: "Character must not contain line breaks." };
  }
  if (textFields.notes && textFields.notes.length > 500) {
    return { error: "Notes must be 500 characters or less." };
  }

  const parsedInterests = textFields.interests
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parsedInterests.length > 10) {
    return { error: "Maximum 10 interests allowed." };
  }
  if (parsedInterests.some((i) => i.length > 100)) {
    return { error: "Each interest must be 100 characters or less." };
  }
  if (parsedInterests.some((i) => /[\n\r]/.test(i))) {
    return { error: "Interests must not contain line breaks." };
  }

  // ── Atomic harvest UPDATE ────────────────────────────────────────────────
  const photoPaths = photos.map((p) => p.path);
  const photoCaptions = photos.map((p) => p.caption);

  const { error: updateError } = await supabase
    .from("harvests")
    .update({
      milestone_description: textFields.milestone,
      current_interests: parsedInterests,
      character_archetype: textFields.character || child.default_archetype || null,
      notable_notes: textFields.notes || null,
      photo_paths: photoPaths,
      photo_captions: photoCaptions,
      photo_count: photoPaths.length,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", harvest.id);

  if (updateError) {
    logEvent({
      event_type: "memory_drop.submit",
      status: "error",
      harvest_id: harvest.id,
      child_id: childId,
      message: "Failed to save memory drop",
    });
    return { error: "Failed to save memory. Please try again." };
  }

  logEvent({
    event_type: "memory_drop.submit",
    status: "success",
    harvest_id: harvest.id,
    child_id: childId,
    message: "Memory drop submitted (direct upload)",
    metadata: { photo_count: photoPaths.length },
  });

  // Dispatch photo validator on combined set (fire-and-forget — never blocks redirect)
  const adminForValidator = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let charFiles: { name: string }[] | null = null;
  let charListError: string | null = null;

  try {
    const result = await adminForValidator.storage
      .from("character-photos")
      .list(childId, { limit: 100 });
    charFiles = result.data;
    if (result.error) {
      charListError = result.error.message;
    }
  } catch (e) {
    charListError = e instanceof Error ? e.message : "Unknown storage error";
  }

  if (charListError) {
    logEvent({
      event_type: "memory_drop.validator_dispatch_degraded",
      status: "warn",
      harvest_id: harvest.id,
      child_id: childId,
      message: "Character photos unavailable for validation \u2014 proceeding with harvest photos only",
      metadata: { error: charListError, mode: "harvest_only" },
    });
  }

  const charPaths = (charFiles ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => `${childId}/${f.name}`);

  await dispatchPhotoValidator({
    sources: [
      { bucket: "character-photos", paths: charPaths },
      { bucket: "harvest-photos", paths: photoPaths },
    ],
    harvestId: harvest.id,
  });

  return { success: true, harvestId: harvest.id };
}

/* ─── Photo signed URLs ───────────────────────────────────────────────────── */

export async function getHarvestPhotoUrls(
  paths: string[]
): Promise<string[]> {
  if (!paths || paths.length === 0) return [];

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const urls: string[] = [];
  for (const path of paths) {
    const { data } = await admin.storage
      .from("harvest-photos")
      .createSignedUrl(path, 3600); // 1 hour
    if (data?.signedUrl) {
      urls.push(data.signedUrl);
    }
  }
  return urls;
}
