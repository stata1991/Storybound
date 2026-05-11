// Load test entry point. Gated by LOADTEST_ENABLED + X-LoadTest-Secret. Remove or hard-disable after Phase 2.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function gate(request: NextRequest): boolean {
  if (process.env.LOADTEST_ENABLED !== "true") return false;
  const secret = request.headers.get("x-loadtest-secret");
  return secret === process.env.LOADTEST_SECRET;
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  if (!gate(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const {
    name,
    dateOfBirth,
    pronouns,
    readingLevel,
    interests,
    avoidances,
    defaultArchetype,
    parentFirstName,
    shippingName,
    addressLine1,
    addressLine2,
    city,
    state,
    zip,
    country,
  } = body;

  // Basic validation (mirrors actions.ts lines 50-76)
  if (!name || name.length > 50) {
    return NextResponse.json(
      { error: "Child name must be between 1 and 50 characters." },
      { status: 400 }
    );
  }

  const interestsList = parseCommaSeparated(interests || "");
  const avoidancesList = parseCommaSeparated(avoidances || "");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Check for existing parent (mirrors actions.ts lines 84-89)
  const { data: existingParent } = await admin
    .from("parents")
    .select("id, family_id")
    .eq("id", user.id)
    .single();

  let familyId: string;

  if (existingParent) {
    familyId = existingParent.family_id;

    if (addressLine1) {
      await admin
        .from("families")
        .update({
          shipping_name: shippingName,
          address_line1: addressLine1,
          address_line2: addressLine2 || null,
          city,
          state,
          zip,
          country: country || "US",
        })
        .eq("id", familyId);
    }
  } else {
    // New user — create family + parent (mirrors actions.ts lines 116-152)
    const { data: family, error: familyError } = await admin
      .from("families")
      .insert({
        subscription_status: "trialing",
        subscription_type: "none",
        subscription_tier: "physical_digital",
        shipping_name: shippingName || null,
        address_line1: addressLine1 || null,
        address_line2: addressLine2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        country: country || "US",
      })
      .select("id")
      .single();

    if (familyError || !family) {
      return NextResponse.json(
        { error: "Failed to create family" },
        { status: 500 }
      );
    }

    familyId = family.id;

    const { error: parentError } = await admin.from("parents").insert({
      id: user.id,
      family_id: familyId,
      email: user.email,
      first_name: parentFirstName || null,
    });

    if (parentError) {
      return NextResponse.json(
        { error: "Failed to create parent" },
        { status: 500 }
      );
    }
  }

  // Insert child (mirrors actions.ts lines 154-174)
  const { data: child, error: childError } = await admin
    .from("children")
    .insert({
      family_id: familyId,
      name,
      date_of_birth: dateOfBirth,
      pronouns,
      reading_level: readingLevel,
      interests: interestsList,
      avoidances: avoidancesList,
      default_archetype: defaultArchetype || null,
      is_one_time: false,
      current_year: 1,
    })
    .select("id")
    .single();

  if (childError || !child) {
    return NextResponse.json(
      { error: "Failed to create child" },
      { status: 500 }
    );
  }

  // Create harvest (mirrors actions.ts lines 176-199)
  const SEASONS: Record<number, string> = {
    1: "spring",
    2: "summer",
    3: "autumn",
    4: "birthday",
  };
  const month = new Date().getMonth();
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
    console.error(
      "Failed to create harvest (non-blocking):",
      harvestError.message
    );
  }

  // Intentionally skip admin email notification for load test runs

  return NextResponse.json({
    childId: child.id,
    harvestId: harvestRow?.id ?? null,
  });
}
