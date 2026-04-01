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
  const avoidancesList = parseCommaSeparated(data.avoidances);
  if (avoidancesList.length > 10) {
    return { error: "Maximum 10 avoidances allowed." };
  }
  if (avoidancesList.some((a) => a.length > 100)) {
    return { error: "Each avoidance must be 100 characters or less." };
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

export async function uploadCharacterPhotos(childId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in." };
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify child belongs to user's family
  const { data: parent } = await admin
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single();

  if (!parent) return { error: "Parent record not found." };

  const { data: child } = await admin
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("family_id", parent.family_id)
    .single();

  if (!child) return { error: "Child not found." };

  // Ensure bucket exists (idempotent)
  await admin.storage.createBucket("character-photos", {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  });

  const photos = formData.getAll("photos") as File[];
  if (photos.length < 5) return { error: "At least 5 photos required." };
  if (photos.length > 10) return { error: "Maximum 10 photos allowed." };

  for (const photo of photos) {
    if (!photo.size) continue;

    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${childId}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from("character-photos")
      .upload(storagePath, photo, { contentType: photo.type, upsert: false });

    if (uploadError) {
      logEvent({
        event_type: "onboarding.character_photos",
        status: "error",
        child_id: childId,
        message: `Failed to upload photo: ${uploadError.message}`,
      });
      return { error: `Failed to upload photo: ${uploadError.message}` };
    }
  }

  logEvent({
    event_type: "onboarding.character_photos",
    status: "success",
    child_id: childId,
    message: "Character photos uploaded",
    metadata: { photo_count: photos.length },
  });

  return { success: true };
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
