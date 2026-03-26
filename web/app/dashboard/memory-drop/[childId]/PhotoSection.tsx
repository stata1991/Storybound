"use client";

import { useRouter } from "next/navigation";
import MemoryPhotoUpload from "@/app/components/MemoryPhotoUpload";

export default function PhotoSection({
  childId,
  harvestId,
  photoCount,
  photoUrls,
}: {
  childId: string;
  harvestId: string;
  photoCount: number;
  photoUrls: string[];
}) {
  const router = useRouter();

  function handleComplete() {
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-warm md:p-8">
      <h3 className="mb-4 font-sans text-sm font-medium text-navy">Photos</h3>

      {photoCount === 0 ? (
        <>
          <p className="mb-1 font-sans text-sm text-navy/50">
            No photos added yet.
          </p>
          <p className="mb-4 font-sans text-xs text-navy/40">
            Add photos to help illustrate your book.
          </p>
          <MemoryPhotoUpload
            childId={childId}
            harvestId={harvestId}
            existingCount={0}
            onComplete={handleComplete}
          />
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-green-600"
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
            <span className="font-sans text-sm text-green-700">
              {photoCount} photo{photoCount !== 1 ? "s" : ""} added
            </span>
          </div>

          {/* Thumbnail grid */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photoUrls.map((url, i) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={url}
                alt={`Memory photo ${i + 1}`}
                className="h-20 w-full rounded-lg object-cover"
              />
            ))}
          </div>

          {/* Add more photos if under limit */}
          {photoCount < 5 && (
            <MemoryPhotoUpload
              childId={childId}
              harvestId={harvestId}
              existingCount={photoCount}
              onComplete={handleComplete}
            />
          )}
        </>
      )}
    </div>
  );
}
