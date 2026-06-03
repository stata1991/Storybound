"use client";

import { useState } from "react";
import { regenerateIllustration } from "@/app/admin/actions";

interface RegenerateIllustrationButtonProps {
  harvestId: string;
  illustrationIndex: number;
  initialSignedUrl: string;
  label: string;
}

export function RegenerateIllustrationButton({
  harvestId,
  illustrationIndex,
  initialSignedUrl,
  label,
}: RegenerateIllustrationButtonProps) {
  const [signedUrl, setSignedUrl] = useState(initialSignedUrl);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegen() {
    setRegenerating(true);
    setError(null);
    try {
      const result = await regenerateIllustration(harvestId, illustrationIndex);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSignedUrl(result.signedUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regen failed");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={signedUrl}
        alt={label}
        className="aspect-square w-full rounded-lg object-cover"
      />
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <button
          type="button"
          onClick={handleRegen}
          disabled={regenerating}
          className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          {regenerating ? "Regen..." : "Regen"}
        </button>
      </div>
      {error && (
        <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
