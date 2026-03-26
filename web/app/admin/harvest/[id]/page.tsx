export const maxDuration = 300;

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import GenerateStoryButton, {
  MarkProcessingButton,
  GenerateBookButton,
  RunIllustrationsButton,
  ResetToBookReadyButton,
  PrintFlowButtons,
} from "./GenerateStoryButton";

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
  character_photos_deleted_at: string | null;
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
  preview_deadline: string | null;
  parent_flag_message: string | null;
}

interface FamilyDetail {
  subscription_type: string;
  shipping_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
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
  training: "bg-indigo-100 text-indigo-700",
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
  book_ready: "bg-purple-100 text-purple-700",
  parent_flagged: "bg-orange-100 text-orange-700",
  parent_approved: "bg-green-100 text-green-700",
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

/* ─── Step wrapper ────────────────────────────────────────────────────────── */

function PipelineStep({
  number,
  title,
  active,
  children,
}: {
  number: number;
  title: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border bg-white ${
        active ? "border-gray-200" : "border-gray-100 opacity-60"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            active
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-400"
          }`}
        >
          {number}
        </span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
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

  // ── Fetch child + episode + family in parallel ─────────────────────────

  const [childRes, episodeRes] = await Promise.all([
    admin
      .from("children")
      .select("name, date_of_birth, pronouns, reading_level, interests, avoidances, character_photos_deleted_at")
      .eq("id", harvest.child_id)
      .single(),
    admin
      .from("episodes")
      .select(
        "id, title, dedication, scenes, final_page, parent_note, illustration_status, illustration_paths, print_file_path, status, preview_deadline, parent_flag_message"
      )
      .eq("harvest_id", harvestId)
      .single(),
  ]);

  const child = (childRes.data as unknown as ChildDetail) ?? null;
  const episode = (episodeRes.data as unknown as EpisodeDetail) ?? null;

  if (!child) redirect("/admin");

  // Fetch family data (subscription type + shipping address)
  const { data: childFamRaw } = await admin
    .from("children")
    .select("family_id")
    .eq("id", harvest.child_id)
    .single();

  const familyId = (childFamRaw as unknown as { family_id: string } | null)?.family_id;

  let family: FamilyDetail | null = null;
  if (familyId) {
    const { data: famRaw } = await admin
      .from("families")
      .select("subscription_type, shipping_name, address_line1, address_line2, city, state, zip, country")
      .eq("id", familyId)
      .single();
    family = (famRaw as unknown as FamilyDetail) ?? null;
  }

  const age = childAge(child.date_of_birth);
  const isPhysical = family?.subscription_type === "physical_digital";

  // ── Signed URLs for photos ─────────────────────────────────────────────

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

  // ── Pipeline step conditions ───────────────────────────────────────────

  const hasEpisode = !!episode;
  const storyComplete = hasEpisode;
  const illustrationsComplete =
    hasEpisode &&
    (episode.illustration_status === "review" ||
      episode.illustration_status === "approved" ||
      episode.illustration_status === "complete");
  const bookGenerated = !!episode?.print_file_path;
  const photosDeletedNoIllustrations =
    !!child.character_photos_deleted_at &&
    !harvest.face_ref_generated &&
    hasEpisode &&
    episode.illustration_status !== "review" &&
    episode.illustration_status !== "approved" &&
    episode.illustration_status !== "complete";

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
            &larr; Back to list
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
            {family && (
              <span className="capitalize">{family.subscription_type?.replace(/_/g, " ") ?? "none"}</span>
            )}
          </div>
        </div>

        {/* ── Memory Drop (read-only context) ─────────────────────────── */}
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

        {/* ── Photos (read-only context) ──────────────────────────────── */}
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

        {/* ── Pipeline ────────────────────────────────────────────────── */}
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          Pipeline
        </h3>
        <div className="space-y-4">
          {/* ── STEP 1: Story generation ────────────────────────────── */}
          <PipelineStep
            number={1}
            title="Story generation"
            active={harvest.status === "submitted" || harvest.status === "processing" || storyComplete}
          >
            {harvest.status === "submitted" && (
              <div>
                <p className="mb-3 text-sm text-gray-500">
                  Harvest is submitted. Mark as processing to begin.
                </p>
                <MarkProcessingButton harvestId={harvestId} />
              </div>
            )}
            {harvest.status === "processing" && !hasEpisode && (
              <GenerateStoryButton harvestId={harvestId} />
            )}
            {storyComplete && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Story generated
                </div>
                {episode?.title && (
                  <p className="mt-2 text-sm font-medium text-gray-800">
                    &ldquo;{episode.title}&rdquo;
                  </p>
                )}
                {episode?.scenes && episode.scenes.length > 0 && (
                  <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                    {episode.scenes[0].text}
                  </p>
                )}
              </div>
            )}
            {harvest.status !== "submitted" &&
              harvest.status !== "processing" &&
              !storyComplete && (
                <p className="text-sm text-gray-400">
                  Set harvest status to &ldquo;processing&rdquo; first.
                </p>
              )}
          </PipelineStep>

          {/* ── STEP 2: Illustration generation ─────────────────────── */}
          <PipelineStep
            number={2}
            title="Illustration generation"
            active={storyComplete}
          >
            {!storyComplete && (
              <p className="text-sm text-gray-400">
                Complete story first.
              </p>
            )}
            {storyComplete && illustrationsComplete && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {illustrationUrls.length} illustration{illustrationUrls.length !== 1 ? "s" : ""} generated
                </div>
                {illustrationUrls.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-5">
                    {illustrationUrls.map((url, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={url}
                        alt={`Illustration ${i + 1}`}
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {storyComplete && !illustrationsComplete && photosDeletedNoIllustrations && (
              <div>
                <div className="mb-3 rounded bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <p className="font-medium">
                    Pipeline crashed &mdash; photos already deleted.
                  </p>
                  <p className="mt-1">
                    Re-run will generate without face conditioning (base model only).
                  </p>
                </div>
                <RunIllustrationsButton harvestId={harvestId} skipLora />
              </div>
            )}
            {storyComplete && !illustrationsComplete && !photosDeletedNoIllustrations && (
              <RunIllustrationsButton harvestId={harvestId} />
            )}
          </PipelineStep>

          {/* ── STEP 3: Book generation ─────────────────────────────── */}
          <PipelineStep
            number={3}
            title="Book generation"
            active={illustrationsComplete}
          >
            {!illustrationsComplete && (
              <p className="text-sm text-gray-400">
                Complete illustrations first.
              </p>
            )}
            {illustrationsComplete && !bookGenerated && (
              <GenerateBookButton harvestId={harvestId} />
            )}
            {bookGenerated && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Book generated
                </div>
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    Download PDF &darr;
                  </a>
                )}
                {episode?.preview_deadline && (
                  <p className="mt-2 text-xs text-gray-400">
                    Preview deadline: {formatDate(episode.preview_deadline)}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Preview email sent to parent.
                </p>
              </div>
            )}
          </PipelineStep>

          {/* ── STEP 4: Parent preview ──────────────────────────────── */}
          <PipelineStep
            number={4}
            title="Parent preview"
            active={bookGenerated}
          >
            {!bookGenerated && (
              <p className="text-sm text-gray-400">
                Generate book first.
              </p>
            )}
            {bookGenerated && episode?.status === "book_ready" && (
              <div>
                <p className="text-sm text-gray-500">
                  Awaiting parent review.
                </p>
                {episode.preview_deadline && (
                  <p className="mt-1 text-xs text-gray-400">
                    Deadline: {formatDate(episode.preview_deadline)}
                  </p>
                )}
              </div>
            )}
            {bookGenerated && episode?.status === "parent_flagged" && (
              <div>
                <div className="mb-3 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p className="font-medium">Parent flagged an issue</p>
                  {episode.parent_flag_message && (
                    <p className="mt-1 italic">
                      &ldquo;{episode.parent_flag_message}&rdquo;
                    </p>
                  )}
                </div>
                <ResetToBookReadyButton harvestId={harvestId} />
              </div>
            )}
            {bookGenerated && episode?.status === "parent_approved" && (
              <div>
                {isPhysical ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Parent approved &mdash; ready to print
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Digital approved &mdash; no print needed
                  </div>
                )}
              </div>
            )}
            {bookGenerated &&
              episode?.status === "printing" && (
                <div className="flex items-center gap-2 text-sm font-medium text-teal-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Parent approved
                </div>
              )}
            {bookGenerated &&
              episode?.status === "shipped" && (
                <div className="flex items-center gap-2 text-sm font-medium text-teal-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Parent approved
                </div>
              )}
          </PipelineStep>

          {/* ── STEP 5: Print & ship (physical only) ────────────────── */}
          {isPhysical && (
            <PipelineStep
              number={5}
              title="Print &amp; ship"
              active={
                bookGenerated &&
                (episode?.status === "parent_approved" ||
                  episode?.status === "printing" ||
                  episode?.status === "shipped")
              }
            >
              {!bookGenerated && (
                <p className="text-sm text-gray-400">
                  Complete previous steps first.
                </p>
              )}
              {bookGenerated && episode?.status === "book_ready" && (
                <p className="text-sm text-gray-400">
                  Awaiting parent approval.
                </p>
              )}
              {bookGenerated && episode?.status === "parent_flagged" && (
                <p className="text-sm text-gray-400">
                  Resolve parent flag first.
                </p>
              )}
              {bookGenerated && episode?.status === "parent_approved" && (
                <div>
                  <div className="mb-4 space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">Child:</span>{" "}
                      <span className="text-gray-900">
                        {child.name} (age {age})
                      </span>
                    </div>
                    {family?.shipping_name && (
                      <div>
                        <span className="font-medium text-gray-500">Ship to:</span>{" "}
                        <span className="text-gray-700">
                          {family.shipping_name}
                          {family.address_line1 && `, ${family.address_line1}`}
                          {family.address_line2 && ` ${family.address_line2}`}
                          {family.city && `, ${family.city}`}
                          {family.state && ` ${family.state}`}
                          {family.zip && ` ${family.zip}`}
                        </span>
                      </div>
                    )}
                    {pdfUrl && (
                      <div>
                        <span className="font-medium text-gray-500">PDF:</span>{" "}
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                        >
                          Download
                        </a>
                      </div>
                    )}
                  </div>
                  <PrintFlowButtons
                    harvestId={harvestId}
                    episodeStatus="parent_approved"
                  />
                </div>
              )}
              {bookGenerated && episode?.status === "printing" && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <StatusBadge status="printing" />
                    <span className="text-xs text-gray-400">
                      Sent to printer
                    </span>
                  </div>
                  <PrintFlowButtons
                    harvestId={harvestId}
                    episodeStatus="printing"
                  />
                </div>
              )}
              {bookGenerated && episode?.status === "shipped" && (
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Shipped
                </div>
              )}
            </PipelineStep>
          )}
        </div>

        {/* ── Processing metadata ─────────────────────────────────────── */}
        <section className="mt-8">
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

        {/* ── Story detail (expandable below pipeline) ────────────────── */}
        {episode && (
          <section className="mt-8">
            <h3 className="mb-4 text-base font-semibold text-gray-900">
              Story detail
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
        )}
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
