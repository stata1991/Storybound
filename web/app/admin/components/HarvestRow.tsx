"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  updateHarvestStatus,
  triggerIllustrationPipeline,
  generateBook,
} from "../actions";
import type { HarvestRow as HarvestRowData } from "../actions";

/* ─── Status badge ─────────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

/* ─── Spinner SVG ──────────────────────────────────────────────────────────── */

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

/* ─── Elapsed timer hook ───────────────────────────────────────────────────── */

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

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function HarvestRow({ harvest }: { harvest: HarvestRowData }) {
  const [status, setStatus] = useState(harvest.status);
  const [illustrationStatus, setIllustrationStatus] = useState(
    harvest.illustrationStatus
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Illustration pipeline state
  const [illustrationLoading, setIllustrationLoading] = useState(false);
  const [illustrationResult, setIllustrationResult] = useState<
    null | "success" | string
  >(null);

  // Book generation state
  const [bookLoading, setBookLoading] = useState(false);
  const [bookResult, setBookResult] = useState<
    null | { success: true; downloadUrl: string } | string
  >(null);

  const illustrationElapsed = useElapsedTimer(illustrationLoading);
  const bookElapsed = useElapsedTimer(bookLoading);
  const anyLoading = loading || illustrationLoading || bookLoading;

  async function handleTransition(newStatus: string) {
    setError(null);
    const prevStatus = status;
    setStatus(newStatus); // optimistic
    setLoading(true);

    const result = await updateHarvestStatus(harvest.id, newStatus);

    if ("error" in result) {
      setStatus(prevStatus); // revert
      setError(result.error);
    }

    setLoading(false);
  }

  async function handleRunIllustrations() {
    setError(null);
    setIllustrationResult(null);
    setIllustrationLoading(true);

    const result = await triggerIllustrationPipeline(harvest.id);

    if ("error" in result) {
      setIllustrationResult(result.error);
    } else {
      setIllustrationResult("success");
      setIllustrationStatus("review");
      setStatus("complete");
    }

    setIllustrationLoading(false);
  }

  async function handleGenerateBook() {
    setError(null);
    setBookResult(null);
    setBookLoading(true);

    const result = await generateBook(harvest.id);

    if ("error" in result) {
      setBookResult(result.error);
    } else {
      setBookResult({ success: true, downloadUrl: result.downloadUrl });
    }

    setBookLoading(false);
  }

  const formattedDate = harvest.submittedAt
    ? new Date(harvest.submittedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "\u2014";

  const showBookButton =
    illustrationStatus === "review" || illustrationResult === "success";

  return (
    <tr className="border-t border-gray-100">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
        {harvest.childName}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {harvest.parentEmail}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 capitalize">
        {harvest.season}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {formattedDate}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 text-center">
        {harvest.photoCount}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <StatusBadge status={status} />
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
        {illustrationResult && illustrationResult !== "success" && (
          <p className="mt-1 text-xs text-red-500">{illustrationResult}</p>
        )}
        {illustrationResult === "success" && (
          <p className="mt-1 text-xs text-green-600">Illustrations ready</p>
        )}
        {typeof bookResult === "string" && (
          <p className="mt-1 text-xs text-red-500">{bookResult}</p>
        )}
        {typeof bookResult === "object" && bookResult !== null && (
          <p className="mt-1 text-xs text-green-600">
            Book ready &mdash;{" "}
            <a
              href={bookResult.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-green-800"
            >
              Download PDF
            </a>
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/harvest/${harvest.id}`}
            className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800"
          >
            View
          </Link>
          {status === "submitted" && (
            <button
              onClick={() => handleTransition("processing")}
              disabled={anyLoading}
              className="rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              {loading ? "..." : "Mark processing"}
            </button>
          )}
          {status === "processing" && (
            <>
              <button
                onClick={handleRunIllustrations}
                disabled={anyLoading}
                className="rounded bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50"
              >
                {illustrationLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner />
                    Running... {illustrationElapsed}
                  </span>
                ) : (
                  "Run illustrations"
                )}
              </button>
              <button
                onClick={() => handleTransition("complete")}
                disabled={anyLoading}
                className="rounded bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
              >
                {loading ? "..." : "Mark complete"}
              </button>
            </>
          )}
          {showBookButton && (
            <button
              onClick={handleGenerateBook}
              disabled={anyLoading}
              className="rounded bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              {bookLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner />
                  Generating... {bookElapsed}
                </span>
              ) : (
                "Generate book"
              )}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
