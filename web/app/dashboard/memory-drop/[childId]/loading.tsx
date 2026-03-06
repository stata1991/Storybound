export default function MemoryDropLoading() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="h-6 w-28 animate-pulse rounded bg-navy/10" />
        <div className="h-4 w-32 animate-pulse rounded bg-navy/10" />
      </header>

      <main className="mx-auto max-w-lg px-6 pb-16">
        <div className="py-6">
          <div className="h-8 w-64 animate-pulse rounded bg-navy/10" />
          <div className="mt-3 h-4 w-48 animate-pulse rounded bg-navy/10" />
        </div>

        <div className="space-y-8">
          {/* Photo field skeleton */}
          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <div className="mb-3 h-4 w-20 animate-pulse rounded bg-navy/10" />
            <div className="h-32 animate-pulse rounded-xl border-2 border-dashed border-navy/10 bg-navy/[0.02]" />
          </div>

          {/* Textarea skeletons */}
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-6 shadow-warm md:p-8"
            >
              <div className="mb-3 h-4 w-48 animate-pulse rounded bg-navy/10" />
              <div className="h-20 animate-pulse rounded-2xl bg-navy/[0.03]" />
            </div>
          ))}

          {/* Input skeletons */}
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-6 shadow-warm md:p-8"
            >
              <div className="mb-3 h-4 w-40 animate-pulse rounded bg-navy/10" />
              <div className="h-12 animate-pulse rounded-full bg-navy/[0.03]" />
            </div>
          ))}

          {/* Button skeleton */}
          <div className="h-12 animate-pulse rounded-full bg-gold/20" />
        </div>
      </main>
    </div>
  );
}
