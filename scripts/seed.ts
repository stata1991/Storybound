import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

// Service role client bypasses RLS
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── IDs ────────────────────────────────────────────────────────────────────

const FAMILY_ID = "a1b2c3d4-0000-0000-0000-000000000001";
const PARENT_ID = "b2c3d4e5-0000-0000-0000-000000000001";
const CHILD_ARIA_ID = "c3d4e5f6-0000-0000-0000-000000000001";
const CHILD_LEO_ID = "c3d4e5f6-0000-0000-0000-000000000002";
const HARVEST_ARIA_ID = "d4e5f6a7-0000-0000-0000-000000000001";
const HARVEST_LEO_ID = "d4e5f6a7-0000-0000-0000-000000000002";
const GIFT_CLAIM_ID = "e5f6a7b8-0000-0000-0000-000000000001";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function upsert(table: string, data: Record<string, unknown>) {
  const { data: result, error } = await supabase
    .from(table)
    .upsert(data, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    // If it's a unique constraint violation on non-id column, record already exists
    if (error.code === "23505") {
      console.log(`  [SKIP] ${table} — already exists (${data.id})`);
      return;
    }
    console.error(`  [FAIL] ${table}:`, error.message);
    return;
  }

  console.log(`  [OK]   ${table} — ${result.id}`);
}

// ─── Seed ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nSeeding Storybound database...\n");

  // 1. Family
  console.log("1. Family");
  await upsert("families", {
    id: FAMILY_ID,
    stripe_customer_id: "cus_test_founding_001",
    subscription_status: "active",
    subscription_type: "founding",
    subscription_tier: "physical_digital",
    subscription_price: 89.0,
    is_founding_member: true,
    billing_cycle_start: "2026-03-01",
    referral_code: "STORY-FOUNDING-001",
  });

  // 2. Parent
  // Note: In production, this ID must match an auth.users row.
  // The service role key bypasses the FK check via RLS,
  // but the FK to auth.users still applies at the DB level.
  // If this fails, the parent record can't be seeded without
  // a matching auth user — we'll log and continue.
  console.log("2. Parent");
  await upsert("parents", {
    id: PARENT_ID,
    family_id: FAMILY_ID,
    email: "testparent@storybound.dev",
    first_name: "Jordan",
    last_name: "Tester",
    timezone: "America/Los_Angeles",
  });

  // 3. Children
  console.log("3. Children");
  await upsert("children", {
    id: CHILD_ARIA_ID,
    family_id: FAMILY_ID,
    name: "Aria",
    date_of_birth: "2021-04-15",
    pronouns: "she_her",
    reading_level: "early_reader",
    interests: ["dinosaurs", "painting", "her cat Whiskers"],
    favorites: { color: "purple", food: "mac and cheese", animal: "cat" },
    avoidances: ["spiders", "loud thunder"],
    family_notes:
      "Lives with mom and dad. Has a cat named Whiskers. Starting kindergarten this fall. Very imaginative.",
    default_archetype: "Dinosaur",
    is_one_time: false,
    current_year: 1,
  });

  await upsert("children", {
    id: CHILD_LEO_ID,
    family_id: FAMILY_ID,
    name: "Leo",
    date_of_birth: "2019-08-22",
    pronouns: "he_him",
    reading_level: "early_reader",
    interests: ["space", "building things", "swimming"],
    favorites: { color: "blue", food: "pizza", animal: "dolphin" },
    avoidances: ["getting lost", "scary monsters"],
    family_notes:
      "Lives with mom and stepdad. Has a baby sister. Loves asking why questions. Recently visited a science museum.",
    default_archetype: "Astronaut",
    is_one_time: false,
    current_year: 1,
  });

  // 4. Harvests
  console.log("4. Harvests");
  await upsert("harvests", {
    id: HARVEST_ARIA_ID,
    child_id: CHILD_ARIA_ID,
    quarter: 2,
    year: 2026,
    season: "summer",
    window_opens_at: "2026-04-15T00:00:00Z",
    window_closes_at: "2026-05-10T00:00:00Z",
    status: "pending",
  });

  await upsert("harvests", {
    id: HARVEST_LEO_ID,
    child_id: CHILD_LEO_ID,
    quarter: 1,
    year: 2026,
    season: "spring",
    window_opens_at: "2026-01-15T00:00:00Z",
    window_closes_at: "2026-02-10T00:00:00Z",
    status: "pending",
  });

  // 5. Gift claim
  console.log("5. Gift claim");
  await upsert("gift_claims", {
    id: GIFT_CLAIM_ID,
    family_id: FAMILY_ID,
    recipient_email: "grandma@example.com",
    status: "pending",
  });

  console.log("\nSeed complete.\n");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message ?? err);
  process.exit(1);
});
