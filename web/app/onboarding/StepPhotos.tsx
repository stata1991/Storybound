"use client";

import { useState, useRef } from "react";
import { uploadCharacterPhotos } from "./actions";

const MIN_PHOTOS = 8;
const MAX_PHOTOS = 15;

export default function StepPhotos({
  childName,
  childId,
  onComplete,
}: {
  childName: string;
  childId: string;
  onComplete?: () => void;
}) {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSubmit = photos.length >= MIN_PHOTOS && !loading;

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const valid: { file: File; preview: string }[] = [];
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png"].includes(file.type)) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      valid.push({ file, preview: URL.createObjectURL(file) });
    }

    setPhotos((prev) => [...prev, ...valid].slice(0, MAX_PHOTOS));
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    for (const p of photos) {
      formData.append("photos", p.file);
    }

    const result = await uploadCharacterPhotos(childId, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setLoading(false);
    onComplete?.();
  }

  return (
    <div>
      <p className="mb-4 font-sans text-sm leading-relaxed text-navy/50">
        Upload {MIN_PHOTOS}&ndash;{MAX_PHOTOS} clear photos so we can illustrate{" "}
        {childName.charAt(0).toUpperCase() + childName.slice(1)} in every scene.
      </p>

      <details className="mb-6 rounded-xl border border-gold/20 bg-gold/5">
        <summary className="cursor-pointer px-4 py-3 font-sans text-sm font-semibold text-navy/70 select-none">
          Better close-up photos = stronger likeness in the book
        </summary>
        <div className="grid gap-4 px-4 pb-4 pt-1 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 font-sans text-xs font-semibold uppercase tracking-wide text-green-700/70">
              Good photos
            </p>
            <ul className="space-y-1 font-sans text-xs leading-relaxed text-navy/50">
              <li>Close-up face shots &mdash; face fills most of the frame</li>
              <li>Multiple angles &mdash; front, slight left, slight right</li>
              <li>Varied lighting &mdash; indoors and outdoors</li>
              <li>Natural expressions &mdash; smiling, laughing, neutral</li>
              <li>Recent photos &mdash; within the last 6 months</li>
            </ul>
          </div>
          <div>
            <p className="mb-1.5 font-sans text-xs font-semibold uppercase tracking-wide text-red-600/70">
              Avoid
            </p>
            <ul className="space-y-1 font-sans text-xs leading-relaxed text-navy/50">
              <li>Full-body shots where face appears small</li>
              <li>Sunglasses, hats, or anything covering the face</li>
              <li>Blurry or heavily filtered photos</li>
              <li>Group photos</li>
            </ul>
          </div>
        </div>
      </details>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <div
            key={i}
            className="group relative aspect-square overflow-hidden rounded-xl border border-navy/10 bg-cream"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.preview}
              alt={`Photo ${i + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-navy/15 bg-cream transition-colors hover:border-gold/40 hover:bg-gold/5"
          >
            <div className="text-center">
              <svg
                className="mx-auto h-6 w-6 text-navy/25"
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
              <span className="mt-1 block font-sans text-xs text-navy/40">
                Add photos
              </span>
            </div>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      {/* Counter */}
      <p
        className={`mt-4 font-sans text-sm font-medium ${
          photos.length >= MIN_PHOTOS ? "text-green-600" : "text-amber-600"
        }`}
      >
        {photos.length} of {MIN_PHOTOS} minimum
        {photos.length >= MIN_PHOTOS && " \u2713"}
      </p>
      <p className="mt-1 font-sans text-xs text-navy/40">
        JPEG or PNG, up to 10MB each
      </p>

      {/* Submit */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
              Uploading photos...
            </span>
          ) : (
            "Begin our story \u2192"
          )}
        </button>
      </div>
    </div>
  );
}
