"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportClientError } from "@/lib/report-client-error";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    console.error("[error boundary]", error);
    void reportClientError({
      message: error.message,
      digest: error.digest,
      pathname,
      boundary: "root",
    }).catch(() => {});
  }, [error, pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-warm md:p-10">
        <h1 className="font-serif text-2xl font-bold text-navy">
          Something went wrong
        </h1>
        <p className="mt-3 font-sans text-base text-navy/60">
          We hit a snag loading this page. Try again, or reach out if it keeps
          happening.
        </p>

        <button
          onClick={reset}
          className="mt-8 rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
        >
          Try again
        </button>

        <a
          href="mailto:hello@thestoryboundapp.com"
          className="mt-4 block font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          Email us for help
        </a>

        {error.digest && (
          <p className="mt-6 font-mono text-xs text-navy/25">
            Ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
