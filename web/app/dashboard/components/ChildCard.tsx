"use client";

import Link from "next/link";
import type { ChildWithHarvests } from "../actions";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ─── Status Types ─────────────────────────────────────────────────────────── */

type MemoryStatus =
  | { type: "OPEN"; daysLeft: number; childId: string }
  | { type: "UPCOMING"; opensDate: string }
  | { type: "SUBMITTED" }
  | { type: "BOOK_SHIPPED"; trackingNumber: string | null }
  | { type: "BOOK_DELIVERED" }
  | { type: "NO_DATA" };

function getMemoryStatus(
  child: ChildWithHarvests,
  currentQuarter: number
): MemoryStatus {
  const now = new Date();

  // Find harvest for the current quarter
  const harvest = child.harvests.find((h) => h.quarter === currentQuarter);

  // Check episode status for this quarter
  const episode = child.episodes.find((e) => e.quarter === currentQuarter);

  if (episode) {
    if (episode.status === "delivered") {
      return { type: "BOOK_DELIVERED" };
    }
    if (episode.status === "shipped") {
      return {
        type: "BOOK_SHIPPED",
        trackingNumber: episode.tracking_number,
      };
    }
  }

  if (harvest) {
    if (
      harvest.status === "submitted" ||
      harvest.status === "processing" ||
      harvest.status === "complete"
    ) {
      return { type: "SUBMITTED" };
    }

    // Harvest is pending — check if window is open
    if (harvest.window_opens_at && harvest.window_closes_at) {
      const opens = new Date(harvest.window_opens_at);
      const closes = new Date(harvest.window_closes_at);

      if (now >= opens && now <= closes) {
        return {
          type: "OPEN",
          daysLeft: daysUntil(harvest.window_closes_at),
          childId: child.id,
        };
      }

      if (now < opens) {
        return { type: "UPCOMING", opensDate: harvest.window_opens_at };
      }
    }
  }

  return { type: "NO_DATA" };
}

/* ─── Season Label ─────────────────────────────────────────────────────────── */

const SEASON_LABELS: Record<number, string> = {
  1: "Spring Chapter",
  2: "Summer Chapter",
  3: "Autumn Chapter",
  4: "Birthday Chapter",
};

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function ChildCard({
  child,
  currentQuarter,
}: {
  child: ChildWithHarvests;
  currentQuarter: number;
}) {
  const age = calculateAge(child.date_of_birth);
  const status = getMemoryStatus(child, currentQuarter);
  const seasonLabel = SEASON_LABELS[currentQuarter] ?? "Current Chapter";

  return (
    <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-serif text-xl font-bold text-navy">
            {child.name}
            <span className="text-navy/40">, age {age}</span>
          </h3>
          <p className="mt-1 font-sans text-sm text-navy/50">{seasonLabel}</p>
        </div>
        <Link
          href={`/dashboard/edit/${child.id}`}
          className="font-sans text-xs text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          Edit profile
        </Link>
      </div>

      {/* Status */}
      <div className="mt-6">
        <StatusDisplay status={status} />
      </div>
    </div>
  );
}

/* ─── Status Display ───────────────────────────────────────────────────────── */

function StatusDisplay({ status }: { status: MemoryStatus }) {
  switch (status.type) {
    case "OPEN":
      return (
        <div className="flex items-center justify-between rounded-xl bg-gold/5 border border-gold/20 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-gold" />
            </span>
            <div>
              <p className="font-sans text-sm font-medium text-navy">
                Memory drop open
              </p>
              <p className="font-sans text-xs text-gold">
                {status.daysLeft} day{status.daysLeft !== 1 ? "s" : ""} left
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/memory-drop/${status.childId}`}
            className="rounded-full bg-gold px-5 py-2 font-sans text-sm font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
          >
            Submit
          </Link>
        </div>
      );

    case "UPCOMING":
      return (
        <div className="flex items-center gap-3 rounded-xl bg-navy/[0.02] border border-navy/10 px-5 py-4">
          <span className="inline-flex h-3 w-3 rounded-full bg-navy/15" />
          <div>
            <p className="font-sans text-sm font-medium text-navy/60">
              Next memory drop
            </p>
            <p className="font-sans text-xs text-navy/40">
              Opens {formatDate(status.opensDate)}
            </p>
          </div>
        </div>
      );

    case "SUBMITTED":
      return (
        <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-5 py-4">
          <svg
            className="h-5 w-5 text-green-600"
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
          <p className="font-sans text-sm font-medium text-green-700">
            Memory submitted — your book is being crafted
          </p>
        </div>
      );

    case "BOOK_SHIPPED":
      return (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-sans text-lg">📦</span>
            <p className="font-sans text-sm font-medium text-blue-700">
              Your book is on its way
            </p>
          </div>
          {status.trackingNumber && (
            <span className="font-sans text-xs text-blue-500 underline">
              {status.trackingNumber}
            </span>
          )}
        </div>
      );

    case "BOOK_DELIVERED":
      return (
        <div className="flex items-center gap-3 rounded-xl bg-gold/5 border border-gold/20 px-5 py-4">
          <span className="font-sans text-lg text-gold">★</span>
          <p className="font-sans text-sm font-medium text-gold">
            Book delivered
          </p>
        </div>
      );

    case "NO_DATA":
      return (
        <div className="flex items-center gap-3 rounded-xl bg-navy/[0.02] border border-navy/10 px-5 py-4">
          <span className="inline-flex h-3 w-3 rounded-full bg-navy/15" />
          <p className="font-sans text-sm text-navy/40">
            Your first memory drop is coming soon
          </p>
        </div>
      );
  }
}
