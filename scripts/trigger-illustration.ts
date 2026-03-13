/**
 * Storybound — Illustration Pipeline Trigger (CLI)
 *
 * Usage: npx tsx scripts/trigger-illustration.ts --harvest-id <uuid>
 *
 * Runs the full illustration pipeline for a harvest:
 *   a. Fetch harvest + child + episode from Supabase
 *   b. Download photos from Supabase Storage to Buffer
 *   c. Base64 encode photos
 *   d. POST to Modal train_face_model → face_model_id
 *   e. Get illustration prompts (episode scenes or defaults)
 *   f. POST to Modal generate_illustrations → illustrations
 *   g. Decode + upload PNGs to Supabase Storage
 *   h. Update episode record
 *   i. Delete LoRA weights (constraint step 5)
 *   j. Delete source photos (constraint step 4)
 *   k. Update harvest: photos_deleted_at
 *   l. Log completion with timing
 *
 * Privacy: Photos exist only as Buffers in memory.
 * Never written to disk on the Node.js side.
 */

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import "dotenv/config";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MODAL_TRAIN_URL = process.env.MODAL_TRAIN_URL!;
const MODAL_GENERATE_URL = process.env.MODAL_GENERATE_URL!;
const MODAL_DELETE_URL = process.env.MODAL_DELETE_URL!;
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN!;

const admin = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface HarvestRecord {
  id: string;
  child_id: string;
  season: string;
  quarter: number;
  year: number;
  photo_paths: string[];
  photo_count: number;
  status: string;
  milestone_description: string | null;
  current_interests: string[];
  notable_notes: string | null;
}

interface ChildRecord {
  id: string;
  name: string;
  interests: string[];
  reading_level: string;
  date_of_birth: string;
  pronouns: string;
}

interface EpisodeRecord {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsed(start: number): string {
  const sec = ((Date.now() - start) / 1000).toFixed(1);
  return `${sec}s`;
}

function log(msg: string, start?: number) {
  const ts = start ? ` (${elapsed(start)})` : "";
  console.log(`  ${msg}${ts}`);
}

async function callModal<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "No response body");
    throw new Error(`Modal ${url} returned ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function buildDefaultPrompts(child: ChildRecord, harvest: HarvestRecord): string[] {
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

// ─── Main pipeline ───────────────────────────────────────────────────────────

async function run(harvestId: string) {
  const pipelineStart = Date.now();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  STORYBOUND ILLUSTRATION PIPELINE`);
  console.log(`  Harvest: ${harvestId}`);
  console.log(`${"═".repeat(60)}`);

  // ── (a) Fetch harvest + child + episode ──────────────────────────────────

  log("Fetching harvest...");
  const { data: harvest, error: harvestErr } = await admin
    .from("harvests")
    .select(
      "id, child_id, season, quarter, year, photo_paths, photo_count, status, milestone_description, current_interests, notable_notes"
    )
    .eq("id", harvestId)
    .single();

  if (harvestErr || !harvest) {
    throw new Error(`Harvest not found: ${harvestErr?.message ?? "no data"}`);
  }

  const h = harvest as unknown as HarvestRecord;

  if (h.status !== "processing") {
    throw new Error(`Harvest status is '${h.status}', expected 'processing'. Mark as processing first.`);
  }

  if (!h.photo_paths || h.photo_paths.length === 0) {
    throw new Error("No photo_paths on harvest — nothing to process.");
  }

  log(`Fetching child ${h.child_id}...`);
  const { data: child } = await admin
    .from("children")
    .select("id, name, interests, reading_level, date_of_birth, pronouns")
    .eq("id", h.child_id)
    .single();

  if (!child) throw new Error("Child not found.");
  const c = child as unknown as ChildRecord;

  log(`Fetching episode for harvest...`);
  const { data: episode } = await admin
    .from("episodes")
    .select("id, scenes")
    .eq("harvest_id", harvestId)
    .single();

  const ep = episode as unknown as EpisodeRecord | null;

  log(`Child: ${c.name} | Season: ${h.season} | Photos: ${h.photo_paths.length}`);
  if (ep) log(`Episode: ${ep.id}`);
  else log("No episode found — will generate default prompts.");

  // ── (b) Download photos from Supabase Storage to Buffer ──────────────────

  log("Downloading photos from storage (to memory only)...");
  const stepBStart = Date.now();

  const photoBuffers: Buffer[] = [];

  for (const path of h.photo_paths) {
    const { data: blob, error: dlErr } = await admin.storage
      .from("harvest-photos")
      .download(path);

    if (dlErr || !blob) {
      throw new Error(`Failed to download photo ${path}: ${dlErr?.message ?? "no data"}`);
    }

    const arrayBuf = await blob.arrayBuffer();
    photoBuffers.push(Buffer.from(arrayBuf));
  }

  log(`Downloaded ${photoBuffers.length} photos`, stepBStart);

  // ── (c) Base64 encode photos ─────────────────────────────────────────────

  const photosBase64 = photoBuffers.map((buf) => buf.toString("base64"));

  // ── (d) POST to Modal train_face_model ───────────────────────────────────

  log("Training face model on Modal (this may take ~5 minutes)...");
  const stepDStart = Date.now();

  const trainResult = await callModal<ModalTrainResponse>(MODAL_TRAIN_URL, {
    photos: photosBase64,
  });

  log(`Face model trained: ${trainResult.face_model_id} (${trainResult.steps} steps)`, stepDStart);

  // Update harvest with face ref
  await admin
    .from("harvests")
    .update({
      face_ref_generated: true,
      face_ref_path: trainResult.face_model_id,
    })
    .eq("id", harvestId);

  // ── (e) Get illustration prompts ─────────────────────────────────────────

  let prompts: string[];

  if (ep?.scenes && ep.scenes.length > 0) {
    prompts = ep.scenes
      .map((s) => s.illustration_prompt)
      .filter(Boolean)
      .slice(0, 8);
    log(`Using ${prompts.length} prompts from episode scenes.`);
  } else {
    prompts = buildDefaultPrompts(c, h);
    log(`Generated ${prompts.length} default prompts from child profile.`);
  }

  if (prompts.length === 0) {
    throw new Error("No illustration prompts available.");
  }

  // ── (f) POST to Modal generate_illustrations ─────────────────────────────

  log(`Generating ${prompts.length} illustrations on Modal...`);
  const stepFStart = Date.now();

  const genResult = await callModal<ModalGenerateResponse>(MODAL_GENERATE_URL, {
    face_model_id: trainResult.face_model_id,
    prompts,
  });

  log(`Generated ${genResult.illustrations.length} illustrations`, stepFStart);

  // ── (g+h) Decode + upload PNGs to Supabase Storage ──────────────────────

  log("Uploading illustrations to storage...");
  const stepHStart = Date.now();

  // Ensure bucket exists (idempotent)
  await admin.storage.createBucket("illustrations", {
    public: false,
    allowedMimeTypes: ["image/png"],
  });

  const episodeId = ep?.id ?? "no-episode";
  const illustrationPaths: string[] = [];

  for (const ill of genResult.illustrations) {
    const pngBuffer = Buffer.from(ill.data, "base64");
    const storagePath = `${c.id}/${episodeId}/${ill.index}.png`;

    const { error: upErr } = await admin.storage
      .from("illustrations")
      .upload(storagePath, pngBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (upErr) {
      throw new Error(`Failed to upload illustration ${ill.index}: ${upErr.message}`);
    }

    illustrationPaths.push(storagePath);
  }

  log(`Uploaded ${illustrationPaths.length} illustrations`, stepHStart);

  // ── (i) Update episode record ────────────────────────────────────────────

  if (ep) {
    await admin
      .from("episodes")
      .update({
        illustration_paths: illustrationPaths,
        illustration_status: "review",
      })
      .eq("id", ep.id);

    log("Episode updated: illustration_status = 'review'");
  } else {
    log("No episode to update (illustrations stored, link manually).");
  }

  // ── (j) POST to Modal delete_face_model (LoRA cleanup) ──────────────────
  // Constraint step 5: Book generation complete → LoRA weights deleted

  log("Deleting LoRA weights from Modal...");
  const deleteResult = await callModal<{ deleted: boolean }>(MODAL_DELETE_URL, {
    face_model_id: trainResult.face_model_id,
  });

  log(`LoRA cleanup: deleted=${deleteResult.deleted}`);

  // ── (k) Delete source photos from Supabase Storage ──────────────────────
  // Constraint step 4: source photos deleted from Supabase Storage

  log("Deleting source photos from storage...");
  const { error: removeErr } = await admin.storage
    .from("harvest-photos")
    .remove(h.photo_paths);

  if (removeErr) {
    console.warn(`  WARNING: Photo deletion failed: ${removeErr.message}`);
    console.warn("  Photos must be deleted manually within 2 hours.");
  } else {
    log(`Deleted ${h.photo_paths.length} source photos.`);
  }

  // ── (l) Update harvest: photos_deleted_at ────────────────────────────────

  await admin
    .from("harvests")
    .update({ photos_deleted_at: new Date().toISOString() })
    .eq("id", harvestId);

  // ── (m) Log completion ───────────────────────────────────────────────────

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  PIPELINE COMPLETE`);
  console.log(`  Child: ${c.name}`);
  console.log(`  Photos processed: ${h.photo_paths.length}`);
  console.log(`  Illustrations generated: ${genResult.illustrations.length}`);
  console.log(`  LoRA deleted: ${deleteResult.deleted}`);
  console.log(`  Photos deleted: ${!removeErr}`);
  console.log(`  Total time: ${elapsed(pipelineStart)}`);
  console.log(`${"─".repeat(60)}\n`);
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    "harvest-id": { type: "string" },
  },
  strict: true,
});

const harvestId = values["harvest-id"];

if (!harvestId) {
  console.error("Usage: npx tsx scripts/trigger-illustration.ts --harvest-id <uuid>");
  process.exit(1);
}

// Validate required env vars
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MODAL_TRAIN_URL",
  "MODAL_GENERATE_URL",
  "MODAL_DELETE_URL",
  "MODAL_AUTH_TOKEN",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

run(harvestId).catch((err) => {
  console.error(`\nFATAL: ${err.message ?? err}`);
  process.exit(1);
});
