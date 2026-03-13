import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import GenerateStoryButton, { GenerateBookButton, RunIllustrationsButton } from "./GenerateStoryButton";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface HarvestDetail {
  id: string;
  child_id: string;
  season: string;
  quarter: number;
  year: number;
  status: string;
  window_opens_at: string | null;
  window_closes_at: string | null;
  submitted_at: string | null;
  memory_1: string | null;
  memory_2: string | null;
  photo_count: number;
  photo_paths: string[];
  photo_captions: string[];
  current_interests: string[];
  milestone_description: string | null;
  character_archetype: string | null;
  notable_notes: string | null;
  face_ref_generated: boolean;
  photos_deleted_at: string | null;
}

interface ChildDetail {
  name: string;
  date_of_birth: string;
  pronouns: string;
  reading_level: string;
  interests: string[];
  avoidances: string[];
}

interface EpisodeDetail {
  id: string;
  title: string | null;
  dedication: string | null;
  scenes: { number: number; text: string; illustration_prompt: string }[] | null;
  final_page: string | null;
  parent_note: string | null;
  illustration_status: string;
  illustration_paths: string[];
  print_file_path: string | null;
  status: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function childAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-600",
  story_review: "bg-amber-100 text-amber-700",
  illustration_review: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  printing: "bg-violet-100 text-violet-700",
  shipped: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  generating: "bg-blue-100 text-blue-700",
  review: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {capitalize(status)}
    </span>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default async function HarvestDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Auth + admin guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  if (user.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    redirect("/dashboard");
  }

  const admin = getAdmin();
  const harvestId = params.id;

  // ── Fetch harvest ──────────────────────────────────────────────────────

  const { data: harvestRaw } = await admin
    .from("harvests")
    .select(
      "id, child_id, season, quarter, year, status, window_opens_at, window_closes_at, submitted_at, memory_1, memory_2, photo_count, photo_paths, photo_captions, current_interests, milestone_description, character_archetype, notable_notes, face_ref_generated, photos_deleted_at"
    )
    .eq("id", harvestId)
    .single();

  if (!harvestRaw) redirect("/admin");

  const harvest = harvestRaw as unknown as HarvestDetail;

  // ── Fetch child + episode in parallel ──────────────────────────────────

  const [childRes, episodeRes] = await Promise.all([
    admin
      .from("children")
      .select("name, date_of_birth, pronouns, reading_level, interests, avoidances")
      .eq("id", harvest.child_id)
      .single(),
    admin
      .from("episodes")
      .select(
        "id, title, dedication, scenes, final_page, parent_note, illustration_status, illustration_paths, print_file_path, status"
      )
      .eq("harvest_id", harvestId)
      .single(),
  ]);

  const child = (childRes.data as unknown as ChildDetail) ?? null;
  const episode = (episodeRes.data as unknown as EpisodeDetail) ?? null;

  if (!child) redirect("/admin");

  const age = childAge(child.date_of_birth);

  // ── Signed URLs for photos (if not yet deleted) ────────────────────────

  let photoUrls: { url: string; caption: string }[] = [];
  if (!harvest.photos_deleted_at && harvest.photo_paths.length > 0) {
    const { data: signed } = await admin.storage
      .from("harvest-photos")
      .createSignedUrls(harvest.photo_paths, 3600);

    if (signed) {
      photoUrls = signed.map((s, i) => ({
        url: s.signedUrl,
        caption: harvest.photo_captions?.[i] ?? "",
      }));
    }
  }

  // ── Signed URLs for illustrations ──────────────────────────────────────

  let illustrationUrls: string[] = [];
  if (episode?.illustration_paths && episode.illustration_paths.length > 0) {
    const { data: signed } = await admin.storage
      .from("illustrations")
      .createSignedUrls(episode.illustration_paths, 3600);

    if (signed) {
      illustrationUrls = signed.map((s) => s.signedUrl);
    }
  }

  // ── Signed URL for PDF ─────────────────────────────────────────────────

  let pdfUrl: string | null = null;
  if (episode?.print_file_path) {
    const { data: signed } = await admin.storage
      .from("books")
      .createSignedUrl(episode.print_file_path, 3600);

    if (signed) pdfUrl = signed.signedUrl;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">
            Storybound Admin
          </h1>
          <Link
            href="/admin"
            className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-600"
          >
            &larr; Back to admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8">
        {/* ── Title area ──────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">
              {child.name}&rsquo;s {capitalize(harvest.season)} {harvest.year}
            </h2>
            <StatusBadge status={harvest.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
            <span>Age {age}</span>
            <span>{capitalize(child.pronouns)}</span>
            <span>{capitalize(child.reading_level)}</span>
            <span>Q{harvest.quarter}</span>
            <span>Submitted {formatDate(harvest.submitted_at)}</span>
          </div>
        </div>

        {/* ── Section 1: Memory Drop ──────────────────────────────────── */}
        <section className="mb-8">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Memory drop
          </h3>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="grid gap-px bg-gray-100 md:grid-cols-2">
              <MemoryCard label="Memory 1" value={harvest.memory_1} />
              <MemoryCard label="Memory 2" value={harvest.memory_2} />
            </div>
            <div className="space-y-4 border-t border-gray-100 px-6 py-5">
              <DetailRow label="Milestone" value={harvest.milestone_description} />
              <DetailRow label="Archetype" value={harvest.character_archetype} />
              <DetailRow label="Notable notes" value={harvest.notable_notes} />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Current interests
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {harvest.current_interests.length > 0 ? (
                    harvest.current_interests.map((interest) => (
                      <span
                        key={interest}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
                      >
                        {interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">&mdash;</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Avoidances
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {child.avoidances && child.avoidances.length > 0 ? (
                    child.avoidances.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs text-red-600"
                      >
                        {a}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">&mdash;</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 2: Photos ───────────────────────────────────────── */}
        <section className="mb-8">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Photos
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({harvest.photo_count})
            </span>
          </h3>

          {harvest.photos_deleted_at ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-6 text-center">
              <p className="text-sm text-gray-400">
                Photos permanently deleted on{" "}
                {formatDate(harvest.photos_deleted_at)}
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Privacy constraint: source photos deleted after face reference
                generation.
              </p>
            </div>
          ) : photoUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {photoUrls.map((photo, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || `Photo ${i + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  {photo.caption && (
                    <p className="px-3 py-2 text-xs text-gray-500">
                      {photo.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-6 text-center">
              <p className="text-sm text-gray-400">No photos uploaded.</p>
            </div>
          )}
        </section>

        {/* ── Section 3: Story / Episode ──────────────────────────────── */}
        {episode ? (
          <section className="mb-8">
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Episode
              <span className="ml-2">
                <StatusBadge status={episode.status} />
              </span>
            </h3>
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="space-y-4 px-6 py-5">
                <DetailRow label="Title" value={episode.title} />
                <DetailRow label="Dedication" value={episode.dedication} />
                <DetailRow label="Final page" value={episode.final_page} />
                {episode.parent_note && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Parent note (not printed)
                    </p>
                    <p className="mt-1 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {episode.parent_note}
                    </p>
                  </div>
                )}
              </div>

              {/* Scenes */}
              {episode.scenes && episode.scenes.length > 0 && (
                <div className="border-t border-gray-100 px-6 py-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                    Scenes ({episode.scenes.length})
                  </p>
                  <div className="space-y-4">
                    {episode.scenes.map((scene) => (
                      <div
                        key={scene.number}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                      >
                        <p className="mb-2 text-xs font-semibold text-gray-400">
                          Scene {scene.number}
                        </p>
                        <p className="text-sm leading-relaxed text-gray-800">
                          {scene.text}
                        </p>
                        <p className="mt-3 rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-500">
                          {scene.illustration_prompt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="mb-8">
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Episode
            </h3>
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-6">
              {harvest.status === "processing" ? (
                <GenerateStoryButton harvestId={harvestId} />
              ) : (
                <p className="text-center text-sm text-gray-400">
                  No episode generated yet. Set harvest status to
                  &ldquo;processing&rdquo; first.
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Section 4: Illustrations ────────────────────────────────── */}
        <section className="mb-8">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Illustrations
            {episode && (
              <span className="ml-2">
                <StatusBadge status={episode.illustration_status} />
              </span>
            )}
          </h3>

          {illustrationUrls.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {illustrationUrls.map((url, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Illustration ${i + 1}`}
                    className="aspect-square w-full object-cover"
                  />
                  <p className="px-3 py-1.5 text-center text-xs text-gray-400">
                    {i + 1}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-6">
              {episode &&
              (!episode.illustration_status ||
                episode.illustration_status === "pending") ? (
                <RunIllustrationsButton harvestId={harvestId} />
              ) : (
                <p className="text-center text-sm text-gray-400">
                  No illustrations generated yet.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Section 5: Book PDF ─────────────────────────────────────── */}
        <section className="mb-8">
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Book PDF
          </h3>

          {pdfUrl ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-5">
              <div className="flex items-center gap-4">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-green-50 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                >
                  Download PDF &darr;
                </a>
                <span className="text-xs text-gray-400">
                  Link expires in 1 hour
                </span>
              </div>
            </div>
          ) : episode &&
            (episode.illustration_status === "review" ||
              episode.illustration_status === "approved") &&
            !episode.print_file_path ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-6">
              <GenerateBookButton harvestId={harvestId} />
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-6 text-center">
              <p className="text-sm text-gray-400">
                No book PDF generated yet.
              </p>
            </div>
          )}
        </section>

        {/* ── Processing metadata ─────────────────────────────────────── */}
        <section>
          <h3 className="mb-4 text-base font-semibold text-gray-900">
            Processing
          </h3>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="space-y-3 px-6 py-5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Window opens</span>
                <span className="text-gray-700">
                  {formatDate(harvest.window_opens_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Window closes</span>
                <span className="text-gray-700">
                  {formatDate(harvest.window_closes_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Face ref generated</span>
                <span className="text-gray-700">
                  {harvest.face_ref_generated ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Photos deleted</span>
                <span className="text-gray-700">
                  {harvest.photos_deleted_at
                    ? formatDate(harvest.photos_deleted_at)
                    : "Not yet"}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function MemoryCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="bg-white px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-gray-800">
        {value || <span className="text-gray-400">&mdash;</span>}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm text-gray-800">
        {value || <span className="text-gray-400">&mdash;</span>}
      </p>
    </div>
  );
}
