"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateStory, triggerIllustrationPipeline, generateBook } from "@/app/admin/actions";

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
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
  );
}

function useElapsedTimer(running: boolean): string {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return;
    }

    startRef.current = Date.now();
    setSeconds(0);

    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function GenerateStoryButton({
  harvestId,
}: {
  harvestId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const elapsed = useElapsedTimer(loading);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setWarnings([]);

    const result = await generateStory(harvestId);

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    if (result.qualityWarnings.length > 0) {
      setWarnings(result.qualityWarnings);
    }

    setDone(true);
    router.refresh();
  }

  if (done && warnings.length === 0) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-green-600">
          Story generated successfully. Reloading...
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-left text-sm text-red-700">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 rounded bg-amber-50 px-4 py-3 text-left text-sm text-amber-700">
          <p className="font-medium">
            Story generated with quality warnings:
          </p>
          <ul className="mt-1 list-inside list-disc">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {!done && (
        <>
          <p className="mb-4 text-sm text-gray-400">
            No episode generated yet.
          </p>
          <button
            onClick={handleClick}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-teal-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Spinner />
                Generating story... {elapsed}
              </>
            ) : (
              "Generate story"
            )}
          </button>
          <p className="mt-2 text-xs text-gray-400">
            Takes 30-60 seconds (2 Claude API calls)
          </p>
        </>
      )}
    </div>
  );
}

/* ─── Run illustrations button ────────────────────────────────────────────── */

/* ─── Generate book button ───────────────────────────────────────────────── */

export function GenerateBookButton({
  harvestId,
}: {
  harvestId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const elapsed = useElapsedTimer(loading);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const result = await generateBook(harvestId);

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-green-600">
          Book generated successfully. Reloading...
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-left text-sm text-red-700">
          {error}
        </div>
      )}
      <p className="mb-4 text-sm text-gray-400">
        No book PDF generated yet.
      </p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-gray-800 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner />
            Generating book... {elapsed}
          </>
        ) : (
          "Generate book"
        )}
      </button>
      <p className="mt-2 text-xs text-gray-400">
        Takes 1-2 minutes
      </p>
    </div>
  );
}

/* ─── Run illustrations button ────────────────────────────────────────────── */

export function RunIllustrationsButton({
  harvestId,
}: {
  harvestId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const elapsed = useElapsedTimer(loading);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const result = await triggerIllustrationPipeline(harvestId);

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-green-600">
          Illustrations complete. Reloading...
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-left text-sm text-red-700">
          {error}
        </div>
      )}
      <p className="mb-4 text-sm text-gray-400">
        No illustrations generated yet.
      </p>
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner />
            Running illustrations... {elapsed}
          </>
        ) : (
          "Run illustrations"
        )}
      </button>
      <p className="mt-2 text-xs text-gray-400">
        Takes 5-10 minutes (face training + image generation)
      </p>
    </div>
  );
}
