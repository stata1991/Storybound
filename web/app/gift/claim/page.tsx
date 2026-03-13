import { redirect } from "next/navigation";
import Link from "next/link";
import { getGiftClaim, startGiftClaim } from "./actions";

export default async function GiftClaimPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;

  if (!token) {
    redirect("/");
  }

  const result = await getGiftClaim(token);

  if (result.status === "not_found") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="flex items-center justify-center px-6 py-5">
        <Link
          href="/"
          className="font-serif text-xl font-bold text-navy"
        >
          Storybound
        </Link>
      </header>

      <main className="mx-auto flex max-w-lg items-center justify-center px-6 pb-16 pt-8 md:pt-16">
        {result.status === "already_claimed" && (
          <div className="w-full rounded-2xl bg-white p-8 shadow-warm text-center md:p-10">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-navy/5">
              <svg
                className="h-8 w-8 text-navy/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-bold text-navy">
              This gift has already been claimed.
            </h1>
            <p className="mt-3 font-sans text-base text-navy/50">
              If you&rsquo;re the recipient, sign in to access your dashboard.
            </p>
            <Link
              href="/auth"
              className="mt-6 inline-block rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
            >
              Sign in
            </Link>
          </div>
        )}

        {result.status === "expired" && (
          <div className="w-full rounded-2xl bg-white p-8 shadow-warm text-center md:p-10">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-navy/5">
              <svg
                className="h-8 w-8 text-navy/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-bold text-navy">
              This gift link has expired.
            </h1>
            <p className="mt-3 font-sans text-base text-navy/50">
              Please contact the person who sent you this gift — they can
              request a new link or an extension.
            </p>
          </div>
        )}

        {result.status === "valid" && (
          <div className="w-full rounded-2xl border border-gold/20 bg-white p-8 shadow-warm md:p-10">
            {/* Gift icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
              <svg
                className="h-8 w-8 text-gold"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                />
              </svg>
            </div>

            <div className="text-center">
              <p className="font-sans text-sm font-medium text-gold">
                Someone special is thinking of you
              </p>
              <h1 className="mt-3 font-serif text-2xl font-bold text-navy md:text-3xl">
                You&rsquo;ve been gifted a year of Storybound
              </h1>
              <p className="mt-4 font-sans text-base leading-relaxed text-navy/60">
                A full year of personalized storybooks for your child — from
                someone who loves them.
              </p>

              {result.recipientEmail && (
                <p className="mt-3 font-sans text-sm text-navy/40">
                  This gift was sent to {result.recipientEmail}
                </p>
              )}
            </div>

            {/* What's included */}
            <div className="mt-8 rounded-xl bg-cream-warm/50 p-5">
              <p className="mb-3 font-sans text-xs font-medium uppercase tracking-wide text-navy/40">
                What&rsquo;s included
              </p>
              <ul className="space-y-2 font-sans text-sm text-navy/70">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-gold">&#10003;</span>
                  4 quarterly illustrated chapter books
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-gold">&#10003;</span>
                  Your child as the hero of every story
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-gold">&#10003;</span>
                  A birthday book timed to their special day
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-gold">&#10003;</span>
                  Digital companion included
                </li>
              </ul>
            </div>

            {/* CTA */}
            <form
              action={async () => {
                "use server";
                await startGiftClaim(token);
              }}
              className="mt-8"
            >
              <button
                type="submit"
                className="w-full rounded-full bg-gold py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
              >
                Claim your gift &rarr;
              </button>
            </form>

            <p className="mt-4 text-center font-sans text-xs text-navy/30">
              You&rsquo;ll create an account, then tell us about your child.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
