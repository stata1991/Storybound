"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/audit";
import { buildCoverPrompt } from "@/lib/book/cover-prompt";

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
  episodeStatus: string | null;
  printFilePath: string | null;
  childAge: number | null;
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
  children: { name: string; family_id: string; date_of_birth: string | null } | null;
  episodes: { id: string; illustration_status: string; status: string; print_file_path: string | null }[] | null;
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
  character_photos_deleted_at: string | null;
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

export async function getAdminStats(): Promise<AdminStats | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

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

export async function getAllHarvests(): Promise<
  { harvests: HarvestRow[]; shippedCount: number } | { error: string }
> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const admin = getAdmin();

  // Fetch harvests with child name, family_id, DOB, and episode info
  const [{ data: harvests }, { count: shippedRaw }] = await Promise.all([
    admin
      .from("harvests")
      .select(
        "id, season, submitted_at, photo_count, status, child_id, children(name, family_id, date_of_birth), episodes(id, illustration_status, status, print_file_path)"
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .in("status", ["printing", "shipped"]),
  ]);

  const shippedCount = shippedRaw ?? 0;

  if (!harvests || harvests.length === 0)
    return { harvests: [], shippedCount };

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

  const harvestRows = rows.map((h) => {
    const ep = h.episodes?.[0] ?? null;
    const dob = h.children?.date_of_birth ?? null;
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
      episodeStatus: ep?.status ?? null,
      printFilePath: ep?.print_file_path ?? null,
      childAge: dob ? storyChildAge(dob) : null,
    };
  });

  return { harvests: harvestRows, shippedCount };
}

/* ─── Families ─────────────────────────────────────────────────────────────── */

export async function getAllFamilies(): Promise<FamilyRow[] | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

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

  logEvent({
    event_type: "harvest.status_update",
    status: "success",
    harvest_id: harvestId,
    metadata: { old_status: harvest.status, new_status: newStatus },
  });

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

  logEvent({
    event_type: "illustration.pipeline",
    status: "started",
    harvest_id: harvestId,
    message: "Illustration pipeline started",
  });

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

  // ── Fetch child ──────────────────────────────────────────────────────────

  const { data: childRaw } = await supa
    .from("children")
    .select("id, name, interests, reading_level, character_photos_deleted_at")
    .eq("id", harvest.child_id)
    .single();

  if (!childRaw) return { error: "Child not found." };

  const child = childRaw as unknown as ChildFullDbRow;

  if (child.character_photos_deleted_at) {
    return { error: "Character photos already used and deleted for this child." };
  }

  // ── Fetch episode (optional) ─────────────────────────────────────────────

  const { data: episodeRaw } = await supa
    .from("episodes")
    .select("id, scenes")
    .eq("harvest_id", harvestId)
    .single();

  const episode = episodeRaw as unknown as EpisodeDbRow | null;

  // ── Build cover prompt from story bible hero ──────────────────────────────

  let coverPrompt: string | undefined;

  const { data: bibleRaw } = await supa
    .from("story_bibles")
    .select("hero_profile, season_arc")
    .eq("child_id", harvest.child_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (bibleRaw) {
    const hero = (bibleRaw as Record<string, unknown>).hero_profile as
      | Record<string, unknown>
      | undefined;
    const arc = (bibleRaw as Record<string, unknown>).season_arc as
      | Record<string, unknown>
      | undefined;

    const phys = hero?.physical_description as
      | Record<string, string>
      | undefined;
    const traits = hero?.personality_traits as string[] | undefined;

    const appearance = phys
      ? [phys.hair, phys.eyes, phys.skin_tone, phys.signature_look]
          .filter(Boolean)
          .join(", ")
      : "";
    const personality = traits?.join(", ") ?? "";
    const theme =
      (arc?.overarching_theme as string) ?? harvest.season ?? "adventure";

    if (appearance) {
      coverPrompt = buildCoverPrompt(appearance, personality, theme);
    }
  }

  // ── Download character photos to Buffer (never disk) ─────────────────────

  const childId = harvest.child_id;

  const { data: photoFiles, error: listErr } = await supa.storage
    .from("character-photos")
    .list(childId, { limit: 100 });

  if (listErr) {
    return { error: `Failed to list character photos: ${listErr.message}` };
  }

  const validFiles = (photoFiles ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder");

  if (validFiles.length === 0) {
    return { error: "No character photos found for this child." };
  }

  const photosBase64: string[] = [];

  for (const file of validFiles) {
    const filePath = `${childId}/${file.name}`;
    const { data: blob, error: dlErr } = await supa.storage
      .from("character-photos")
      .download(filePath);

    if (dlErr || !blob) {
      return { error: `Failed to download photo: ${dlErr?.message ?? filePath}` };
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
    logEvent({
      event_type: "illustration.pipeline",
      status: "error",
      harvest_id: harvestId,
      message: `Face training failed: ${msg}`,
    });
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
      {
        face_model_id: trainResult.face_model_id,
        prompts,
        ...(coverPrompt ? { cover_prompt: coverPrompt } : {}),
      }
    );
  } catch (e) {
    // Generation failed — still clean up LoRA weights, but keep photos for retry
    await callModal(process.env.MODAL_DELETE_URL!, {
      face_model_id: trainResult.face_model_id,
    }).catch(() => {});
    const msg = e instanceof Error ? e.message : "Unknown error";
    logEvent({
      event_type: "illustration.pipeline",
      status: "error",
      harvest_id: harvestId,
      message: `Illustration generation failed: ${msg}`,
    });
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

  // ── Delete character photos from bucket & mark child ─────────────────────

  try {
    const pathsToDelete = validFiles.map((f) => `${childId}/${f.name}`);
    await supa.storage.from("character-photos").remove(pathsToDelete);

    await supa
      .from("children")
      .update({ character_photos_deleted_at: new Date().toISOString() })
      .eq("id", childId);
  } catch (cleanupErr) {
    console.error("Character photo cleanup failed (non-blocking):", cleanupErr);
  }

  logEvent({
    event_type: "illustration.pipeline",
    status: "success",
    harvest_id: harvestId,
    child_id: childId,
    message: "Illustration pipeline completed",
    metadata: { illustration_count: illustrationPaths.length },
  });

  return { success: true };
}

/* ─── Book generation ─────────────────────────────────────────────────────── */

export async function generateBook(
  harvestId: string
): Promise<{ success: true; downloadUrl: string } | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  logEvent({
    event_type: "book.generate",
    status: "started",
    harvest_id: harvestId,
    message: "Book generation started",
  });

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
    logEvent({
      event_type: "book.generate",
      status: "error",
      harvest_id: harvestId,
      child_id: ep.child_id,
      message: `PDF generation failed: ${msg}`,
    });
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

  logEvent({
    event_type: "book.generate",
    status: "success",
    harvest_id: harvestId,
    child_id: ep.child_id,
    message: "Book generated and uploaded",
  });

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

/* ─── Age-aware story style ──────────────────────────────────────────────── */

interface StoryStyle {
  wordsPerScene: number;
  sentenceLength: string;
  vocabulary: string;
  tone: string;
  tension: string;
  emotionalArc: string;
  catchphrase: boolean;
  exampleSentence: string;
}

const STORY_STYLE: Record<string, StoryStyle> = {
  "3-4": {
    wordsPerScene: 30,
    sentenceLength: "very short — max 8 words per sentence",
    vocabulary: "only simple everyday words a toddler knows",
    tone: "warm, playful, lots of repetition and rhythm — almost sing-song",
    tension: "none — everything feels safe and cozy",
    emotionalArc: "child feels safe and loved throughout — no worry, just wonder",
    catchphrase: true,
    exampleSentence:
      'Suppu ran fast. "Vroom-vroom!" he said. The truck beeped back.',
  },
  "5-6": {
    wordsPerScene: 55,
    sentenceLength: "short to medium — max 15 words per sentence",
    vocabulary:
      "simple but expanding — can introduce 1-2 new words per scene with context clues",
    tone: "warm and encouraging, mildly adventurous, child feels capable",
    tension: "very mild — a small problem the child solves with help",
    emotionalArc: "small worry → child tries something → it works → pride",
    catchphrase: true,
    exampleSentence:
      "Suppu looked at the muddy road and thought hard. He had an idea!",
  },
  "7-8": {
    wordsPerScene: 90,
    sentenceLength:
      "medium — varied, mix of short punchy and longer descriptive",
    vocabulary:
      "age-appropriate chapter book — richer adjectives, some figurative language",
    tone: "adventurous, child is competent and takes initiative",
    tension:
      "moderate — a real problem with a non-obvious solution, child figures it out",
    emotionalArc: "real problem → failed first attempt → better idea → earns resolution",
    catchphrase: false,
    exampleSentence:
      "The mud stretched across the whole road like a brown sea. Suppu crossed his arms and thought. There had to be a way.",
  },
  "9-10": {
    wordsPerScene: 130,
    sentenceLength: "varied — short for impact, long for atmosphere",
    vocabulary:
      "early chapter book level — metaphors, some complex sentences, emotional nuance",
    tone: "the child faces a real challenge and grows through it — emotional arc matters",
    tension:
      "genuine stakes — something the child cares about is at risk before it resolves",
    emotionalArc: "genuine stakes → self-doubt moment → growth → resolution that changes something",
    catchphrase: false,
    exampleSentence:
      "Standing at the edge of the flooded road, Suppu felt the familiar knot in his stomach — the one that always showed up right before something hard.",
  },
};

const SCENE_COUNT: Record<string, number> = {
  "3-4": 6,
  "5-6": 8,
  "7-8": 10,
  "9-10": 12,
};

function getStoryStyle(age: number): { style: StoryStyle; sceneCount: number; band: string } {
  const clamped = Math.max(3, Math.min(10, age));
  let band: string;
  if (clamped <= 4) band = "3-4";
  else if (clamped <= 6) band = "5-6";
  else if (clamped <= 8) band = "7-8";
  else band = "9-10";
  return { style: STORY_STYLE[band], sceneCount: SCENE_COUNT[band], band };
}

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
  harvest: HarvestStoryDbRow,
  age: number
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
  const { style, sceneCount } = getStoryStyle(age);
  const totalWordTarget = sceneCount * style.wordsPerScene;

  // Extract hero traits from Story Bible for character consistency instruction
  const hero = storyBible.hero as Record<string, unknown> | undefined;
  const heroPhys = hero?.physical_description as Record<string, string> | undefined;
  const heroTraits = hero?.personality_traits as string[] | undefined;
  const physDesc = heroPhys
    ? `${heroPhys.hair ?? ""}, ${heroPhys.eyes ?? ""}, ${heroPhys.skin_tone ?? ""}, ${heroPhys.signature_look ?? ""}`.replace(/, ,/g, ",").replace(/^, |, $/g, "")
    : "see character block";
  const personalityDesc = heroTraits?.join(", ") ?? "see character block";

  return {
    system: `You are writing a personalized children's storybook for ${child.name}, age ${age}.

Writing style rules — follow these exactly:
- Each scene must be ${style.wordsPerScene} words or fewer
- Sentence length: ${style.sentenceLength}
- Vocabulary level: ${style.vocabulary}
- Tone: ${style.tone}
- Tension level: ${style.tension}
${style.catchphrase ? `- Give ${child.name} a short personal catchphrase they repeat at exciting moments (1 line, invented for this child based on their traits)` : "- No catchphrase needed at this age"}

Emotional arc for this age: ${style.emotionalArc}
The story must follow this arc. Do not skip the middle — the resolution only lands if the struggle is real first.

Example of the correct sentence style for this age:
"${style.exampleSentence}"

Never write above this reading level. If a sentence feels too complex, break it into two.

The child hero is ${child.name}. Physical description: ${physDesc}.
Personality: ${personalityDesc}.
Make these traits visible through actions and dialogue, not just narration.

CRITICAL: Character consistency
You are given a detailed character reference block below. Every physical description, personality trait, and speech pattern MUST match exactly. Do not invent new traits, change appearance details, or contradict the Story Bible. The illustrations will be generated from your scene descriptions, so visual accuracy is essential.

Episode rules:
- Generate exactly ${sceneCount} scenes. Each scene should advance the story. Do not pad or repeat. End with a satisfying resolution in the final scene.
- Target ~${totalWordTarget} words total (${sceneCount} scenes × ~${style.wordsPerScene} words each)
- Each scene gets one illustration prompt (separate field)
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

Remember: exactly ${sceneCount} scenes. Each illustration_prompt must describe ${child.name} using the exact physical details from the Characters block and end with [FACE REF: use reference image storybound_ref_CHILD_ID_q${episodeNumber}.png]`,
  };
}

function runStoryQualityChecks(
  episode: Record<string, unknown>,
  child: ChildStoryDbRow,
  age: number
): string[] {
  const warnings: string[] = [];
  const scenes = episode.scenes as Record<string, unknown>[] | undefined;
  const actualSceneCount = scenes?.length ?? 0;
  const { style, sceneCount: expectedSceneCount } = getStoryStyle(age);

  if (actualSceneCount < expectedSceneCount) {
    console.warn(
      `Scene count too low: expected ${expectedSceneCount}, got ${actualSceneCount} — flagging for admin review`
    );
    warnings.push(
      `REVIEW REQUIRED: Expected ${expectedSceneCount} scenes (age ${age}), got ${actualSceneCount}. Book is too short for this age band.`
    );
  } else if (actualSceneCount > expectedSceneCount) {
    warnings.push(
      `Expected ${expectedSceneCount} scenes (age ${age}), got ${actualSceneCount}.`
    );
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

    // Per-scene word count validation + trimming
    const wordLimit = style.wordsPerScene;
    const trimThreshold = Math.ceil(wordLimit * 1.2);

    for (const scene of scenes) {
      const text = (scene.text as string) ?? "";
      const words = text.trim().split(/\s+/);
      if (words.length > trimThreshold) {
        console.warn(
          `Scene ${scene.number}: ${words.length} words exceeds ${wordLimit} limit by >20% — trimming to ${wordLimit}`
        );
        warnings.push(
          `Scene ${scene.number} trimmed: ${words.length} → ${wordLimit} words.`
        );
        scene.text = words.slice(0, wordLimit).join(" ") + "\u2026";
      } else if (words.length > wordLimit) {
        warnings.push(
          `Scene ${scene.number}: ${words.length} words (limit ${wordLimit}, within 20% tolerance).`
        );
      }
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

    const totalWordTarget = expectedSceneCount * style.wordsPerScene;
    const totalWordCount = storyText.split(/\s+/).length;
    const minWords = Math.floor(totalWordTarget * 0.7);
    const maxWords = Math.ceil(totalWordTarget * 1.3);
    if (totalWordCount < minWords) {
      warnings.push(
        `Total word count ${totalWordCount} below minimum ${minWords} (target ${totalWordTarget}).`
      );
    } else if (totalWordCount > maxWords) {
      warnings.push(
        `Total word count ${totalWordCount} exceeds maximum ${maxWords} (target ${totalWordTarget}).`
      );
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

  logEvent({
    event_type: "story.generate",
    status: "started",
    harvest_id: harvestId,
    message: "Story generation started",
  });

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
      logEvent({
        event_type: "story.generate",
        status: "error",
        harvest_id: harvestId,
        message: `Story bible generation failed: ${msg}`,
      });
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

  const episodePrompt = buildEpisodePrompt(child, storyBible, harvest, age);

  let episodeResult: Record<string, unknown>;
  try {
    episodeResult = await callClaude(
      episodePrompt.system,
      episodePrompt.user
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logEvent({
      event_type: "story.generate",
      status: "error",
      harvest_id: harvestId,
      message: `Episode generation failed: ${msg}`,
    });
    return { error: `Episode generation failed: ${msg}` };
  }

  // ── Quality checks ────────────────────────────────────────────────────

  const qualityWarnings = runStoryQualityChecks(episodeResult, child, age);

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
    logEvent({
      event_type: "story.generate",
      status: "error",
      harvest_id: harvestId,
      message: `Failed to save episode: ${epInsertErr.message}`,
    });
    return { error: `Failed to save episode: ${epInsertErr.message}` };
  }

  logEvent({
    event_type: "story.generate",
    status: "success",
    harvest_id: harvestId,
    message: "Story generated",
    metadata: { quality_warnings: qualityWarnings },
  });

  return { success: true, qualityWarnings };
}

/* ─── Print flow ──────────────────────────────────────────────────────────── */

export async function getPrintDetails(
  harvestId: string
): Promise<
  | {
      childName: string;
      childAge: number | null;
      shippingAddress: string | null;
      pdfUrl: string;
    }
  | { error: string }
> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const admin = getAdmin();

  const { data: ep } = await admin
    .from("episodes")
    .select("id, child_id, print_file_path")
    .eq("harvest_id", harvestId)
    .single();

  if (!ep) return { error: "No episode found for this harvest." };
  const episode = ep as unknown as {
    id: string;
    child_id: string;
    print_file_path: string | null;
  };

  if (!episode.print_file_path) {
    return { error: "No PDF has been generated for this episode." };
  }

  const { data: childRaw } = await admin
    .from("children")
    .select("name, date_of_birth, family_id")
    .eq("id", episode.child_id)
    .single();

  if (!childRaw) return { error: "Child not found." };
  const child = childRaw as unknown as {
    name: string;
    date_of_birth: string | null;
    family_id: string;
  };

  // Fetch shipping address from family
  const { data: familyRaw } = await admin
    .from("families")
    .select(
      "shipping_name, address_line1, address_line2, city, state, zip, country"
    )
    .eq("id", child.family_id)
    .single();

  let shippingAddress: string | null = null;
  if (familyRaw) {
    const f = familyRaw as unknown as {
      shipping_name: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      country: string | null;
    };
    if (f.address_line1) {
      const parts = [
        f.shipping_name,
        f.address_line1,
        f.address_line2,
        [f.city, f.state].filter(Boolean).join(", ") +
          (f.zip ? ` ${f.zip}` : ""),
        f.country && f.country !== "US" ? f.country : null,
      ].filter(Boolean);
      shippingAddress = parts.join("\n");
    }
  }

  // Generate signed URL for PDF (24-hour expiry)
  const { data: urlData, error: urlErr } = await admin.storage
    .from("books")
    .createSignedUrl(episode.print_file_path, 86400);

  if (urlErr || !urlData?.signedUrl) {
    return { error: "Failed to generate PDF download URL." };
  }

  return {
    childName: child.name,
    childAge: child.date_of_birth ? storyChildAge(child.date_of_birth) : null,
    shippingAddress,
    pdfUrl: urlData.signedUrl,
  };
}

export async function markSentToPrint(
  harvestId: string
): Promise<{ success: true; sentAt: string } | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const admin = getAdmin();

  const { data: ep } = await admin
    .from("episodes")
    .select("id, status")
    .eq("harvest_id", harvestId)
    .single();

  if (!ep) return { error: "No episode found." };
  const episode = ep as unknown as { id: string; status: string };

  if (episode.status !== "approved") {
    return { error: `Episode status is '${episode.status}', expected 'approved'.` };
  }

  const sentAt = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("episodes")
    .update({ status: "printing" })
    .eq("id", episode.id);

  if (updateErr) {
    return { error: `Failed to update: ${updateErr.message}` };
  }

  logEvent({
    event_type: "print.sent",
    status: "success",
    harvest_id: harvestId,
    message: "Marked as sent to print",
  });

  return { success: true, sentAt };
}

export async function markShipped(
  harvestId: string
): Promise<{ success: true; shippedAt: string } | { error: string }> {
  const auth = await verifyAdmin();
  if ("error" in auth) return { error: auth.error };

  const admin = getAdmin();

  const { data: ep } = await admin
    .from("episodes")
    .select("id, child_id, status")
    .eq("harvest_id", harvestId)
    .single();

  if (!ep) return { error: "No episode found." };
  const episode = ep as unknown as {
    id: string;
    child_id: string;
    status: string;
  };

  if (episode.status !== "printing") {
    return { error: `Episode status is '${episode.status}', expected 'printing'.` };
  }

  const shippedAt = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("episodes")
    .update({ status: "shipped" })
    .eq("id", episode.id);

  if (updateErr) {
    return { error: `Failed to update: ${updateErr.message}` };
  }

  // Fetch parent email + child name for shipping notification
  const { data: childRaw } = await admin
    .from("children")
    .select("name, family_id")
    .eq("id", episode.child_id)
    .single();

  if (childRaw) {
    const child = childRaw as unknown as { name: string; family_id: string };
    const { data: parentRaw } = await admin
      .from("parents")
      .select("email")
      .eq("family_id", child.family_id)
      .single();

    if (parentRaw) {
      const parentEmail = (parentRaw as unknown as { email: string }).email;
      const { sendEmail } = await import("@/lib/email/resend");

      const NAVY = "#1B2A4A";
      const GOLD = "#C8963E";
      const CREAM = "#FDF8F0";
      const MUTED = "#8A93A6";

      await sendEmail({
        to: parentEmail,
        subject: `${child.name}\u2019s book is on its way!`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};">
<tr><td align="center" style="padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 32px 0 32px;">
  <p style="margin:0;font-size:20px;font-weight:700;color:${NAVY};font-family:Georgia,serif;">Storybound</p>
</td></tr>
<tr><td style="padding:24px 32px 32px 32px;">
  <p style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};line-height:1.4;">
    ${child.name}\u2019s story is on its way to your doorstep.
  </p>
  <p style="margin:0 0 24px 0;font-size:15px;color:#444;line-height:1.6;">
    We\u2019ve sent ${child.name}\u2019s custom illustrated book to the printer, and it\u2019s now heading your way. Expect it to arrive within 7\u201310 business days.
  </p>
  <p style="margin:0 0 24px 0;font-size:15px;color:#444;line-height:1.6;">
    Every page was crafted from the memories you shared \u2014 this is truly ${child.name}\u2019s story, and no other copy exists in the world.
  </p>
  <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://storybound.co"}/dashboard"
     style="display:inline-block;padding:14px 32px;background-color:${GOLD};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:50px;">
    View your dashboard
  </a>
</td></tr>
<tr><td style="padding:24px 32px;border-top:1px solid #E8E4DF;">
  <p style="margin:0 0 8px 0;font-size:13px;color:${MUTED};line-height:1.5;">
    Questions? Reply to this email or contact us at storybound@gmail.com
  </p>
  <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.5;">The Storybound team</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`,
      });
    }
  }

  logEvent({
    event_type: "print.shipped",
    status: "success",
    harvest_id: harvestId,
    message: "Marked as shipped, notification sent",
  });

  return { success: true, shippedAt };
}
