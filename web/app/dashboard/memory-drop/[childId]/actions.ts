"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { logEvent } from "@/lib/audit";

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

/* ─── Submit ───────────────────────────────────────────────────────────────── */

export async function submitMemoryDrop(
  childId: string,
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // Verify child belongs to user (RLS scoped)
  const { data: child } = await supabase
    .from("children")
    .select("id, family_id, default_archetype")
    .eq("id", childId)
    .single();

  if (!child) {
    return { error: "Child not found." };
  }

  // Get the open harvest
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

  // Service role client for storage bucket creation
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Ensure storage bucket exists (idempotent)
  await admin.storage.createBucket("harvest-photos", {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024, // 10MB per file
    allowedMimeTypes: ["image/jpeg", "image/png"],
  });

  // Upload photos
  const photos = formData.getAll("photos") as File[];
  const photoPaths: string[] = [];

  for (const photo of photos) {
    if (!photo.size) continue;

    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${child.family_id}/${childId}/${harvest.id}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from("harvest-photos")
      .upload(storagePath, photo, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Failed to upload ${photo.name}. Please try again.` };
    }

    photoPaths.push(storagePath);
  }

  if (photoPaths.length === 0) {
    return { error: "At least one photo is required." };
  }

  // Parse form fields
  const milestone = formData.get("milestone") as string;
  const interests = formData.get("interests") as string;
  const archetype = formData.get("archetype") as string;
  const notes = formData.get("notes") as string;
  const captions = formData.getAll("captions") as string[];

  // ── Input validation ────────────────────────────────────────────────────
  if (milestone && milestone.length > 500) {
    return { error: "Milestone description must be 500 characters or less." };
  }
  if (notes && notes.length > 500) {
    return { error: "Notes must be 500 characters or less." };
  }
  if (archetype && archetype.length > 100) {
    return { error: "Archetype must be 100 characters or less." };
  }
  const parsedInterests = interests
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parsedInterests.length > 10) {
    return { error: "Maximum 10 interests allowed." };
  }
  if (parsedInterests.some((i) => i.length > 100)) {
    return { error: "Each interest must be 100 characters or less." };
  }
  for (const cap of captions) {
    if (cap.length > 200) {
      return { error: "Each photo caption must be 200 characters or less." };
    }
  }

  // Update harvest record
  const { error: updateError } = await admin
    .from("harvests")
    .update({
      milestone_description: milestone,
      current_interests: parsedInterests,
      character_archetype: archetype || child.default_archetype || null,
      notable_notes: notes || null,
      photo_paths: photoPaths,
      photo_captions: captions,
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
    message: "Memory drop submitted",
    metadata: { photo_count: photoPaths.length },
  });

  redirect("/dashboard?submitted=true");
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
