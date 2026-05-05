"use client";

import {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import {
  addHarvestPhotos,
  confirmAddedHarvestPhotos,
} from "@/app/dashboard/actions";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface PhotoSlot {
  file: File | null;
  caption: string;
  previewUrl: string | null;
  error: string | null;
  /** Set after successful upload — means this file is in the bucket */
  uploadedPath: string | null;
}

function createEmptySlot(): PhotoSlot {
  return { file: null, caption: "", previewUrl: null, error: null, uploadedPath: null };
}

export interface MemoryPhotoUploadRef {
  upload(): Promise<{ success: boolean; count: number }>;
  hasUnsavedPhotos(): boolean;
}

interface MemoryPhotoUploadProps {
  childId: string;
  harvestId: string;
  existingCount?: number;
  maxPhotos?: number;
  onComplete: (count: number) => void;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const UPLOAD_CONCURRENCY = 3;

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

/* ─── Photo Slot Component ─────────────────────────────────────────────────── */

function PhotoSlotCard({
  slot,
  index,
  onUpload,
  onRemove,
  onCaptionChange,
  onError,
  disabled,
}: {
  slot: PhotoSlot;
  index: number;
  onUpload: (index: number, file: File) => void;
  onRemove: (index: number) => void;
  onCaptionChange: (index: number, caption: string) => void;
  onError: (index: number, error: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!slot.file) {
    return (
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-navy/15 px-6 py-8 transition-colors hover:border-gold/40 ${disabled ? "pointer-events-none opacity-50" : ""}`}
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
            if (
              file &&
              (file.type === "image/jpeg" || file.type === "image/png")
            ) {
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
    <div className={`rounded-xl border border-navy/10 bg-cream-warm/30 p-4 ${slot.uploadedPath ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slot.previewUrl || ""}
            alt={`Photo ${index + 1}`}
            className="h-16 w-16 rounded-lg object-cover"
          />
          {!disabled && !slot.uploadedPath && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[10px] text-white hover:bg-red-500"
            >
              &times;
            </button>
          )}
          {slot.uploadedPath && (
            <div className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] text-white">
              &#10003;
            </div>
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
            placeholder="Her first day of kindergarten..."
            disabled={disabled}
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

/* ─── Main Component ──────────────────────────────────────────────────────── */

const MemoryPhotoUpload = forwardRef<
  MemoryPhotoUploadRef,
  MemoryPhotoUploadProps
>(function MemoryPhotoUpload(
  { childId, harvestId, existingCount = 0, maxPhotos = 5, onComplete },
  ref
) {
  const availableSlots = maxPhotos - existingCount;
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([
    createEmptySlot(),
  ]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [hasFailedUploads, setHasFailedUploads] = useState(false);
  const submittingRef = useRef(false);

  const uploadedCount = photoSlots.filter((s) => s.file !== null).length;

  const doUpload = useCallback(async (): Promise<{
    success: boolean;
    count: number;
  }> => {
    if (submittingRef.current) return { success: false, count: 0 };

    // Determine which slots need uploading (files without an uploadedPath)
    const pendingSlots = photoSlots.filter(
      (s) => s.file !== null && !s.uploadedPath
    );

    if (pendingSlots.length === 0) {
      // All files already uploaded — just confirm
      const alreadyUploaded = photoSlots.filter((s) => s.uploadedPath !== null);
      if (alreadyUploaded.length === 0) {
        return { success: true, count: existingCount };
      }
      // Fall through to confirm step
    }

    // Validate captions on all pending slots
    let hasMissing = false;
    setPhotoSlots((prev) =>
      prev.map((slot) => {
        if (slot.file && !slot.uploadedPath && !slot.caption.trim()) {
          hasMissing = true;
          return { ...slot, error: "Please add a caption for this photo." };
        }
        return { ...slot, error: null };
      })
    );
    if (hasMissing) return { success: false, count: 0 };

    submittingRef.current = true;
    setUploading(true);
    setError(null);
    setSuccessCount(null);
    setHasFailedUploads(false);
    setProgress(null);

    try {
      // ── Step A: Get signed URLs for pending files ──────────────────────
      const slotsToUpload = photoSlots.filter(
        (s) => s.file !== null && !s.uploadedPath
      );

      const newlyUploaded: { slotIndex: number; path: string; caption: string }[] = [];

      if (slotsToUpload.length > 0) {
        setProgress("Preparing upload\u2026");

        const fileMetadata = slotsToUpload.map((s) => ({
          name: s.file!.name,
          type: s.file!.type,
          size: s.file!.size,
        }));

        const urlResult = await addHarvestPhotos(childId, harvestId, fileMetadata);

        if ("error" in urlResult) {
          setError(urlResult.error);
          return { success: false, count: 0 };
        }

        const { uploads } = urlResult;

        // Map slotsToUpload back to their indices in photoSlots
        const slotIndices: number[] = [];
        for (let i = 0; i < photoSlots.length; i++) {
          if (photoSlots[i].file !== null && !photoSlots[i].uploadedPath) {
            slotIndices.push(i);
          }
        }

        // ── Step B: Upload files directly to Supabase (max 3 concurrent) ──
        let completed = 0;
        const total = slotsToUpload.length;
        setProgress(`Uploading 0 of ${total}\u2026`);

        const results = await mapWithConcurrency(
          slotsToUpload,
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

            return { slotIndex: slotIndices[i], path: storagePath, caption: slot.caption };
          },
          UPLOAD_CONCURRENCY
        );

        // ── Step C: Handle per-file results ─────────────────────────────────
        const failedIndices: number[] = [];

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled") {
            newlyUploaded.push(r.value);
          } else {
            failedIndices.push(slotIndices[i]);
          }
        }

        // Mark successful uploads in slot state
        if (newlyUploaded.length > 0) {
          setPhotoSlots((prev) => {
            const updated = [...prev];
            for (const item of newlyUploaded) {
              updated[item.slotIndex] = {
                ...updated[item.slotIndex],
                uploadedPath: item.path,
                error: null,
              };
            }
            // Mark failed ones with error
            for (const idx of failedIndices) {
              updated[idx] = {
                ...updated[idx],
                error: "Upload failed. Tap retry to try again.",
              };
            }
            return updated;
          });
        }

        if (failedIndices.length > 0) {
          setHasFailedUploads(true);
          setError(
            `${failedIndices.length} photo(s) failed to upload. Tap "Re-upload failed photos" to retry.`
          );
          setProgress(null);
          return { success: false, count: 0 };
        }
      }

      // ── Step D: Confirm all uploaded photos ─────────────────────────────
      // Gather all photos that have been uploaded (both previously + newly)
      const allUploaded: { path: string; caption: string }[] = [];

      // Get the latest slot state
      const currentSlots = newlyUploaded.length > 0
        ? photoSlots.map((slot, i) => {
            const found = newlyUploaded.find((u) => u.slotIndex === i);
            if (found) return { ...slot, uploadedPath: found.path };
            return slot;
          })
        : photoSlots;

      for (const slot of currentSlots) {
        if (slot.uploadedPath) {
          allUploaded.push({ path: slot.uploadedPath, caption: slot.caption });
        }
      }

      if (allUploaded.length === 0) {
        return { success: true, count: existingCount };
      }

      setProgress("Saving photos\u2026");

      const confirmResult = await confirmAddedHarvestPhotos(
        childId,
        harvestId,
        allUploaded
      );

      if ("error" in confirmResult) {
        setError(confirmResult.error);
        return { success: false, count: 0 };
      }

      // Success — reset slots
      setSuccessCount(confirmResult.photoCount);
      setPhotoSlots([createEmptySlot()]);
      setProgress(null);
      onComplete(confirmResult.photoCount);
      return { success: true, count: confirmResult.photoCount };
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      return { success: false, count: 0 };
    } finally {
      submittingRef.current = false;
      setUploading(false);
      setProgress(null);
    }
  }, [photoSlots, childId, harvestId, existingCount, onComplete]);

  // Expose ref methods for parent components
  useImperativeHandle(
    ref,
    () => ({
      upload: doUpload,
      hasUnsavedPhotos: () =>
        photoSlots.some((s) => s.file !== null && !s.uploadedPath),
    }),
    [doUpload, photoSlots]
  );

  /* ─── Photo slot handlers ─────────────────────────────────────────────── */

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
        uploadedPath: null,
      };
      return updated;
    });
    setSuccessCount(null);
    setHasFailedUploads(false);
    setError(null);
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
    if (photoSlots.length < availableSlots) {
      setPhotoSlots((prev) => [...prev, createEmptySlot()]);
    }
  }

  if (availableSlots <= 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Success */}
      {successCount !== null && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="font-sans text-sm text-green-700">
            Photos saved! {successCount} of {maxPhotos} total.
          </p>
        </div>
      )}

      {/* Photo label */}
      <label className="block font-sans text-sm font-medium text-navy">
        Photos
        <span className="ml-1 font-normal text-navy/40">
          {existingCount + uploadedCount} of {maxPhotos} photos
        </span>
      </label>

      {/* Slots */}
      {photoSlots.map((slot, i) => (
        <PhotoSlotCard
          key={i}
          slot={slot}
          index={i}
          onUpload={handleUpload}
          onRemove={handleRemove}
          onCaptionChange={handleCaptionChange}
          onError={handleSlotError}
          disabled={uploading}
        />
      ))}

      {/* Add another photo button */}
      {uploadedCount > 0 &&
        uploadedCount === photoSlots.length &&
        photoSlots.length < availableSlots && (
          <button
            type="button"
            onClick={addSlot}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-navy/15 py-2.5 font-sans text-sm text-navy/40 transition-colors hover:border-gold/40 hover:text-gold disabled:pointer-events-none disabled:opacity-50"
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

      {/* Re-upload failed photos button */}
      {hasFailedUploads && !uploading && (
        <button
          type="button"
          onClick={doUpload}
          className="w-full rounded-full border-2 border-gold bg-white py-3 font-sans text-sm font-semibold text-gold shadow-warm transition-all hover:bg-gold hover:text-white"
        >
          Re-upload failed photos
        </button>
      )}

      {/* Save button */}
      {uploadedCount > 0 && !hasFailedUploads && (
        <button
          type="button"
          onClick={doUpload}
          disabled={uploading}
          className="w-full rounded-full bg-gold py-3 font-sans text-sm font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
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
          ) : (
            "Save photos"
          )}
        </button>
      )}

      <p className="font-sans text-xs text-navy/40">
        Processed on our private servers. Permanently deleted within 2 hours.
      </p>
    </div>
  );
});

export default MemoryPhotoUpload;
