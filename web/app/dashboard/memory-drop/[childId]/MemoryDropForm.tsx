"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createHarvestPhotoUploadUrls,
  submitHarvestMemory,
} from "./actions";
import type { ChildData, HarvestData } from "./actions";

/* ─── Constants ───────────────────────────────────────────────────────────── */

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 12;
const UPLOAD_CONCURRENCY = 3;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

const SEASON_LABELS: Record<string, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  birthday: "Birthday",
};

/** Upload items with a concurrency cap. Returns results in input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface PhotoSlot {
  file: File | null;
  caption: string;
  previewUrl: string | null;
  error: string | null;
}

function createEmptySlot(): PhotoSlot {
  return { file: null, caption: "", previewUrl: null, error: null };
}

/* ─── Photo Slot Component ─────────────────────────────────────────────────── */

function PhotoSlotCard({
  slot,
  index,
  disabled,
  onUpload,
  onRemove,
  onCaptionChange,
  onError,
}: {
  slot: PhotoSlot;
  index: number;
  disabled: boolean;
  onUpload: (index: number, file: File) => void;
  onRemove: (index: number) => void;
  onCaptionChange: (index: number, caption: string) => void;
  onError: (index: number, error: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!slot.file) {
    return (
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-navy/15 px-6 py-8 transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-gold/40"}`}
      >
        <svg
          className="mb-2 h-6 w-6 text-navy/20"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <p className="font-sans text-sm text-navy/40">
          <span className="font-medium text-gold">Click to add photo</span>
        </p>
        <p className="mt-0.5 font-sans text-xs text-navy/30">JPG or PNG</p>
        {slot.error && (
          <p className="mt-1.5 font-sans text-xs text-red-600">{slot.error}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && (file.type === "image/jpeg" || file.type === "image/png")) {
              if (file.size > 10 * 1024 * 1024) {
                onError(index, "Photo must be under 10MB.");
              } else {
                onError(index, null);
                onUpload(index, file);
              }
            }
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-navy/10 bg-cream-warm/30 p-4">
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.previewUrl || ""}
            alt={`Photo ${index + 1}`}
            className="h-16 w-16 rounded-lg object-cover"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[10px] text-white hover:bg-red-500"
            >
              &times;
            </button>
          )}
        </div>
        <div className="flex-1">
          <label className="mb-1 block font-sans text-xs font-medium text-navy/50">
            What&rsquo;s happening in this photo?
          </label>
          <input
            type="text"
            value={slot.caption}
            onChange={(e) =>
              onCaptionChange(index, e.target.value.slice(0, 150))
            }
            disabled={disabled}
            placeholder="Her first day of kindergarten..."
            className="w-full rounded-full border border-navy/15 bg-white px-4 py-2.5 font-sans text-sm text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
          />
          <span
            className={`mt-1 block text-right font-sans text-[10px] ${
              slot.caption.length > 130 ? "text-gold" : "text-navy/20"
            }`}
          >
            {slot.caption.length}/150
          </span>
          {slot.error && (
            <p className="mt-1 font-sans text-xs text-red-600">{slot.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function MemoryDropForm({
  child,
  harvest,
}: {
  child: ChildData;
  harvest: HarvestData;
}) {
  const router = useRouter();
  const displayName =
    child.name.charAt(0).toUpperCase() + child.name.slice(1);
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([createEmptySlot()]);
  const [milestone, setMilestone] = useState("");
  const [interests, setInterests] = useState("");
  const [archetype, setArchetype] = useState(child.default_archetype || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const submittingRef = useRef(false);

  const seasonLabel = SEASON_LABELS[harvest.season] || harvest.season;
  const daysLeft = daysUntil(harvest.window_closes_at);
  const closeDate = formatDate(harvest.window_closes_at);
  const uploadedCount = photoSlots.filter((s) => s.file !== null).length;

  const canSubmit = uploadedCount >= MIN_PHOTOS && !loading;

  /* ─── Photo handling ─────────────────────────────────────────────────────── */

  function handleSlotError(index: number, slotError: string | null) {
    setPhotoSlots((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], error: slotError };
      return updated;
    });
  }

  function handleUpload(index: number, file: File) {
    setPhotoSlots((prev) => {
      const updated = [...prev];
      updated[index] = {
        file,
        caption: prev[index].caption,
        previewUrl: URL.createObjectURL(file),
        error: null,
      };
      return updated;
    });
  }

  function handleRemove(index: number) {
    setPhotoSlots((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) return [createEmptySlot()];
      return updated;
    });
  }

  function handleCaptionChange(index: number, caption: string) {
    setPhotoSlots((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], caption, error: null };
      return updated;
    });
  }

  function addSlot() {
    if (photoSlots.length < MAX_PHOTOS) {
      setPhotoSlots((prev) => [...prev, createEmptySlot()]);
    }
  }

  /* ─── Submit ─────────────────────────────────────────────────────────────── */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submittingRef.current) return;

    setError(null);

    // ── Client-side validation ────────────────────────────────────────────
    if (uploadedCount < MIN_PHOTOS) {
      setError(`Please upload at least ${MIN_PHOTOS} photos.`);
      return;
    }

    // Check captions on all uploaded photos
    let hasMissingCaption = false;
    setPhotoSlots((prev) =>
      prev.map((slot) => {
        if (slot.file && !slot.caption.trim()) {
          hasMissingCaption = true;
          return { ...slot, error: "Please add a caption for this photo." };
        }
        return { ...slot, error: null };
      })
    );
    if (hasMissingCaption) return;

    if (!milestone.trim()) {
      setError("Please describe this season's milestone.");
      return;
    }
    if (!interests.trim()) {
      setError("Please share what they're into right now.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setProgress("");

    try {
      const filledSlots = photoSlots.filter((s) => s.file !== null);

      // Step A — get signed upload URLs (also cleans the folder)
      setProgress("Preparing uploads\u2026");
      const urlResult = await createHarvestPhotoUploadUrls(
        child.id,
        filledSlots.map((s) => ({
          name: s.file!.name,
          type: s.file!.type,
          size: s.file!.size,
        }))
      );

      if ("error" in urlResult) {
        setError(urlResult.error);
        return;
      }

      const { uploads } = urlResult;

      // Step B — upload each file directly to Supabase (max 3 concurrent)
      let completed = 0;
      const total = filledSlots.length;
      setProgress(`Uploading 0 of ${total}\u2026`);

      const results = await mapWithConcurrency(
        filledSlots,
        async (slot, i) => {
          const { signedUrl, storagePath } = uploads[i];

          const res = await fetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": slot.file!.type },
            body: slot.file!,
          });

          if (!res.ok) {
            throw new Error(`Upload failed (${res.status})`);
          }

          completed++;
          setProgress(`Uploading ${completed} of ${total}\u2026`);

          return { path: storagePath, caption: slot.caption };
        },
        UPLOAD_CONCURRENCY
      );

      // Step C — check for upload failures
      const succeeded: { path: string; caption: string }[] = [];
      const failedNames: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled") {
          succeeded.push(r.value);
        } else {
          failedNames.push(filledSlots[i].file!.name);
        }
      }

      if (failedNames.length > 0) {
        setError(
          `${failedNames.length} photo(s) failed: ${failedNames.join(", ")}. Tap retry to re-upload all photos.`
        );
        return;
      }

      // Step D — submit text fields + verified photo paths atomically
      setProgress("Saving your memory\u2026");
      const submitResult = await submitHarvestMemory(child.id, {
        textFields: {
          milestone,
          interests,
          character: archetype,
          notes,
        },
        photos: succeeded,
      });

      if ("error" in submitResult) {
        setError(submitResult.error);
        return;
      }

      // Success — navigate to dashboard
      router.push("/dashboard?submitted=true");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
      setProgress("");
      submittingRef.current = false;
    }
  }

  /* ─── Render ─────────────────────────────────────────────────────────────── */

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
        <Link
          href="/dashboard"
          className="font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          &larr; Back to dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-6 pb-16">
        {/* Page header */}
        <div className="py-6">
          <h1 className="font-serif text-2xl font-bold text-navy md:text-3xl">
            {child.name}&rsquo;s {seasonLabel} Memory Drop
          </h1>
          <p className="mt-2 font-sans text-sm text-navy/50">
            Window closes {closeDate} —{" "}
            <span className="font-medium text-gold">
              {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
            </span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="font-sans text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Field 1 — Photos */}
          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <p className="mb-1 font-sans text-base font-semibold text-navy/80">
              Help us illustrate {displayName}&apos;s story &#10024;
            </p>
            <p className="mb-4 font-sans text-sm leading-relaxed text-navy/50">
              Clear photos of {displayName} help us make them the hero of every page.
            </p>

            <div className="mb-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="rounded-xl border-2 border-green-400/50 bg-green-50/50 px-2 py-2.5 text-center">
                <span className="block text-xl leading-none">😊</span>
                <p className="mt-1.5 font-sans text-[11px] font-semibold text-green-700">Just their face</p>
                <p className="mt-0.5 font-sans text-[10px] leading-tight text-green-600/70">Face fills most of the frame</p>
              </div>
              <div className="rounded-xl border border-navy/8 bg-navy/[0.02] px-2 py-2.5 text-center">
                <span className="block text-xl leading-none">🧒</span>
                <p className="mt-1.5 font-sans text-[11px] font-semibold text-navy/50">Just your child</p>
                <p className="mt-0.5 font-sans text-[10px] leading-tight text-navy/35">No siblings, friends, or others</p>
              </div>
              <div className="rounded-xl border border-navy/8 bg-navy/[0.02] px-2 py-2.5 text-center">
                <span className="block text-xl leading-none">👓</span>
                <p className="mt-1.5 font-sans text-[11px] font-semibold text-navy/50">No glasses</p>
                <p className="mt-0.5 font-sans text-[10px] leading-tight text-navy/35">Sunglasses included</p>
              </div>
              <div className="rounded-xl border border-navy/8 bg-navy/[0.02] px-2 py-2.5 text-center">
                <span className="block text-xl leading-none">🧢</span>
                <p className="mt-1.5 font-sans text-[11px] font-semibold text-navy/50">Head visible</p>
                <p className="mt-0.5 font-sans text-[10px] leading-tight text-navy/35">No hats, hoods, or masks</p>
              </div>
              <div className="rounded-xl border border-navy/8 bg-navy/[0.02] px-2 py-2.5 text-center">
                <span className="block text-xl leading-none">☀️</span>
                <p className="mt-1.5 font-sans text-[11px] font-semibold text-navy/50">Sharp and bright</p>
                <p className="mt-0.5 font-sans text-[10px] leading-tight text-navy/35">Good lighting, no blur</p>
              </div>
            </div>

            <label className="mb-4 block font-sans text-sm font-medium text-navy">
              Photos
              <span className="ml-1 font-normal text-navy/40">
                {uploadedCount < MIN_PHOTOS
                  ? `${uploadedCount} of ${MIN_PHOTOS} minimum`
                  : uploadedCount < MAX_PHOTOS
                    ? `${uploadedCount} of ${MAX_PHOTOS} photos \u2713`
                    : `${uploadedCount} of ${MAX_PHOTOS} photos \u2713 (max reached)`}
              </span>
            </label>

            <div className="space-y-3">
              {photoSlots.map((slot, i) => (
                <PhotoSlotCard
                  key={i}
                  slot={slot}
                  index={i}
                  disabled={loading}
                  onUpload={handleUpload}
                  onRemove={handleRemove}
                  onCaptionChange={handleCaptionChange}
                  onError={handleSlotError}
                />
              ))}
            </div>

            {/* Add another photo */}
            {!loading &&
              uploadedCount > 0 &&
              uploadedCount === photoSlots.length &&
              photoSlots.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={addSlot}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-navy/15 py-2.5 font-sans text-sm text-navy/40 transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Add another photo
                </button>
              )}

            <p className="mt-4 font-sans text-xs text-navy/40">
              Processed on our private servers. Permanently deleted within 2
              hours.
            </p>
          </div>

          {/* Field 2 — Milestone */}
          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <label className="mb-2 block font-sans text-sm font-medium text-navy">
              What was their biggest moment this season?
            </label>
            <textarea
              value={milestone}
              onChange={(e) => setMilestone(e.target.value.slice(0, 500))}
              placeholder="Lost her first tooth, learned to ride a bike, started a new school..."
              rows={3}
              required
              disabled={loading}
              className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none disabled:opacity-50"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <p className="font-sans text-xs text-navy/40">
                This becomes the heart of their story.
              </p>
              <span
                className={`font-sans text-xs ${
                  milestone.length > 450 ? "text-gold" : "text-navy/30"
                }`}
              >
                {milestone.length}/500
              </span>
            </div>
          </div>

          {/* Field 3 — Interests */}
          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <label className="mb-2 block font-sans text-sm font-medium text-navy">
              What are they obsessed with right now?
            </label>
            <textarea
              value={interests}
              onChange={(e) => setInterests(e.target.value.slice(0, 300))}
              placeholder="Still dinosaurs, but now also space and building things..."
              rows={3}
              required
              disabled={loading}
              className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none disabled:opacity-50"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <p className="font-sans text-xs text-navy/40">
                Even small updates help us make the story feel current.
              </p>
              <span
                className={`font-sans text-xs ${
                  interests.length > 250 ? "text-gold" : "text-navy/30"
                }`}
              >
                {interests.length}/300
              </span>
            </div>
          </div>

          {/* Field 3.5 — Character archetype */}
          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <label className="mb-2 block font-sans text-sm font-medium text-navy">
              Their favourite character right now
              <span className="ml-1 font-normal text-navy/40">(optional)</span>
            </label>
            <input
              type="text"
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              placeholder="Elsa, Superman, a friendly dragon..."
              disabled={loading}
              className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm disabled:opacity-50"
            />
            <p className="mt-1.5 font-sans text-xs text-navy/40">
              We&rsquo;ll reimagine them as an original companion — no
              trademarked characters used.
            </p>
          </div>

          {/* Field 4 — Notable notes */}
          <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
            <label className="mb-2 block font-sans text-sm font-medium text-navy">
              Anything we should know?
              <span className="ml-1 font-normal text-navy/40">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="New baby sibling, big move, starting kindergarten..."
              disabled={loading}
              className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm disabled:opacity-50"
            />
            <p className="mt-1.5 font-sans text-xs text-navy/40">
              We&rsquo;ll handle it with care.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-gold py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {progress || "Uploading\u2026"}
              </span>
            ) : error ? (
              "Re-upload all \u2192"
            ) : (
              "Send this memory \u2192"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
