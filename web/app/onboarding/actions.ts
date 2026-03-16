"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { logEvent } from "@/lib/audit";

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
  // Step 3 (address)
  parentFirstName?: string;
  shippingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  // Meta
  subscriptionType?: string;
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
  const VALID_SUB_TYPES = ["founding", "gift", "one_time"];
  if (data.subscriptionType && !VALID_SUB_TYPES.includes(data.subscriptionType)) {
    return { error: "Invalid subscription type." };
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
    // New user — create family + parent
    const subType = data.subscriptionType || "founding";
    const isFounding = subType === "founding";

    const priceMap: Record<string, number> = {
      founding: 89.0,
      standard: 109.0,
      one_time: 29.0,
      gift: 89.0,
    };

    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({
        subscription_status: "active",
        subscription_type: subType,
        subscription_tier: "physical_digital",
        subscription_price: priceMap[subType] ?? 89.0,
        is_founding_member: isFounding,
        billing_cycle_start: new Date().toISOString().split("T")[0],
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
  const isOneTime = (data.subscriptionType || "founding") === "one_time";

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
      is_one_time: isOneTime,
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

  const { error: harvestError } = await admin.from("harvests").insert({
    child_id: child.id,
    quarter,
    year: now.getFullYear(),
    season: SEASONS[quarter],
    window_opens_at: now.toISOString(),
    window_closes_at: fourWeeksLater.toISOString(),
    status: "pending",
  });

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

  return { childId: child.id };
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
  if (photos.length < 8) return { error: "At least 8 photos required." };
  if (photos.length > 15) return { error: "Maximum 15 photos allowed." };

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

  redirect("/dashboard");
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
