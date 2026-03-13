"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface AdminStats {
  totalFamilies: number;
  activeSubscriptions: number;
  harvestsSubmitted: number;
  booksInProduction: number;
  booksShipped: number;
  giftClaimsPending: number;
}

export interface HarvestRow {
  id: string;
  childName: string;
  parentEmail: string;
  season: string;
  submittedAt: string | null;
  photoCount: number;
  status: string;
  episodeId: string | null;
  illustrationStatus: string | null;
}

export interface FamilyRow {
  id: string;
  parentName: string;
  parentEmail: string;
  childCount: number;
  subscriptionType: string;
  subscriptionStatus: string;
  createdAt: string;
}

/* ─── DB row shapes (for Supabase query results) ──────────────────────────── */

interface HarvestDbRow {
  id: string;
  season: string;
  submitted_at: string | null;
  photo_count: number | null;
  status: string;
  child_id: string;
  children: { name: string; family_id: string } | null;
  episodes: { id: string; illustration_status: string }[] | null;
}

interface HarvestFullDbRow {
  id: string;
  child_id: string;
  season: string;
  photo_paths: string[];
  status: string;
  milestone_description: string | null;
  current_interests: string[];
}

interface ChildFullDbRow {
  id: string;
  name: string;
  interests: string[];
  reading_level: string;
}

interface EpisodeDbRow {
  id: string;
  scenes: { number: number; text: string; illustration_prompt: string }[] | null;
}

interface ModalTrainResponse {
  face_model_id: string;
  steps: number;
  status: string;
}

interface ModalGenerateResponse {
  face_model_id: string;
  illustrations: { index: number; data: string; prompt: string }[];
}

interface ParentDbRow {
  family_id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

interface FamilyDbRow {
  id: string;
  subscription_type: string;
  subscription_status: string;
  created_at: string;
}

interface ChildDbRow {
  family_id: string;
}

/* ─── Admin client ─────────────────────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function verifyAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  if (user.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    return { error: "Not authorized." };
  }

  return { userId: user.id };
}

/* ─── Stats ────────────────────────────────────────────────────────────────── */

export async function getAdminStats(): Promise<AdminStats> {
  const admin = getAdmin();

  const [
    familiesRes,
    activeRes,
    harvestsRes,
    productionRes,
    shippedRes,
    giftsRes,
  ] = await Promise.all([
    admin.from("families").select("id", { count: "exact", head: true }),
    admin
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("subscription_status", "active"),
    admin
      .from("harvests")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    admin
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "printing"]),
    admin
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("status", "shipped"),
    admin
      .from("gift_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    totalFamilies: familiesRes.count ?? 0,
    activeSubscriptions: activeRes.count ?? 0,
    harvestsSubmitted: harvestsRes.count ?? 0,
    booksInProduction: productionRes.count ?? 0,
    booksShipped: shippedRes.count ?? 0,
    giftClaimsPending: giftsRes.count ?? 0,
  };
}

/* ─── Harvests ─────────────────────────────────────────────────────────────── */

export async function getAllHarvests(): Promise<HarvestRow[]> {
  const admin = getAdmin();

  // Fetch harvests with child name, family_id, and episode info
  const { data: harvests } = await admin
    .from("harvests")
    .select(
      "id, season, submitted_at, photo_count, status, child_id, children(name, family_id), episodes(id, illustration_status)"
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!harvests || harvests.length === 0) return [];

  const rows = harvests as unknown as HarvestDbRow[];

  // Collect unique family_ids to fetch parent emails
  const familyIds = Array.from(
    new Set(
      rows
        .map((h) => h.children?.family_id)
        .filter(Boolean) as string[]
    )
  );

  const { data: parents } = await admin
    .from("parents")
    .select("family_id, email")
    .in("family_id", familyIds);

  const emailByFamily: Record<string, string> = {};
  (parents as unknown as ParentDbRow[] ?? []).forEach((p) => {
    emailByFamily[p.family_id] = p.email;
  });

  return rows.map((h) => {
    const ep = h.episodes?.[0] ?? null;
    return {
      id: h.id,
      childName: h.children?.name ?? "Unknown",
      parentEmail: emailByFamily[h.children?.family_id ?? ""] ?? "\u2014",
      season: h.season,
      submittedAt: h.submitted_at,
      photoCount: h.photo_count ?? 0,
      status: h.status,
      episodeId: ep?.id ?? null,
      illustrationStatus: ep?.illustration_status ?? null,
    };
  });
}

/* ─── Families ─────────────────────────────────────────────────────────────── */

export async function getAllFamilies(): Promise<FamilyRow[]> {
  const admin = getAdmin();

  // Fetch families
  const { data: families } = await admin
    .from("families")
    .select("id, subscription_type, subscription_status, created_at")
    .order("created_at", { ascending: false });

  if (!families || families.length === 0) return [];

  const rows = families as unknown as FamilyDbRow[];
  const familyIds = rows.map((f) => f.id);

  // Fetch parents for these families
  const { data: parents } = await admin
    .from("parents")
    .select("family_id, first_name, last_name, email")
    .in("family_id", familyIds);

  // Fetch child counts per family
  const { data: children } = await admin
    .from("children")
    .select("family_id")
    .in("family_id", familyIds)
    .eq("active", true)
    .is("deleted_at", null);

  const parentByFamily: Record<
    string,
    { name: string; email: string }
  > = {};
  (parents as unknown as ParentDbRow[] ?? []).forEach((p) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "\u2014";
    parentByFamily[p.family_id] = { name, email: p.email };
  });

  const childCountByFamily: Record<string, number> = {};
  (children as unknown as ChildDbRow[] ?? []).forEach((c) => {
    childCountByFamily[c.family_id] =
      (childCountByFamily[c.family_id] ?? 0) + 1;
  });

  return rows.map((f) => ({
    id: f.id,
    parentName: parentByFamily[f.id]?.name ?? "\u2014",
    parentEmail: parentByFamily[f.id]?.email ?? "\u2014",
    childCount: childCountByFamily[f.id] ?? 0,
    subscriptionType: f.subscription_type,
    subscriptionStatus: f.subscription_status,
    createdAt: f.created_at,
  }));
}

/* ─── Update harvest status ────────────────────────────────────────────────── */

const ALLOWED_TRANSITIONS: Record<string, string> = {
  submitted: "processing",
  processing: "complete",
};

export async function updateHarvestStatus(
  harvestId: string,
  newStatus: string
): Promise<{ success: true } | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) {
    return { error: auth.error };
  }

  const admin = getAdmin();

  // Get current status
  const { data: harvest } = await admin
    .from("harvests")
    .select("status")
    .eq("id", harvestId)
    .single();

  if (!harvest) {
    return { error: "Harvest not found." };
  }

  const expectedNext = ALLOWED_TRANSITIONS[harvest.status];
  if (!expectedNext || expectedNext !== newStatus) {
    return {
      error: `Cannot transition from ${harvest.status} to ${newStatus}.`,
    };
  }

  const { error: updateError } = await admin
    .from("harvests")
    .update({ status: newStatus })
    .eq("id", harvestId);

  if (updateError) {
    return { error: "Failed to update status." };
  }

  return { success: true };
}

/* ─── Illustration pipeline ───────────────────────────────────────────────── */

// NOTE: This action takes 5-10 minutes.
// Set maxDuration = 600 in next.config.js for
// this route if deploying to Vercel Pro.
// For Phase 1, run via the CLI script for
// long-running jobs: scripts/trigger-illustration.ts

async function callModal<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MODAL_AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "No response body");
    throw new Error(`Modal returned ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function buildDefaultPrompts(
  child: ChildFullDbRow,
  harvest: HarvestFullDbRow
): string[] {
  const name = child.name;
  const interest1 = child.interests[0] ?? "exploring";
  const interest2 = child.interests[1] ?? "discovering";
  const season = harvest.season;
  const milestone = harvest.milestone_description ?? "a new adventure";

  return [
    `${name} standing at the entrance to a magical ${interest1}-themed world, eyes wide with wonder, backpack on, ready for adventure`,
    `${name} discovering a hidden path through a forest filled with glowing ${interest1} elements, reaching out to touch a shimmering leaf`,
    `${name} meeting a small, friendly companion creature for the first time, kneeling down with a gentle smile`,
    `${name} solving a puzzle involving ${interest2}, concentrating with determination, surrounded by colorful clues`,
    `${name} celebrating ${milestone}, jumping with joy in a meadow filled with ${season} flowers`,
    `${name} helping a group of forest creatures build something wonderful using ${interest1}, working together happily`,
    `${name} standing on a hilltop at golden hour, looking out over the magical world with their companion beside them`,
    `${name} returning home through a glowing portal, waving goodbye to new friends, carrying a small keepsake from the adventure`,
  ];
}

export async function triggerIllustrationPipeline(
  harvestId: string
): Promise<{ success: true } | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const supa = getAdmin();

  // ── Fetch harvest ────────────────────────────────────────────────────────

  const { data: harvestRaw } = await supa
    .from("harvests")
    .select(
      "id, child_id, season, photo_paths, status, milestone_description, current_interests"
    )
    .eq("id", harvestId)
    .single();

  if (!harvestRaw) return { error: "Harvest not found." };

  const harvest = harvestRaw as unknown as HarvestFullDbRow;

  if (harvest.status !== "processing") {
    return { error: `Harvest status is '${harvest.status}', expected 'processing'.` };
  }

  if (!harvest.photo_paths || harvest.photo_paths.length === 0) {
    return { error: "No photos on this harvest." };
  }

  // ── Fetch child ──────────────────────────────────────────────────────────

  const { data: childRaw } = await supa
    .from("children")
    .select("id, name, interests, reading_level")
    .eq("id", harvest.child_id)
    .single();

  if (!childRaw) return { error: "Child not found." };

  const child = childRaw as unknown as ChildFullDbRow;

  // ── Fetch episode (optional) ─────────────────────────────────────────────

  const { data: episodeRaw } = await supa
    .from("episodes")
    .select("id, scenes")
    .eq("harvest_id", harvestId)
    .single();

  const episode = episodeRaw as unknown as EpisodeDbRow | null;

  // ── Download photos to Buffer (never disk) ───────────────────────────────

  const photosBase64: string[] = [];

  for (const path of harvest.photo_paths) {
    const { data: blob, error: dlErr } = await supa.storage
      .from("harvest-photos")
      .download(path);

    if (dlErr || !blob) {
      return { error: `Failed to download photo: ${dlErr?.message ?? path}` };
    }

    const arrayBuf = await blob.arrayBuffer();
    photosBase64.push(Buffer.from(arrayBuf).toString("base64"));
  }

  // ── Train face model ─────────────────────────────────────────────────────

  let trainResult: ModalTrainResponse;
  try {
    trainResult = await callModal<ModalTrainResponse>(
      process.env.MODAL_TRAIN_URL!,
      { photos: photosBase64 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { error: `Face training failed: ${msg}` };
  }

  // Update harvest with face ref
  await supa
    .from("harvests")
    .update({
      face_ref_generated: true,
      face_ref_path: trainResult.face_model_id,
    })
    .eq("id", harvestId);

  // ── Build prompts ────────────────────────────────────────────────────────

  let prompts: string[];

  if (episode?.scenes && episode.scenes.length > 0) {
    prompts = episode.scenes
      .map((s) => s.illustration_prompt)
      .filter(Boolean)
      .slice(0, 8);
  } else {
    prompts = buildDefaultPrompts(child, harvest);
  }

  if (prompts.length === 0) {
    return { error: "No illustration prompts available." };
  }

  // ── Generate illustrations ───────────────────────────────────────────────

  let genResult: ModalGenerateResponse;
  try {
    genResult = await callModal<ModalGenerateResponse>(
      process.env.MODAL_GENERATE_URL!,
      { face_model_id: trainResult.face_model_id, prompts }
    );
  } catch (e) {
    // Generation failed — still clean up LoRA weights, but keep photos for retry
    await callModal(process.env.MODAL_DELETE_URL!, {
      face_model_id: trainResult.face_model_id,
    }).catch(() => {});
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { error: `Illustration generation failed: ${msg}` };
  }

  // ── Upload illustrations to Supabase Storage ─────────────────────────────

  await supa.storage.createBucket("illustrations", {
    public: false,
    allowedMimeTypes: ["image/png"],
  });

  const episodeId = episode?.id ?? "no-episode";
  const illustrationPaths: string[] = [];

  for (const ill of genResult.illustrations) {
    const pngBuffer = Buffer.from(ill.data, "base64");
    const storagePath = `${child.id}/${episodeId}/${ill.index}.png`;

    const { error: upErr } = await supa.storage
      .from("illustrations")
      .upload(storagePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (upErr) {
      return { error: `Failed to upload illustration ${ill.index}: ${upErr.message}` };
    }

    illustrationPaths.push(storagePath);
  }

  // ── Update episode ───────────────────────────────────────────────────────

  if (episode) {
    await supa
      .from("episodes")
      .update({
        illustration_paths: illustrationPaths,
        illustration_status: "review",
      })
      .eq("id", episode.id);
  }

  // ── Delete LoRA weights (constraint step 5) ──────────────────────────────

  await callModal(process.env.MODAL_DELETE_URL!, {
    face_model_id: trainResult.face_model_id,
  }).catch(() => {});

  // ── Delete source photos (constraint step 4) ─────────────────────────────

  await supa.storage.from("harvest-photos").remove(harvest.photo_paths);

  await supa
    .from("harvests")
    .update({ photos_deleted_at: new Date().toISOString() })
    .eq("id", harvestId);

  return { success: true };
}

/* ─── Book generation ─────────────────────────────────────────────────────── */

export async function generateBook(
  harvestId: string
): Promise<{ success: true; downloadUrl: string } | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const supa = getAdmin();

  // ── Fetch episode via harvest ────────────────────────────────────────────

  const { data: episodeRaw } = await supa
    .from("episodes")
    .select("id, child_id, illustration_status")
    .eq("harvest_id", harvestId)
    .single();

  if (!episodeRaw) return { error: "No episode found for this harvest." };

  const ep = episodeRaw as unknown as {
    id: string;
    child_id: string;
    illustration_status: string;
  };

  if (ep.illustration_status !== "review" && ep.illustration_status !== "approved") {
    return {
      error: `Illustration status is '${ep.illustration_status}', expected 'review' or 'approved'.`,
    };
  }

  // ── Generate PDF ─────────────────────────────────────────────────────────

  const { generateBookPDF } = await import("@/lib/book/generator");

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateBookPDF(ep.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { error: `PDF generation failed: ${msg}` };
  }

  // ── Upload PDF to Supabase Storage ───────────────────────────────────────

  await supa.storage.createBucket("books", {
    public: false,
    allowedMimeTypes: ["application/pdf"],
  });

  const storagePath = `${ep.child_id}/${ep.id}/book.pdf`;

  const { error: upErr } = await supa.storage
    .from("books")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upErr) {
    return { error: `Failed to upload PDF: ${upErr.message}` };
  }

  // ── Generate signed download URL (24h) ───────────────────────────────────

  const { data: urlData, error: urlErr } = await supa.storage
    .from("books")
    .createSignedUrl(storagePath, 86400);

  if (urlErr || !urlData?.signedUrl) {
    return { error: "PDF uploaded but failed to create download URL." };
  }

  // ── Update episode ───────────────────────────────────────────────────────

  await supa
    .from("episodes")
    .update({
      print_file_path: storagePath,
      status: "approved",
    })
    .eq("id", ep.id);

  return { success: true, downloadUrl: urlData.signedUrl };
}

/* ─── Story generation ───────────────────────────────────────────────────── */

// NOTE: This action takes 30-60 seconds (two Claude API calls).
// The story bible is the single source of truth for character
// consistency across all quarterly episodes.

const STORY_MODEL = "claude-sonnet-4-20250514";

const PROHIBITED_WORDS = [
  "spider", "spiders", "thunder", "dark", "scary",
  "monster", "monsters", "hurt", "blood", "die", "dead",
];

interface ChildStoryDbRow {
  id: string;
  name: string;
  preferred_name: string | null;
  date_of_birth: string;
  pronouns: string;
  reading_level: string;
  interests: string[];
  favorites: Record<string, string>;
  avoidances: string[];
  family_notes: string | null;
}

interface HarvestStoryDbRow {
  id: string;
  child_id: string;
  season: string;
  quarter: number;
  year: number;
  status: string;
  memory_1: string | null;
  memory_2: string | null;
  current_interests: string[];
  milestone_description: string | null;
  notable_notes: string | null;
  photo_captions: string[];
}

interface StoryBibleDbRow {
  id: string;
  child_id: string;
  year: number;
  hero_profile: Record<string, unknown> | null;
  world_profile: Record<string, unknown> | null;
  companion: Record<string, unknown> | null;
  season_arc: Record<string, unknown> | null;
  episode_outlines: Record<string, unknown>[] | null;
  status: string;
}

function storyChildAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function pronounLabel(p: string): string {
  return p.replace(/_/g, "/");
}

async function callClaude(
  system: string,
  userMessage: string,
  attempt: number = 1
): Promise<Record<string, unknown>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: STORY_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  console.log(
    `[callClaude] attempt=${attempt} raw response (first 500 chars):`,
    text.slice(0, 500)
  );

  const cleaned = text
    .replace(/^```json?\s*/, "")
    .replace(/\s*```$/, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[callClaude] JSON parse failed (attempt ${attempt}):`, msg);
    console.error(`[callClaude] Raw text:`, cleaned.slice(0, 1000));

    if (attempt < 2) {
      return callClaude(system, userMessage, attempt + 1);
    }
    throw new Error(`Claude returned invalid JSON after 2 attempts: ${msg}`);
  }
}

function buildStoryBiblePrompt(
  child: ChildStoryDbRow,
  age: number
): { system: string; user: string } {
  return {
    system: `You are a children's book author specializing in episodic adventure series for ages 3-10.
Your job is to create a Story Bible for a child's personalized quarterly storybook subscription.
The bible establishes: the child's hero identity (with detailed physical description for visual consistency), their world, recurring companions, the seasonal arc, and each episode's emotional theme.

CRITICAL: Character consistency across episodes
The Story Bible is the single source of truth for this child's character across all 4 quarterly episodes.
Every field you output — especially physical descriptions, personality traits, and supporting characters — will be injected verbatim into every future episode prompt. Be specific and detailed.

Rules:
- The child IS the hero. Not a character inspired by them. Them.
- The world is fictional. No real locations, schools, or identifiable details.
- Four episodes per year form one Season. Each episode is self-contained but threads the arc.
- Episode 4 is ALWAYS the Birthday Episode — the emotional climax of the season.
- Avoid: ${child.avoidances.length > 0 ? child.avoidances.join(", ") : "nothing specifically noted"}.
- Include: the child's actual interests, age-appropriate challenges, humor, wonder.
- Tone: warm, adventurous, imaginative. Think Studio Ghibli, not Disney action.

Output format: valid JSON only. No preamble, no markdown fences, no trailing commas, no comments. Every string value must be properly escaped.`,
    user: `Generate a Story Bible for this child:

Child profile:
- Name: ${child.name}
- Age: ${age}
- Pronouns: ${pronounLabel(child.pronouns)}
- Interests: ${child.interests.join(", ")}
- Favorite things: ${Object.entries(child.favorites ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Fears to avoid: ${child.avoidances.length > 0 ? child.avoidances.join(", ") : "none specified"}
- Reading level: ${child.reading_level.replace(/_/g, " ")}
- Family context: ${child.family_notes ?? "Not provided"}

Output this exact JSON structure:
{
  "hero": {
    "name": "${child.name}",
    "age": ${age},
    "pronouns": "${pronounLabel(child.pronouns)}",
    "physical_description": {
      "hair": "Specific hair color, length, style (e.g., 'shoulder-length curly brown hair often in two braids')",
      "eyes": "Specific eye color and expression (e.g., 'big, warm brown eyes that light up when curious')",
      "skin_tone": "Specific skin tone (e.g., 'warm olive skin with rosy cheeks')",
      "signature_look": "What they typically wear or carry (e.g., 'always wears a purple star-patterned headband and rain boots')"
    },
    "personality_traits": ["trait1", "trait2", "trait3", "trait4", "trait5"],
    "catchphrase": "A characteristic phrase or speech pattern the hero uses (e.g., 'Let's investigate!' or always says 'whoaaaaa' when amazed)",
    "problem_solving_style": "How this hero approaches challenges (e.g., 'draws pictures to work through problems, always tries the creative approach first')",
    "special_ability": "A whimsical skill tied to their interests",
    "greatest_strength": "Their core emotional strength"
  },
  "world": {
    "name": "...",
    "description": "...",
    "tone": "...",
    "key_locations": ["...", "...", "..."]
  },
  "companion": {
    "name": "...",
    "type": "...",
    "physical_description": "Detailed visual description (color, size, distinguishing features) for illustration consistency",
    "personality": "...",
    "special_role": "..."
  },
  "supporting_characters": [
    {
      "name": "...",
      "relationship": "How they relate to the hero (e.g., 'wise old turtle who guards the library')",
      "physical_description": "Detailed visual description for illustration consistency",
      "personality": "2-3 defining traits"
    }
  ],
  "season_arc": {
    "title": "...",
    "overarching_theme": "...",
    "what_the_hero_learns_this_year": "..."
  },
  "episodes": [
    {
      "number": 1,
      "season": "spring",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "setup_for_next": "..."
    },
    {
      "number": 2,
      "season": "summer",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "setup_for_next": "..."
    },
    {
      "number": 3,
      "season": "autumn",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "setup_for_next": "..."
    },
    {
      "number": 4,
      "season": "birthday",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "callback_to": ["ep1_moment", "ep2_moment", "ep3_moment"],
      "birthday_celebration_element": "..."
    }
  ]
}`,
  };
}

function buildCharacterBlock(storyBible: Record<string, unknown>): string {
  const hero = storyBible.hero as Record<string, unknown> | undefined;
  const companion = storyBible.companion as Record<string, unknown> | undefined;
  const supporting = storyBible.supporting_characters as
    | Record<string, unknown>[]
    | undefined;

  let block =
    "\n## Characters (MUST remain visually and behaviorally identical to all previous episodes)\n\n";

  if (hero) {
    const phys = hero.physical_description as
      | Record<string, string>
      | undefined;
    const traits = hero.personality_traits as string[] | undefined;

    block += `### Hero: ${hero.name ?? "Unknown"}\n`;
    if (phys) {
      block += `- Hair: ${phys.hair ?? "not specified"}\n`;
      block += `- Eyes: ${phys.eyes ?? "not specified"}\n`;
      block += `- Skin tone: ${phys.skin_tone ?? "not specified"}\n`;
      block += `- Signature look: ${phys.signature_look ?? "not specified"}\n`;
    }
    if (traits && traits.length > 0) {
      block += `- Personality traits: ${traits.join(", ")}\n`;
    }
    if (hero.catchphrase) {
      block += `- Catchphrase/speech pattern: "${hero.catchphrase}"\n`;
    }
    if (hero.problem_solving_style) {
      block += `- Problem-solving style: ${hero.problem_solving_style}\n`;
    }
    block += "\n";
  }

  if (companion) {
    block += `### Companion: ${companion.name ?? "Unknown"} (${companion.type ?? "creature"})\n`;
    if (companion.physical_description) {
      block += `- Appearance: ${companion.physical_description}\n`;
    }
    if (companion.personality) {
      block += `- Personality: ${companion.personality}\n`;
    }
    if (companion.special_role) {
      block += `- Role: ${companion.special_role}\n`;
    }
    block += "\n";
  }

  if (supporting && supporting.length > 0) {
    block += "### Supporting Characters:\n";
    for (const char of supporting) {
      block += `- ${char.name} (${char.relationship}): ${char.physical_description}. ${char.personality}\n`;
    }
    block += "\n";
  }

  return block;
}

function buildEpisodePrompt(
  child: ChildStoryDbRow,
  storyBible: Record<string, unknown>,
  harvest: HarvestStoryDbRow
): { system: string; user: string } {
  const episodeNumber = harvest.quarter;
  const isEp4 = episodeNumber === 4;
  const episodes = storyBible.episodes as
    | Record<string, unknown>[]
    | undefined;

  const ep4Section = isEp4
    ? `\nPrevious episode callbacks:
- Episode 1 moment to reference: ${(episodes?.[0])?.resolution ?? "N/A"}
- Episode 2 moment to reference: ${(episodes?.[1])?.resolution ?? "N/A"}
- Episode 3 moment to reference: ${(episodes?.[2])?.resolution ?? "N/A"}`
    : "";

  const characterBlock = buildCharacterBlock(storyBible);

  return {
    system: `You are a children's book author. You are writing one episode of a quarterly personalized storybook series.
The child is the hero. The story must feel genuinely personal, not templated.

CRITICAL: Character consistency
You are given a detailed character reference block below. Every physical description, personality trait, and speech pattern MUST match exactly. Do not invent new traits, change appearance details, or contradict the Story Bible. The illustrations will be generated from your scene descriptions, so visual accuracy is essential.

Episode rules:
- 1,200–1,800 words of story content (32-page book format)
- This is a hard minimum. If your episode is under 1,200 words, expand scene descriptions, add sensory detail, and deepen the emotional beats until you reach it. Count your words before finishing.
- Split into 8 scenes of roughly equal length
- Each scene gets one illustration prompt (separate field)
- Language matches the child's reading level: ${child.reading_level.replace(/_/g, " ")}
- Episode is self-contained (new reader can follow it)
- Episode threads the seasonal arc (existing reader feels continuity)
${isEp4 ? "- Episode 4 must reference specific moments from Episodes 1, 2, and 3" : ""}

Illustration prompt rules:
- Every illustration_prompt must describe the hero using the EXACT physical details from the character block (hair, eyes, skin tone, signature look)
- Every illustration_prompt must end with [FACE REF: use reference image storybound_ref_CHILD_ID_q${episodeNumber}.png]
- Describe the companion using their EXACT physical description from the character block
- Maintain visual consistency: same clothes, same hair, same features in every scene

Content safety:
- No violence, blood, death, or injury
- No scary darkness or isolation
- No separation from parents as a threat
- Respect all parent-specified avoidances: ${child.avoidances.length > 0 ? child.avoidances.join(", ") : "none specified"}
- Positive resolution required. Challenge is emotional, not dangerous.

Output format: valid JSON only. No preamble, no markdown fences, no trailing commas, no comments. Every string value must be properly escaped.`,
    user: `Generate Episode ${episodeNumber} for ${child.name}.
${characterBlock}
Story Bible:
${JSON.stringify(storyBible, null, 2)}

This quarter's harvest data:
- Season: ${harvest.season}
- Key memory 1: ${harvest.memory_1 ?? "Not provided"}
- Key memory 2: ${harvest.memory_2 ?? "Not provided"}
- Photo descriptions: ${harvest.photo_captions.length > 0 ? harvest.photo_captions.join("; ") : "None available"}
- Current interests (updated): ${harvest.current_interests.length > 0 ? harvest.current_interests.join(", ") : "Same as profile"}
- Anything new or notable: ${harvest.notable_notes ?? "Nothing noted"}
${ep4Section}

Output this exact JSON structure:
{
  "title": "...",
  "dedication": "A short, warm dedication line (1 sentence)",
  "scenes": [
    {
      "number": 1,
      "text": "...",
      "illustration_prompt": "..."
    }
  ],
  "final_page": "A short closing line (1-2 sentences) that hints at next episode",
  "parent_note": "A brief warm note for the parent about what this story celebrated (2-3 sentences, not printed in book)"
}

Remember: exactly 8 scenes. Each illustration_prompt must describe ${child.name} using the exact physical details from the Characters block and end with [FACE REF: use reference image storybound_ref_CHILD_ID_q${episodeNumber}.png]`,
  };
}

function runStoryQualityChecks(
  episode: Record<string, unknown>,
  child: ChildStoryDbRow
): string[] {
  const warnings: string[] = [];
  const scenes = episode.scenes as Record<string, unknown>[] | undefined;
  const sceneCount = scenes?.length ?? 0;

  if (sceneCount !== 8) {
    warnings.push(`Expected 8 scenes, got ${sceneCount}.`);
  }

  if (scenes) {
    const missingRef = scenes.filter(
      (s) => !(s.illustration_prompt as string)?.includes("[FACE REF")
    );
    if (missingRef.length > 0) {
      warnings.push(
        `[FACE REF] tag missing on scenes: ${missingRef.map((s) => s.number).join(", ")}.`
      );
    }

    const storyText = scenes
      .map((s) => (s.text as string) ?? "")
      .join(" ")
      .toLowerCase();

    const foundProhibited = PROHIBITED_WORDS.filter((w) =>
      new RegExp(`\\b${w}\\b`, "i").test(storyText)
    );
    if (foundProhibited.length > 0) {
      warnings.push(
        `Prohibited words in story text: ${foundProhibited.join(", ")}.`
      );
    }

    if (child.avoidances.length > 0) {
      const foundAvoidances = child.avoidances.filter((a) =>
        storyText.includes(a.toLowerCase())
      );
      if (foundAvoidances.length > 0) {
        warnings.push(
          `Child avoidances in story text: ${foundAvoidances.join(", ")}.`
        );
      }
    }

    if (!storyText.includes(child.name.toLowerCase())) {
      warnings.push(`Hero name "${child.name}" not found in story text.`);
    }

    const wordCount = storyText.split(/\s+/).length;
    if (wordCount < 1200) {
      warnings.push(`Word count ${wordCount} is below minimum 1200.`);
    } else if (wordCount > 1800) {
      warnings.push(`Word count ${wordCount} exceeds maximum 1800.`);
    }
  }

  if (!episode.final_page) {
    warnings.push("Missing final_page.");
  }
  if (!episode.parent_note) {
    warnings.push("Missing parent_note.");
  }

  return warnings;
}

function reconstructStoryBible(
  row: StoryBibleDbRow
): Record<string, unknown> {
  const arc = row.season_arc as Record<string, unknown> | null;
  const supportingCharacters = arc
    ? (arc.supporting_characters as Record<string, unknown>[] | undefined)
    : undefined;

  const arcClean = arc ? { ...arc } : {};
  delete arcClean.supporting_characters;

  return {
    hero: row.hero_profile ?? {},
    world: row.world_profile ?? {},
    companion: row.companion ?? {},
    supporting_characters: supportingCharacters ?? [],
    season_arc: arcClean,
    episodes: row.episode_outlines ?? [],
  };
}

export async function generateStory(
  harvestId: string
): Promise<
  { success: true; qualityWarnings: string[] } | { error: string }
> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const supa = getAdmin();

  // ── Fetch harvest ────────────────────────────────────────────────────────

  const { data: harvestRaw } = await supa
    .from("harvests")
    .select(
      "id, child_id, season, quarter, year, status, memory_1, memory_2, current_interests, milestone_description, notable_notes, photo_captions"
    )
    .eq("id", harvestId)
    .single();

  if (!harvestRaw) return { error: "Harvest not found." };

  const harvest = harvestRaw as unknown as HarvestStoryDbRow;

  if (harvest.status !== "processing") {
    return {
      error: `Harvest status is '${harvest.status}', expected 'processing'.`,
    };
  }

  // ── Check no existing episode ──────────────────────────────────────────

  const { data: existingEp } = await supa
    .from("episodes")
    .select("id")
    .eq("harvest_id", harvestId)
    .single();

  if (existingEp) {
    return { error: "An episode already exists for this harvest." };
  }

  // ── Fetch child (full profile) ─────────────────────────────────────────

  const { data: childRaw } = await supa
    .from("children")
    .select(
      "id, name, preferred_name, date_of_birth, pronouns, reading_level, interests, favorites, avoidances, family_notes"
    )
    .eq("id", harvest.child_id)
    .single();

  if (!childRaw) return { error: "Child not found." };

  const child = childRaw as unknown as ChildStoryDbRow;
  const age = storyChildAge(child.date_of_birth);

  // ── Get or generate story bible ────────────────────────────────────────

  let storyBible: Record<string, unknown>;
  let storyBibleId: string;

  const { data: bibleRaw } = await supa
    .from("story_bibles")
    .select(
      "id, child_id, year, hero_profile, world_profile, companion, season_arc, episode_outlines, status"
    )
    .eq("child_id", child.id)
    .eq("year", harvest.year)
    .single();

  if (bibleRaw) {
    const bible = bibleRaw as unknown as StoryBibleDbRow;
    storyBibleId = bible.id;
    storyBible = reconstructStoryBible(bible);
  } else {
    // No story bible — generate via Pass 1
    const biblePrompt = buildStoryBiblePrompt(child, age);

    let bibleResult: Record<string, unknown>;
    try {
      bibleResult = await callClaude(biblePrompt.system, biblePrompt.user);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { error: `Story bible generation failed: ${msg}` };
    }

    // Persist to story_bibles table
    const supportingChars = bibleResult.supporting_characters as
      | Record<string, unknown>[]
      | undefined;
    const seasonArc = bibleResult.season_arc as
      | Record<string, unknown>
      | undefined;

    const arcWithCharacters = {
      ...(seasonArc ?? {}),
      supporting_characters: supportingChars ?? [],
    };

    const episodeOutlines = bibleResult.episodes as
      | Record<string, unknown>[]
      | undefined;

    const { data: inserted, error: insertErr } = await supa
      .from("story_bibles")
      .insert({
        child_id: child.id,
        year: harvest.year,
        season_title: (seasonArc?.title as string) ?? null,
        hero_profile: bibleResult.hero ?? {},
        world_profile: bibleResult.world ?? {},
        companion: bibleResult.companion ?? {},
        season_arc: arcWithCharacters,
        episode_outlines: episodeOutlines ?? [],
        status: "draft",
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return {
        error: `Failed to save story bible: ${insertErr?.message ?? "Unknown error"}`,
      };
    }

    storyBibleId = (inserted as unknown as { id: string }).id;
    storyBible = bibleResult;
  }

  // ── Generate episode (Pass 2) ──────────────────────────────────────────

  const episodePrompt = buildEpisodePrompt(child, storyBible, harvest);

  let episodeResult: Record<string, unknown>;
  try {
    episodeResult = await callClaude(
      episodePrompt.system,
      episodePrompt.user
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { error: `Episode generation failed: ${msg}` };
  }

  // ── Quality checks ────────────────────────────────────────────────────

  const qualityWarnings = runStoryQualityChecks(episodeResult, child);

  // ── Insert episode ────────────────────────────────────────────────────

  const scenes = episodeResult.scenes as
    | Record<string, unknown>[]
    | undefined;

  const { error: epInsertErr } = await supa.from("episodes").insert({
    child_id: child.id,
    harvest_id: harvestId,
    story_bible_id: storyBibleId,
    quarter: harvest.quarter,
    year: harvest.year,
    episode_number: harvest.quarter,
    title: (episodeResult.title as string) ?? null,
    dedication: (episodeResult.dedication as string) ?? null,
    scenes: scenes ?? [],
    final_page: (episodeResult.final_page as string) ?? null,
    parent_note: (episodeResult.parent_note as string) ?? null,
    status: "draft",
  });

  if (epInsertErr) {
    return { error: `Failed to save episode: ${epInsertErr.message}` };
  }

  return { success: true, qualityWarnings };
}
