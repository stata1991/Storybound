import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  getParentData,
  getChildrenWithHarvests,
  getCurrentQuarter,
} from "./actions";
import { signOut } from "../auth/actions";
import ChildCard from "./components/ChildCard";
import StoryTimeline from "./components/StoryTimeline";
import DashboardToast from "./components/SubmittedToast";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { submitted?: string; updated?: string };
}) {
  // Auth guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const parent = await getParentData();

  // Fetch family subscription info
  let subscriptionType = "none";
  if (parent?.family_id) {
    const { data: family } = await supabase
      .from("families")
      .select("subscription_type")
      .eq("id", parent.family_id)
      .single();
    subscriptionType = (family?.subscription_type as string) ?? "none";
  }

  const [children, { quarter: currentQuarter }] = await Promise.all([
    getChildrenWithHarvests(),
    getCurrentQuarter(),
  ]);

  // Welcome name
  const firstName = parent?.first_name;
  const welcomeText = firstName
    ? `Welcome back, ${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()}.`
    : "Welcome back.";

  // Subtitle
  const subtitle =
    children.length === 1
      ? `Here\u2019s where ${children[0].name.charAt(0).toUpperCase() + children[0].name.slice(1).toLowerCase()}\u2019s story stands today.`
      : children.length > 1
        ? "Here\u2019s where your children\u2019s stories stand today."
        : "";

  // Find any book_ready episodes across all children (for banner)
  const bookReadyEpisodes = children.flatMap((child) =>
    child.episodes
      .filter((ep) => ep.status === "book_ready")
      .map((ep) => ({
        childName: child.name,
        harvestId: child.harvests.find(
          (h) => h.quarter === ep.quarter && h.year === ep.year
        )?.id,
      }))
  );

  // Post-approval episodes — the book must never be invisible between
  // approval and delivery. Episodes whose status itself is shipped/delivered
  // (manual markShipped path) are rendered by ChildCard and can't appear
  // here (this filter requires status parent_approved); the Prodigi flow
  // advances only print_status, which ChildCard doesn't key on, so those
  // stay in this banner through shipping.
  const approvedEpisodes = children.flatMap((child) =>
    child.episodes
      .filter((ep) => ep.status === "parent_approved")
      .map((ep) => {
        const harvest = child.harvests.find(
          (h) => h.quarter === ep.quarter && h.year === ep.year
        );
        return {
          episodeId: ep.id,
          childName:
            child.name.charAt(0).toUpperCase() + child.name.slice(1),
          season: harvest?.season
            ? harvest.season.charAt(0).toUpperCase() + harvest.season.slice(1)
            : "",
          harvestId: harvest?.id,
          printStatus: ep.print_status,
        };
      })
  );

  // Tracking URLs live on print_orders (service-role only). The admin client
  // widens what this server component can FETCH — keyed strictly by episode
  // ids the RLS-scoped query above already surfaced as shipped — and never
  // widens what the page SHOWS.
  const trackingUrlByEpisode = new Map<string, string>();
  const shippedEpisodeIds = approvedEpisodes
    .filter((ep) => ep.printStatus === "shipped")
    .map((ep) => ep.episodeId);
  if (shippedEpisodeIds.length > 0) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: orderRows } = await admin
      .from("print_orders")
      .select("episode_id, tracking_url")
      .in("episode_id", shippedEpisodeIds)
      .not("tracking_url", "is", null);
    for (const row of (orderRows ?? []) as {
      episode_id: string;
      tracking_url: string;
    }[]) {
      trackingUrlByEpisode.set(row.episode_id, row.tracking_url);
    }
  }

  // Check if any child has episodes in progress (draft / story_review / illustration_review)
  const hasInProgressEpisodes = children.some((child) =>
    child.episodes.some((ep) =>
      ["draft", "story_review", "illustration_review"].includes(ep.status)
    )
  );

  // Check if there are NO episodes at all (book is being created)
  const hasNoEpisodes = children.every((child) => child.episodes.length === 0);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5">
        <Link
          href="/dashboard"
          className="font-serif text-xl font-bold text-navy"
        >
          Storybound
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-16">
        {/* Welcome */}
        <div className="py-8 md:py-12">
          <h1 className="font-serif text-3xl font-bold text-navy md:text-4xl">
            {welcomeText}
          </h1>
          {subtitle && (
            <p className="mt-2 font-sans text-base text-navy/50">{subtitle}</p>
          )}
        </div>

        {/* Success toasts */}
        {searchParams.submitted === "true" && children.length > 0 && (
          <DashboardToast
            message={`Memory submitted \u2713 \u2014 we'll get to work on ${children[0].name.charAt(0).toUpperCase() + children[0].name.slice(1).toLowerCase()}'s story.`}
          />
        )}
        {searchParams.updated === "true" && (
          <DashboardToast message="Profile updated \u2713" />
        )}

        {/* Book ready — amber banner with preview link (all subscription types) */}
        {bookReadyEpisodes.length > 0 &&
          bookReadyEpisodes.map(
                (ep) =>
                  ep.harvestId && (
                    <div
                      key={ep.harvestId}
                      className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-serif text-lg font-semibold text-navy">
                            {ep.childName.charAt(0).toUpperCase() +
                              ep.childName.slice(1)}
                            &rsquo;s book is ready!
                          </p>
                          <p className="mt-1 font-sans text-sm text-navy/60">
                            Preview it and choose how you&rsquo;d like to
                            receive it.
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/preview/${ep.harvestId}`}
                          className="flex-shrink-0 rounded-full bg-gold px-6 py-3 font-sans text-sm font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
                        >
                          Preview now &rarr;
                        </Link>
                      </div>
                    </div>
                  )
          )}

        {/* No episodes or in progress — preparation message (free families) */}
        {subscriptionType === "none" &&
          children.length > 0 &&
          bookReadyEpisodes.length === 0 &&
          (hasNoEpisodes || hasInProgressEpisodes) && (
                <div className="mb-6 rounded-2xl border border-navy/10 bg-white p-6 shadow-warm">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold/10">
                      <svg
                        className="h-5 w-5 text-gold"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-serif text-lg font-semibold text-navy">
                        Your book is being prepared
                      </p>
                      <p className="mt-0.5 font-sans text-sm text-navy/50">
                        We&rsquo;re crafting a one-of-a-kind story from the
                        memories you shared. We&rsquo;ll email you when
                        it&rsquo;s ready to preview.
                      </p>
                    </div>
                  </div>
                </div>
          )}

        {/* Post-approval banner — approved books stay visible until delivery */}
        {approvedEpisodes.map(
          (ep) =>
            ep.harvestId && (
              <div
                key={ep.harvestId}
                className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-serif text-lg font-semibold text-navy">
                      {ep.printStatus === "submitted" ||
                      ep.printStatus === "printing"
                        ? `${ep.childName}’s ${ep.season} book is being printed!`
                        : ep.printStatus === "shipped"
                          ? `${ep.childName}’s ${ep.season} book is on its way!`
                          : subscriptionType === "digital_only"
                            ? `${ep.childName}’s ${ep.season} book is yours!`
                            : `${ep.childName}’s ${ep.season} book is confirmed!`}
                    </p>
                    <p className="mt-1 font-sans text-sm text-navy/60">
                      {ep.printStatus === "submitted" ||
                      ep.printStatus === "printing"
                        ? "We’ll let you know the moment it ships."
                        : ep.printStatus === "shipped"
                          ? "Keep an eye on the mailbox."
                          : subscriptionType === "digital_only"
                            ? "Read it anytime."
                            : "We’re getting it ready for print."}
                      {ep.printStatus === "shipped" &&
                        trackingUrlByEpisode.has(ep.episodeId) && (
                          <>
                            {" "}
                            <a
                              href={trackingUrlByEpisode.get(ep.episodeId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-gold underline underline-offset-2 hover:text-gold-light"
                            >
                              Track it →
                            </a>
                          </>
                        )}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/preview/${ep.harvestId}`}
                    className="flex-shrink-0 rounded-full bg-gold px-6 py-3 font-sans text-sm font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
                  >
                    {subscriptionType === "digital_only" &&
                    ep.printStatus === "pending"
                      ? "Read now →"
                      : "View book →"}
                  </Link>
                </div>
              </div>
            )
        )}


        {/* Empty state */}
        {children.length === 0 && (
          <div className="rounded-2xl bg-white p-8 shadow-warm text-center md:p-12">
            <h2 className="font-serif text-xl font-semibold text-navy">
              Something went wrong during setup.
            </h2>
            <p className="mt-2 font-sans text-base text-navy/50">
              Let&rsquo;s get your child&rsquo;s story started.
            </p>
            <Link
              href="/onboarding"
              className="mt-6 inline-block rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
            >
              Complete your setup
            </Link>
          </div>
        )}

        {/* Child cards */}
        {children.length > 0 && (
          <div
            className={`grid gap-6 ${
              children.length >= 2 ? "md:grid-cols-2" : ""
            }`}
          >
            {children.map((child) => (
              <div key={child.id}>
                <ChildCard child={child} currentQuarter={currentQuarter} />
                <StoryTimeline child={child} currentQuarter={currentQuarter} />
              </div>
            ))}
          </div>
        )}

        {/* Add another child */}
        {children.length > 0 && (
          <div className="mt-12 text-center">
            <Link
              href="/onboarding?additional=true"
              className="inline-block rounded-full border border-navy/15 px-6 py-3 font-sans text-sm font-medium text-navy/60 transition-all hover:border-gold/40 hover:text-gold"
            >
              Add another child
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
