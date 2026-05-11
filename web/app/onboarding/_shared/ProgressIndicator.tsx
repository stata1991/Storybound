"use client";

/**
 * Full-journey progress indicator shared by all onboarding routes.
 * Each route passes its own `currentStep` value; the component just renders.
 *
 * Step label constants live in ./steps.ts (plain TS, no "use client")
 * so server components can safely import them.
 */

export default function ProgressIndicator({
  currentStep,
  labels,
}: {
  currentStep: number;
  labels: string[];
}) {
  const totalSteps = labels.length;

  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4">
      {labels.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;

        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-sans text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-gold text-white"
                    : isComplete
                      ? "bg-gold/20 text-gold"
                      : "bg-navy/5 text-navy/30"
                }`}
              >
                {isComplete ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`mt-1 hidden font-sans text-xs sm:block ${
                  isActive
                    ? "font-medium text-gold"
                    : isComplete
                      ? "text-gold/60"
                      : "text-navy/30"
                }`}
              >
                {label}
              </span>
            </div>
            {stepNum < totalSteps && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  isComplete ? "bg-gold/30" : "bg-navy/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
