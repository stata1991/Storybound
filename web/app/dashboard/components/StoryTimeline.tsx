"use client";

import type { ChildWithHarvests } from "../actions";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getBirthdayDisplay(dob: string): string {
  const birth = new Date(dob + "T00:00:00");
  return birth.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface TimelineNode {
  quarter: number;
  label: string;
  shortLabel: string;
  sublabel?: string;
  state: "completed" | "current" | "upcoming";
}

/* ─── Build Nodes ──────────────────────────────────────────────────────────── */

function buildNodes(
  child: ChildWithHarvests,
  currentQuarter: number
): TimelineNode[] {
  const birthdayDisplay = getBirthdayDisplay(child.date_of_birth);

  const quarters: Omit<TimelineNode, "state">[] = [
    { quarter: 1, label: "Spring", shortLabel: "Q1" },
    { quarter: 2, label: "Summer", shortLabel: "Q2" },
    { quarter: 3, label: "Autumn", shortLabel: "Q3" },
    {
      quarter: 4,
      label: "Birthday",
      shortLabel: "Q4",
      sublabel: birthdayDisplay,
    },
  ];

  return quarters.map((q) => {
    // Check if this quarter has a delivered episode
    const episode = child.episodes.find((e) => e.quarter === q.quarter);
    const isDelivered = episode?.status === "delivered";

    // Check if this quarter's harvest is submitted/processing/complete
    const harvest = child.harvests.find((h) => h.quarter === q.quarter);
    const isCompleted =
      isDelivered ||
      harvest?.status === "complete";

    let state: TimelineNode["state"];
    if (isCompleted) {
      state = "completed";
    } else if (q.quarter === currentQuarter) {
      state = "current";
    } else {
      state = "upcoming";
    }

    return { ...q, state };
  });
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function StoryTimeline({
  child,
  currentQuarter,
}: {
  child: ChildWithHarvests;
  currentQuarter: number;
}) {
  const nodes = buildNodes(child, currentQuarter);

  return (
    <div className="mt-4 rounded-xl bg-cream-warm/50 px-4 py-5 md:px-6">
      <div className="flex items-center justify-between">
        {nodes.map((node, i) => (
          <div key={node.quarter} className="flex items-center flex-1 last:flex-none">
            {/* Node */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-sans text-xs font-semibold transition-colors ${
                  node.state === "completed"
                    ? "bg-gold text-white"
                    : node.state === "current"
                      ? "bg-gold text-white ring-4 ring-gold/20"
                      : "bg-navy/5 text-navy/30"
                }`}
              >
                {node.state === "completed" ? (
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
                ) : node.state === "current" ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                ) : (
                  node.shortLabel
                )}
              </div>
              <span
                className={`mt-1.5 font-sans text-[11px] sm:text-xs ${
                  node.state === "completed"
                    ? "font-medium text-gold"
                    : node.state === "current"
                      ? "font-medium text-gold"
                      : "text-navy/30"
                }`}
              >
                <span className="hidden sm:inline">{node.label}</span>
                <span className="sm:hidden">{node.shortLabel}</span>
              </span>
              {node.sublabel && (
                <span className="font-sans text-[10px] text-navy/30">
                  {node.sublabel}
                </span>
              )}
            </div>

            {/* Connector line */}
            {i < nodes.length - 1 && (
              <div
                className={`mx-1 h-px flex-1 sm:mx-2 ${
                  node.state === "completed" ? "bg-gold/30" : "bg-navy/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
