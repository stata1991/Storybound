"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { logEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";
import { memorySubmitted } from "@/lib/email/templates";

interface ChildProfileData {
  // Step 1
  name: string;
  dateOfBirth: string;
  pronouns: string;
  readingLevel: string;
  // Step 2
  interests: string;
  avoidances: string;
  defaultArchetype: string;
  // Step 3 (address — optional, user can skip)
  parentFirstName?: string;
  shippingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveChildProfile(data: ChildProfileData) {
  // Get authenticated user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // ── Input validation ──────────────────────────────────────────────────────
  if (!data.name || data.name.length > 50) {
    return { error: "Child name must be between 1 and 50 characters." };
  }
  if (!/^[a-zA-Z\s\-]+$/.test(data.name)) {
    return { error: "Child name can only contain letters, spaces, and hyphens." };
  }
  const interestsList = parseCommaSeparated(data.interests);
  if (interestsList.length > 10) {
    return { error: "Maximum 10 interests allowed." };
  }
  if (interestsList.some((i) => i.length > 100)) {
    return { error: "Each interest must be 100 characters or less." };
  }
  if (interestsList.some((i) => /[\n\r]/.test(i))) {
    return { error: "Interests must not contain line breaks." };
  }
  const avoidancesList = parseCommaSeparated(data.avoidances);
  if (avoidancesList.length > 10) {
    return { error: "Maximum 10 avoidances allowed." };
  }
  if (avoidancesList.some((a) => a.length > 100)) {
    return { error: "Each avoidance must be 100 characters or less." };
  }
  if (avoidancesList.some((a) => /[\n\r]/.test(a))) {
    return { error: "Avoidances must not contain line breaks." };
  }
  // Service role client bypasses RLS for record creation
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check if parent record already exists (returning user adding another child)
  const { data: existingParent } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("id", user.id)
    .single();

  let familyId: string;

  if (existingParent) {
    // Existing user — reuse their family
    familyId = existingParent.family_id;

    // Update address if provided
    if (data.addressLine1) {
      const { error: addrError } = await admin
        .from("families")
        .update({
          shipping_name: data.shippingName,
          address_line1: data.addressLine1,
          address_line2: data.addressLine2 || null,
          city: data.city,
          state: data.state,
          zip: data.zip,
          country: data.country || "US",
        })
        .eq("id", familyId);

      if (addrError) {
        return { error: "Failed to update address. Please try again." };
      }
    }
  } else {
    // New user — create family + parent (free onboarding, no payment yet)
    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({
        subscription_status: "trialing",
        subscription_type: "none",
        subscription_tier: "physical_digital",
        shipping_name: data.shippingName || null,
        address_line1: data.addressLine1 || null,
        address_line2: data.addressLine2 || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        country: data.country || "US",
      })
      .select("id")
      .single();

    if (familyError || !family) {
      return { error: "Failed to create account. Please try again." };
    }

    familyId = family.id;

    // Create parent record
    const { error: parentError } = await admin.from("parents").insert({
      id: user.id,
      family_id: familyId,
      email: user.email,
      first_name: data.parentFirstName || null,
    });

    if (parentError) {
      return { error: "Failed to create profile. Please try again." };
    }
  }

  // Insert child record
  const { data: child, error: childError } = await admin
    .from("children")
    .insert({
      family_id: familyId,
      name: data.name,
      date_of_birth: data.dateOfBirth,
      pronouns: data.pronouns,
      reading_level: data.readingLevel,
      interests: interestsList,
      avoidances: avoidancesList,
      default_archetype: data.defaultArchetype || null,
      is_one_time: false,
      current_year: 1,
    })
    .select("id")
    .single();

  if (childError || !child) {
    return { error: "Failed to save child profile. Please try again." };
  }

  // Create first harvest for the current quarter
  const SEASONS: Record<number, string> = { 1: "spring", 2: "summer", 3: "autumn", 4: "birthday" };
  const month = new Date().getMonth(); // 0-indexed
  const quarter = month <= 2 ? 1 : month <= 5 ? 2 : month <= 8 ? 3 : 4;
  const now = new Date();
  const fourWeeksLater = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const { data: harvestRow, error: harvestError } = await admin
    .from("harvests")
    .insert({
      child_id: child.id,
      quarter,
      year: now.getFullYear(),
      season: SEASONS[quarter],
      window_opens_at: now.toISOString(),
      window_closes_at: fourWeeksLater.toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (harvestError) {
    console.error("Failed to create initial harvest (non-blocking):", harvestError.message);
  }

  logEvent({
    event_type: "onboarding.child_profile",
    status: "success",
    family_id: familyId,
    child_id: child.id,
    message: "Child profile created",
  });

  // Notify admin that a new harvest is ready
  if (harvestRow?.id) {
    try {
      const dob = new Date(data.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (
        today.getMonth() < dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
      ) {
        age--;
      }

      const adminEmail = process.env.ADMIN_EMAIL ?? "tatasupreeth@gmail.com";
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/harvest/${harvestRow.id}`;

      await sendEmail({
        to: adminEmail,
        subject: `New harvest ready — ${data.name}, Age ${age}`,
        html: `
          <p>A new child has completed onboarding and is ready for illustration generation.</p>
          <p><strong>Child:</strong> ${data.name}<br/>
          <strong>Age:</strong> ${age}<br/>
          <strong>Harvest ID:</strong> ${harvestRow.id}</p>
          <p><a href="${dashboardUrl}">View in Admin Dashboard</a></p>
        `,
      });
    } catch {
      // Non-blocking — don't let email failure break onboarding
    }
  }

  return { childId: child.id, harvestId: harvestRow?.id ?? null };
}

export async function addAnotherChild() {
  redirect("/onboarding?additional=true");
}

/* ─── Signed-URL Photo Upload ─────────────────────────────────────────────── */

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png"];
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PHOTO_COUNT = 10;
const MIN_PHOTO_COUNT = 5;

interface FileMetadata {
  name: string;
  type: string;
  size: number;
}

interface SignedUploadUrl {
  signedUrl: string;
  storagePath: string;
  token: string;
}

/**
 * Validates file metadata and returns per-file signed upload URLs for
 * direct browser-to-Supabase uploads.
 *
 * Ownership is enforced by RLS (user-scoped client queries children table
 * and creates signed URLs — both gated by auth_family_id()).
 *
 * Cleans the folder first so every upload session starts from a fresh slate.
 * This means retries don't accumulate stale files, and confirmCharacterPhotosUploaded
 * can trust that any files present were uploaded in this session.
 *
 * Tradeoff: if the client crashes after create (folder cleaned) but before
 * any uploads complete, previous photos are lost. Acceptable v1 — user retries.
 */
export async function createCharacterPhotoUploadUrls(
  childId: string,
  files: FileMetadata[]
): Promise<{ error: string } | { urls: SignedUploadUrl[] }> {
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

  // ── Verify child ownership (RLS-scoped — only returns children in user's family) ──
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .single();

  if (!child) return { error: "Child not found." };

  // ── Create signed upload URLs (user-scoped — RLS enforces INSERT policy) ──
  // Generated BEFORE folder cleanup so a partial failure here doesn't
  // destroy existing photos for nothing.
  const urls: SignedUploadUrl[] = [];

  for (const f of files) {
    const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${childId}/${safeName}`;

    const { data, error } = await supabase.storage
      .from("character-photos")
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return {
        error: `Failed to prepare upload for ${f.name}: ${error?.message ?? "unknown error"}`,
      };
    }

    urls.push({
      signedUrl: data.signedUrl,
      storagePath,
      token: data.token,
    });
  }

  // ── Clean folder (fresh slate) ───────────────────────────────────────────
  // Runs ONLY after all signed URLs succeeded. Admin client required
  // because there is no DELETE RLS policy on the character-photos bucket.
  // Guarded by the user-scoped ownership check above — no path reaches
  // here without passing RLS on the children table first.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: existing } = await admin.storage
    .from("character-photos")
    .list(childId, { limit: 100 });

  if (existing && existing.length > 0) {
    const toDelete = existing
      .filter((f) => f.name !== ".emptyFolderPlaceholder")
      .map((f) => `${childId}/${f.name}`);
    if (toDelete.length > 0) {
      await admin.storage.from("character-photos").remove(toDelete);
    }
  }

  return { urls };
}

/**
 * Verifies that all claimed storage paths actually exist in the
 * character-photos bucket, enforces min/max photo count, and logs
 * the audit event. Call this after all browser uploads complete.
 *
 * Because createCharacterPhotoUploadUrls cleans the folder first,
 * any files present at confirm-time must be from this upload session.
 * Ownership is enforced by RLS (user-scoped client for child query
 * and storage listing).
 */
export async function confirmCharacterPhotosUploaded(
  childId: string,
  storagePaths: string[]
): Promise<{ error: string } | { success: true; count: number }> {
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
    .select("id")
    .eq("id", childId)
    .single();

  if (!child) return { error: "Child not found." };

  // ── List bucket folder and verify uploads (RLS SELECT policy enforces) ──
  const { data: files, error: listError } = await supabase.storage
    .from("character-photos")
    .list(childId, { limit: 100 });

  if (listError) {
    return { error: "Failed to verify uploads. Please try again." };
  }

  const existingFiles = new Set(
    (files ?? [])
      .filter((f) => f.name !== ".emptyFolderPlaceholder")
      .map((f) => `${childId}/${f.name}`)
  );

  const missing = storagePaths.filter((p) => !existingFiles.has(p));
  if (missing.length > 0) {
    return {
      error: `${missing.length} photo(s) failed to upload. Please retry the failed uploads.`,
    };
  }

  // ── Enforce photo count bounds ───────────────────────────────────────────
  if (existingFiles.size < MIN_PHOTO_COUNT) {
    return {
      error: `At least ${MIN_PHOTO_COUNT} photos are required. ${existingFiles.size} found.`,
    };
  }
  if (existingFiles.size > MAX_PHOTO_COUNT) {
    return {
      error: `Maximum ${MAX_PHOTO_COUNT} photos allowed. ${existingFiles.size} found.`,
    };
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  logEvent({
    event_type: "onboarding.character_photos",
    status: "success",
    child_id: childId,
    message: "Character photos uploaded (direct)",
    metadata: { photo_count: storagePaths.length, total_in_bucket: existingFiles.size },
  });

  // ── Dispatch photo validator ──────────────────────────────────────────────
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: harvest } = await admin
      .from("harvests")
      .select("id, status")
      .eq("child_id", childId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("Photo validator: harvest lookup result", {
      childId,
      found: !!harvest,
      harvest_id: harvest?.id,
      harvest_status: harvest?.status,
      env_set: !!process.env.MODAL_VALIDATE_PHOTOS_URL,
    });

    if (harvest && process.env.MODAL_VALIDATE_PHOTOS_URL) {
      const { data: signedUrls } = await admin.storage
        .from("character-photos")
        .createSignedUrls(storagePaths, 600);

      const urls = (signedUrls ?? [])
        .map((s) => s.signedUrl)
        .filter(Boolean);

      if (urls.length > 0) {
        console.log("Photo validator: dispatching", {
          harvest_id: harvest.id,
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
              harvest_id: harvest.id,
              webhook_url:
                process.env.PHOTO_VALIDATION_COMPLETE_WEBHOOK_URL ?? "",
            }),
          });
          console.log("Photo validator: dispatch response", {
            harvest_id: harvest.id,
            status: res.status,
          });
        } catch (e) {
          console.error("Photo validator dispatch failed:", e);
        }
      } else {
        console.log("Photo validator: no signed urls generated, skipping");
      }
    }
  } catch (e) {
    console.error("Photo validator dispatch error:", e);
  }

  return { success: true, count: storagePaths.length };
}

export async function getChildForCharacterPhotos(
  childId: string
): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: parent } = await admin
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single();

  if (!parent) return null;

  const { data: child } = await admin
    .from("children")
    .select("id, name")
    .eq("id", childId)
    .eq("family_id", parent.family_id)
    .single();

  return child as { id: string; name: string } | null;
}

export async function submitOnboardingMemoryDrop(
  childId: string,
  data: {
    milestone: string;
    notes: string;
    photos?: { path: string; caption: string }[];
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // Validate inputs
  if (!data.milestone || data.milestone.length > 500) {
    return { error: "Milestone is required (max 500 characters)." };
  }
  if (data.notes && data.notes.length > 1000) {
    return { error: "Notes must be 1000 characters or less." };
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify child belongs to user's family
  const { data: parent } = await admin
    .from("parents")
    .select("family_id, email")
    .eq("id", user.id)
    .single();

  if (!parent) return { error: "Parent record not found." };

  const { data: child } = await admin
    .from("children")
    .select("id, name, family_id, interests")
    .eq("id", childId)
    .eq("family_id", parent.family_id)
    .single();

  if (!child) return { error: "Child not found." };

  // Find the pending harvest created during onboarding
  const { data: harvest, error: harvestError } = await admin
    .from("harvests")
    .select("id, season")
    .eq("child_id", childId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (harvestError || !harvest) {
    return { error: "No pending memory drop found." };
  }

  // Auto-populate current_interests from child profile (set at onboarding Step 2)
  const profileInterests: string[] = Array.isArray(child.interests) ? child.interests : [];

  // Belt-and-suspenders: include photos if the component passed them
  const updatePayload: Record<string, unknown> = {
    milestone_description: data.milestone,
    current_interests: profileInterests,
    notable_notes: data.notes || null,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  };

  if (data.photos && data.photos.length > 0) {
    updatePayload.photo_paths = data.photos.map((p) => p.path);
    updatePayload.photo_captions = data.photos.map((p) => p.caption);
    updatePayload.photo_count = data.photos.length;
  }

  const { error: updateError } = await admin
    .from("harvests")
    .update(updatePayload)
    .eq("id", harvest.id);

  if (updateError) {
    return { error: "Failed to save memory drop. Please try again." };
  }

  logEvent({
    event_type: "onboarding.memory_drop",
    status: "success",
    family_id: parent.family_id,
    child_id: childId,
    message: "Onboarding memory drop submitted",
  });

  // Fire-and-forget email
  const { subject, html } = memorySubmitted({
    childName: child.name,
    season: harvest.season,
  });
  sendEmail({ to: parent.email, subject, html }).catch((err) => console.error('[email] memory submitted:', err));

  return { success: true };
}

/* ─── Additional-child detection ───────────────────────────────────────────── */

/**
 * Determine whether `childId` belongs to a family with more than one child.
 * Used by the character-photos and memory-drop routes to choose the correct
 * progress-indicator labels (5-step normal vs 4-step additional).
 */
export async function isAdditionalChild(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: parent } = await admin
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single();

  if (!parent) return false;

  const { count } = await admin
    .from("children")
    .select("id", { count: "exact", head: true })
    .eq("family_id", parent.family_id)
    .is("deleted_at", null)
    .eq("active", true);

  return (count ?? 0) > 1;
}

/* ─── Draft persistence ────────────────────────────────────────────────────── */

/**
 * Shape of the JSON blob stored in onboarding_drafts.data.
 * Steps 1–3 form fields live under `form`, memory-drop text under `memoryDrop`.
 */
export interface OnboardingDraftData {
  step: number;
  isAdditional: boolean;
  form: {
    name: string;
    dateOfBirth: string;
    pronouns: string;
    readingLevel: string;
    interests: string;
    avoidances: string;
    defaultArchetype: string;
    parentFirstName: string;
    shippingName: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  memoryDrop: {
    milestone: string;
    notes: string;
  };
}

/**
 * Load the current user's onboarding draft (if any).
 * Returns null if no draft exists or user is unauthenticated.
 */
export async function loadDraft(): Promise<{
  data: OnboardingDraftData;
  childId: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: draft } = await admin
    .from("onboarding_drafts")
    .select("data, child_id")
    .eq("user_id", user.id)
    .single();

  if (!draft) return null;

  return {
    data: draft.data as unknown as OnboardingDraftData,
    childId: draft.child_id,
  };
}

/**
 * Upsert the user's onboarding draft.
 * Called on debounced input changes and on step transitions.
 * Uses service-role client because new users don't have a parents row yet
 * (auth_family_id() returns null), so RLS select/update would fail.
 */
export async function saveDraft(
  data: OnboardingDraftData,
  childId: string | null
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await admin.from("onboarding_drafts").upsert(
    {
      user_id: user.id,
      child_id: childId,
      data: data as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: "Failed to save draft." };
  return { success: true };
}

/**
 * Delete the user's onboarding draft.
 * Called after saveChildProfile + submitOnboardingMemoryDrop complete
 * (i.e., onboarding is fully done).
 */
export async function deleteDraft(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  await admin.from("onboarding_drafts").delete().eq("user_id", user.id);
}

/**
 * Detect where an authenticated user should resume onboarding.
 * Priority order:
 *  1. Most-recently-created child with no character photos → character-photos route
 *  2. Most-recently-created child with photos but unsubmitted harvest → memory-drop route
 *  3. Draft exists (no child row yet, or child_id stale-cleaned) → load draft into wizard
 *  4. Nothing → fresh start
 */
export async function detectOnboardingResume(): Promise<
  | { redirect: "character-photos"; childId: string }
  | { redirect: "memory-drop"; childId: string }
  | { redirect: "draft"; data: OnboardingDraftData; childId: string | null }
  | { redirect: "fresh" }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { redirect: "fresh" };

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check for parent → family → children
  const { data: parent } = await admin
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single();

  if (parent) {
    // Most-recently-created child first — so multi-child families resume
    // the newest incomplete child, not an arbitrary one.
    const { data: children } = await admin
      .from("children")
      .select("id, character_photos_deleted_at")
      .eq("family_id", parent.family_id)
      .is("deleted_at", null)
      .eq("active", true)
      .order("created_at", { ascending: false });

    if (children && children.length > 0) {
      for (const child of children) {
        // Check if child has character photos in bucket
        const { data: photos } = await admin.storage
          .from("character-photos")
          .list(child.id, { limit: 1 });

        const hasPhotos =
          photos &&
          photos.filter((f) => f.name !== ".emptyFolderPlaceholder").length > 0;

        // Photos already deleted post-training means this child is done with photos
        if (!hasPhotos && !child.character_photos_deleted_at) {
          return { redirect: "character-photos", childId: child.id };
        }

        // Check for unsubmitted harvest
        const { data: harvests } = await admin
          .from("harvests")
          .select("id, status")
          .eq("child_id", child.id)
          .eq("status", "pending")
          .limit(1);

        if (harvests && harvests.length > 0) {
          return { redirect: "memory-drop", childId: child.id };
        }
      }
    }
  }

  // Check for draft — clean up stale drafts before returning them
  const draft = await loadDraft();
  if (draft && draft.childId) {
    // If draft points to a soft-deleted child, discard it
    const { data: draftChild } = await admin
      .from("children")
      .select("id, deleted_at")
      .eq("id", draft.childId)
      .single();

    if (!draftChild || draftChild.deleted_at) {
      await admin.from("onboarding_drafts").delete().eq("user_id", user.id);
      return { redirect: "fresh" };
    }

    // If draft's child already has a submitted harvest, onboarding is done
    const { data: submittedHarvest } = await admin
      .from("harvests")
      .select("id")
      .eq("child_id", draft.childId)
      .eq("status", "submitted")
      .limit(1)
      .single();

    if (submittedHarvest) {
      await admin.from("onboarding_drafts").delete().eq("user_id", user.id);
      return { redirect: "fresh" };
    }
  }

  if (draft) {
    return { redirect: "draft", data: draft.data, childId: draft.childId };
  }

  return { redirect: "fresh" };
}
