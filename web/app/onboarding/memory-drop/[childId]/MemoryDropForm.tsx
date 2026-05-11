"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  submitOnboardingMemoryDrop,
  saveDraft,
  deleteDraft,
} from "../../actions";
import type { OnboardingDraftData } from "../../actions";
import MemoryPhotoUpload, {
  type MemoryPhotoUploadRef,
} from "@/app/components/MemoryPhotoUpload";

interface MemoryDropFormProps {
  childId: string;
  childName: string;
  harvestId: string;
  initialMilestone: string;
  initialNotes: string;
}

export default function MemoryDropForm({
  childId,
  childName,
  harvestId,
  initialMilestone,
  initialNotes,
}: MemoryDropFormProps) {
  const router = useRouter();

  const [milestone, setMilestone] = useState(initialMilestone);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const photoRef = useRef<MemoryPhotoUploadRef>(null);
  const submittingRef = useRef(false);

  // ── Hydration guard: don't save on initial mount ──────────────────────────
  const hasHydrated = useRef(false);
  useEffect(() => {
    hasHydrated.current = true;
  }, []);

  // ── Debounced draft save ──────────────────────────────────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraftMemoryDrop = useCallback(
    (currentMilestone: string, currentNotes: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        // Steps 1–3 form data is already persisted to DB rows by this point,
        // so we just overwrite the entire draft with memoryDrop fields.
        const data: OnboardingDraftData = {
          step: 0,
          isAdditional: false,
          form: { name: "", dateOfBirth: "", pronouns: "", readingLevel: "", interests: "", avoidances: "", defaultArchetype: "", parentFirstName: "", shippingName: "", addressLine1: "", addressLine2: "", city: "", state: "", zip: "", country: "" },
          memoryDrop: { milestone: currentMilestone, notes: currentNotes },
        };
        saveDraft(data, childId).catch((err) =>
          console.error("[draft] memory-drop save failed:", err)
        );
      }, 500);
    },
    [childId]
  );

  // ── Cleanup debounce timer on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Field handlers ────────────────────────────────────────────────────────
  const handleMilestoneChange = (value: string) => {
    setMilestone(value);
    if (hasHydrated.current) saveDraftMemoryDrop(value, notes);
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (hasHydrated.current) saveDraftMemoryDrop(milestone, value);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setLoading(true);

    // Flush debounce
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    try {
      // Upload optional photos first
      let photoPaths: { path: string; caption: string }[] | undefined;
      if (photoRef.current?.hasUnsavedPhotos()) {
        const uploadResult = await photoRef.current.upload();
        if (!uploadResult.success) {
          setError("Photo upload failed. Please try again.");
          setLoading(false);
          submittingRef.current = false;
          return;
        }
      }

      // Submit the memory drop
      const result = await submitOnboardingMemoryDrop(childId, {
        milestone,
        notes,
        photos: photoPaths,
      });

      if (result && "error" in result) {
        setError(result.error as string);
        setLoading(false);
        submittingRef.current = false;
        return;
      }

      // Clean up draft, then redirect
      await deleteDraft().catch((err) =>
        console.error("[draft] delete failed:", err)
      );

      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const name = childName
    ? childName.charAt(0).toUpperCase() + childName.slice(1)
    : "your child";

  return (
    <div className="space-y-6">
      <p className="font-sans text-sm leading-relaxed text-navy/50">
        Share a few things about {name}&rsquo;s world right now. These details
        bring their first story to life.
      </p>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Biggest milestone lately
        </label>
        <textarea
          value={milestone}
          onChange={(e) => handleMilestoneChange(e.target.value)}
          placeholder="Lost their first tooth, learned to ride a bike, started kindergarten..."
          rows={3}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Anything else we should know?{" "}
          <span className="font-normal text-navy/40">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="New sibling on the way, just moved to a new house, loves bedtime stories about..."
          rows={2}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
      </div>

      {/* Photo upload (optional) */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-navy/10" />
        <span className="font-sans text-xs font-medium text-navy/40">
          Add photos from this season (optional)
        </span>
        <div className="h-px flex-1 bg-navy/10" />
      </div>
      <p className="font-sans text-xs text-navy/40">
        These help us illustrate your child&rsquo;s world.
      </p>
      <MemoryPhotoUpload
        ref={photoRef}
        childId={childId}
        harvestId={harvestId}
        onComplete={() => {}}
      />
      <p className="text-center font-sans text-xs text-navy/30">
        Skip for now — you can add photos later from your dashboard.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!milestone || loading}
        className="w-full rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="inline-flex items-center justify-center gap-2">
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
            Submitting...
          </span>
        ) : (
          "Finish & start my story"
        )}
      </button>
    </div>
  );
}
