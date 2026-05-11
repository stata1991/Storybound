"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[onboarding error boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-2xl bg-white p-8 text-center shadow-warm md:p-10">
        <h1 className="font-serif text-2xl font-bold text-navy">
          Something went wrong
        </h1>
        <p className="mt-3 font-sans text-base text-navy/60">
          We hit a snag loading this page. Your progress has been saved —
          nothing is lost.
        </p>

        <button
          onClick={reset}
          className="mt-8 rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
        >
          Try again
        </button>

        <Link
          href="/dashboard"
          className="mt-4 block font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          Go to dashboard
        </Link>

        <a
          href="mailto:hello@thestoryboundapp.com"
          className="mt-3 block font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          Email us for help
        </a>
      </div>
    </div>
  );
}
