import { createClient as createAdminClient } from "@supabase/supabase-js";
import { generateBookHTML } from "./template";
import type { BookParams } from "./template";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface EpisodeRow {
  id: string;
  child_id: string;
  harvest_id: string;
  title: string;
  dedication: string;
  scenes: { number: number; text: string; illustration_prompt: string; beat?: string }[];
  final_page: string;
  illustration_paths: string[];
  year: number;
}

interface ChildRow {
  name: string;
  date_of_birth: string | null;
  pronouns: string | null;
}

/* ─── Admin client ────────────────────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/* ─── Download illustration as base64 ─────────────────────────────────────── */

async function downloadAsBase64(
  admin: ReturnType<typeof getAdmin>,
  bucket: string,
  path: string
): Promise<string> {
  // Generate signed URL (1-hour expiry)
  const { data: urlData, error: urlErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, 3600);

  if (urlErr || !urlData?.signedUrl) {
    throw new Error(`Failed to sign URL for ${path}: ${urlErr?.message ?? "no data"}`);
  }

  // Download via fetch → Buffer → base64 (never disk)
  const res = await fetch(urlData.signedUrl);
  if (!res.ok) {
    throw new Error(`Failed to download ${path}: HTTP ${res.status}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf).toString("base64");
}

/* ─── Main export ─────────────────────────────────────────────────────────── */

export async function generateBookPDF(episodeId: string): Promise<Buffer> {
  const admin = getAdmin();

  // ── (a) Fetch episode + child ──────────────────────────────────────────

  const { data: episodeRaw, error: epErr } = await admin
    .from("episodes")
    .select(
      "id, child_id, harvest_id, title, dedication, scenes, final_page, illustration_paths, year"
    )
    .eq("id", episodeId)
    .single();

  if (epErr || !episodeRaw) {
    throw new Error(`Episode not found: ${epErr?.message ?? "no data"}`);
  }

  const episode = episodeRaw as unknown as EpisodeRow;

  if (!episode.scenes || episode.scenes.length === 0) {
    throw new Error("Episode has no scenes.");
  }

  if (!episode.illustration_paths || episode.illustration_paths.length === 0) {
    throw new Error("Episode has no illustration paths.");
  }

  const { data: childRaw } = await admin
    .from("children")
    .select("name, date_of_birth, pronouns")
    .eq("id", episode.child_id)
    .single();

  if (!childRaw) {
    throw new Error("Child not found.");
  }

  const child = childRaw as unknown as ChildRow;

  // Calculate child's age from DOB; default to 6 if missing or unparseable
  let childAge = 6;
  if (child.date_of_birth) {
    const dob = new Date(child.date_of_birth);
    if (isNaN(dob.getTime())) {
      console.warn(`Missing DOB for child, defaulting to age 6`);
    } else {
      const now = new Date();
      childAge = now.getFullYear() - dob.getFullYear();
      const monthDiff = now.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        childAge--;
      }
    }
  } else {
    console.warn(`Missing DOB for child, defaulting to age 6`);
  }

  const { data: harvestRaw } = await admin
    .from("harvests")
    .select("season")
    .eq("id", episode.harvest_id)
    .single();

  if (!harvestRaw) {
    throw new Error("Harvest not found.");
  }

  const harvest = harvestRaw as unknown as { season: string };

  // ── (b+c) Download illustrations as base64 ────────────────────────────

  const illustrationBase64: string[] = [];

  for (const path of episode.illustration_paths) {
    const b64 = await downloadAsBase64(admin, "illustrations", path);
    illustrationBase64.push(b64);
  }

  // Index 0 is always the dedicated cover; rest are scene illustrations
  const coverImageBase64 = illustrationBase64[0];
  const sceneImages = illustrationBase64.slice(1);

  // ── (d+e) Generate HTML ────────────────────────────────────────────────

  // Scene count is age-scaled (6–12 scenes). Match available illustrations.
  const scenes = episode.scenes.slice(0, sceneImages.length).map((scene, i) => ({
    number: scene.number,
    text: scene.text,
    imageBase64: sceneImages[i] ?? sceneImages[sceneImages.length - 1],
    beat: scene.beat,
  }));

  // Reuse last scene illustration for the final page vignette (no extra GPU)
  const finalPageImageBase64 = sceneImages.length > 0
    ? sceneImages[sceneImages.length - 1]
    : undefined;

  const bookParams: BookParams = {
    childName: child.name,
    age: childAge,
    pronouns: child.pronouns ?? "they_them",
    season: harvest.season,
    year: episode.year,
    title: episode.title,
    dedication: episode.dedication,
    scenes,
    coverImageBase64,
    finalPage: episode.final_page,
    finalPageImageBase64,
  };

  const html = generateBookHTML(bookParams);

  // ── (f) Render PDF via Modal ─────────────────────────────────────────

  const pdfUrl = process.env.MODAL_PDF_URL;
  if (!pdfUrl) throw new Error("MODAL_PDF_URL is not configured.");

  const res = await fetch(pdfUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MODAL_AUTH_TOKEN}`,
    },
    body: JSON.stringify({ html, episode_id: episodeId }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "No response body");
    throw new Error(`Modal PDF returned ${res.status}: ${text}`);
  }

  const result = await res.json();

  // ── (g) Return PDF as Buffer ─────────────────────────────────────────

  return Buffer.from(result.pdf_base64, "base64");
}
