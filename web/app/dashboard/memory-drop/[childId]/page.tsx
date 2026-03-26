import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getChildAndHarvest, getHarvestPhotoUrls } from "./actions";
import MemoryDropForm from "./MemoryDropForm";
import PhotoSection from "./PhotoSection";

export default async function MemoryDropPage({
  params,
}: {
  params: { childId: string };
}) {
  // Auth guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const result = await getChildAndHarvest(params.childId);

  // Not found — child doesn't belong to this user
  if (result.status === "not_found") {
    redirect("/dashboard");
  }

  // No open window
  if (result.status === "no_window") {
    redirect("/dashboard");
  }

  // Already submitted — show summary
  if (result.status === "submitted") {
    const { child, harvest } = result;
    const photoCount = harvest.photo_count ?? 0;
    const photoPaths = harvest.photo_paths ?? [];
    const photoUrls = await getHarvestPhotoUrls(photoPaths);

    return (
      <div className="min-h-screen bg-cream">
        <header className="flex items-center justify-between px-6 py-5">
          <Link
            href="/dashboard"
            className="font-serif text-xl font-bold text-navy"
          >
            Storybound
          </Link>
          <Link
            href="/dashboard"
            className="font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
          >
            &larr; Back to dashboard
          </Link>
        </header>
        <main className="mx-auto max-w-lg px-6 pb-16">
          <div className="py-6">
            <h1 className="font-serif text-2xl font-bold text-navy md:text-3xl">
              Memory already submitted
            </h1>
            <p className="mt-2 font-sans text-sm text-navy/50">
              {child.name}&rsquo;s {harvest.season} memory drop is in. Your
              book is being crafted.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <div className="space-y-4 font-sans text-sm text-navy/70">
              {harvest.milestone_description && (
                <div>
                  <p className="font-medium text-navy/50">Milestone</p>
                  <p className="mt-1">{harvest.milestone_description}</p>
                </div>
              )}
              {harvest.current_interests &&
                harvest.current_interests.length > 0 && (
                  <div>
                    <p className="font-medium text-navy/50">Interests</p>
                    <p className="mt-1">
                      {harvest.current_interests.join(", ")}
                    </p>
                  </div>
                )}
              {harvest.character_archetype && (
                <div>
                  <p className="font-medium text-navy/50">Character</p>
                  <p className="mt-1">{harvest.character_archetype}</p>
                </div>
              )}
              {harvest.notable_notes && (
                <div>
                  <p className="font-medium text-navy/50">Notes</p>
                  <p className="mt-1">{harvest.notable_notes}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <svg
                className="h-5 w-5 flex-shrink-0 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <p className="font-sans text-sm text-green-700">
                Submitted — we&rsquo;re working on {child.name}&rsquo;s story
              </p>
            </div>
          </div>

          {/* Photo section */}
          <PhotoSection
            childId={child.id}
            harvestId={harvest.id}
            photoCount={photoCount}
            photoUrls={photoUrls}
          />

          <div className="mt-8 text-center">
            <Link
              href="/dashboard"
              className="inline-block rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
            >
              Back to dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Window is open — show form
  return <MemoryDropForm child={result.child} harvest={result.harvest} />;
}
