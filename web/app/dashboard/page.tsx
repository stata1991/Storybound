import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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

  const [parent, children] = await Promise.all([
    getParentData(),
    getChildrenWithHarvests(),
  ]);

  const { quarter: currentQuarter } = await getCurrentQuarter();

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
            <p className="mt-2 font-sans text-xs text-navy/30">
              Each child has their own story — $89/year
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
