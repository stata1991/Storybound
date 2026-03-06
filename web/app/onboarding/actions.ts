"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

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

  const { error: childError } = await admin.from("children").insert({
    family_id: familyId,
    name: data.name,
    date_of_birth: data.dateOfBirth,
    pronouns: data.pronouns,
    reading_level: data.readingLevel,
    interests: parseCommaSeparated(data.interests),
    avoidances: parseCommaSeparated(data.avoidances),
    default_archetype: data.defaultArchetype || null,
    is_one_time: isOneTime,
    current_year: 1,
  });

  if (childError) {
    return { error: "Failed to save child profile. Please try again." };
  }

  redirect("/dashboard");
}

export async function addAnotherChild() {
  redirect("/onboarding?additional=true");
}
