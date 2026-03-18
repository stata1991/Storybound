"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  updateHarvestStatus,
  triggerIllustrationPipeline,
  generateBook,
  getPrintDetails,
  markSentToPrint,
  markShipped,
} from "../actions";
import type { HarvestRow as HarvestRowData } from "../actions";

/* ─── Status badge ─────────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
  printing: "bg-teal-100 text-teal-700",
  shipped: "bg-emerald-100 text-emerald-700",
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

/* ─── Print confirmation modal ─────────────────────────────────────────────── */

function PrintModal({
  details,
  onConfirm,
  onClose,
  confirming,
}: {
  details: {
    childName: string;
    childAge: number | null;
    shippingAddress: string | null;
    pdfUrl: string;
  };
  onConfirm: () => void;
  onClose: () => void;
  confirming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopyPdf() {
    navigator.clipboard.writeText(details.pdfUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">
          Send to print
        </h3>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-500">Child:</span>{" "}
            <span className="text-gray-900">
              {details.childName}
              {details.childAge != null && (
                <span className="ml-1 text-gray-400">
                  (age {details.childAge})
                </span>
              )}
            </span>
          </div>

          <div>
            <span className="font-medium text-gray-500">
              Shipping address:
            </span>
            {details.shippingAddress ? (
              <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
                {details.shippingAddress}
              </pre>
            ) : (
              <p className="mt-1 text-xs text-red-500">
                No address on file
              </p>
            )}
          </div>

          <div>
            <span className="font-medium text-gray-500">PDF link:</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                readOnly
                value={details.pdfUrl}
                className="flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyPdf}
                className="shrink-0 rounded bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <a
            href="https://dashboard.gelato.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            Open Gelato &rarr;
          </a>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="rounded bg-teal-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {confirming ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> Saving...
              </span>
            ) : (
              "Mark as sent to print"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function HarvestRow({ harvest }: { harvest: HarvestRowData }) {
  const [status, setStatus] = useState(harvest.status);
  const [illustrationStatus, setIllustrationStatus] = useState(
    harvest.illustrationStatus
  );
  const [episodeStatus, setEpisodeStatus] = useState(harvest.episodeStatus);
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

  // Print flow state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printDetails, setPrintDetails] = useState<{
    childName: string;
    childAge: number | null;
    shippingAddress: string | null;
    pdfUrl: string;
  } | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printSentAt, setPrintSentAt] = useState<string | null>(null);
  const [shippedAt, setShippedAt] = useState<string | null>(null);
  const [shipLoading, setShipLoading] = useState(false);

  // Double-click protection refs
  const printInFlight = useRef(false);
  const shipInFlight = useRef(false);

  const illustrationElapsed = useElapsedTimer(illustrationLoading);
  const bookElapsed = useElapsedTimer(bookLoading);
  const anyLoading =
    loading || illustrationLoading || bookLoading || printLoading || shipLoading;

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

  async function handleOpenPrintModal() {
    setError(null);
    setPrintLoading(true);

    const result = await getPrintDetails(harvest.id);

    if ("error" in result) {
      setError(result.error);
    } else {
      setPrintDetails(result);
      setShowPrintModal(true);
    }

    setPrintLoading(false);
  }

  async function handleConfirmPrint() {
    if (printInFlight.current) return;
    printInFlight.current = true;
    setPrintLoading(true);

    const result = await markSentToPrint(harvest.id);

    if ("error" in result) {
      setError(result.error);
    } else {
      setEpisodeStatus("printing");
      setPrintSentAt(result.sentAt);
      setShowPrintModal(false);
    }

    setPrintLoading(false);
    printInFlight.current = false;
  }

  async function handleMarkShipped() {
    if (shipInFlight.current) return;
    shipInFlight.current = true;
    setShipLoading(true);
    setError(null);

    const result = await markShipped(harvest.id);

    if ("error" in result) {
      setError(result.error);
    } else {
      setEpisodeStatus("shipped");
      setShippedAt(result.shippedAt);
    }

    setShipLoading(false);
    shipInFlight.current = false;
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

  // Show "Send to print" when book exists and episode is approved (not yet printing/shipped)
  const hasBook =
    harvest.printFilePath != null ||
    (typeof bookResult === "object" && bookResult !== null);
  const showPrintButton =
    hasBook &&
    episodeStatus !== "printing" &&
    episodeStatus !== "shipped";

  // Show "Mark as shipped" when episode is printing
  const showShipButton = episodeStatus === "printing";

  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
          {harvest.childName}
          {harvest.childAge != null && (
            <span className="ml-1 text-xs text-gray-400">
              ({harvest.childAge})
            </span>
          )}
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
          {episodeStatus === "printing" && (
            <>
              {" "}
              <StatusBadge status="printing" />
              {printSentAt && (
                <p className="mt-1 text-xs text-teal-600">
                  Sent{" "}
                  {new Date(printSentAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </>
          )}
          {episodeStatus === "shipped" && (
            <>
              {" "}
              <StatusBadge status="shipped" />
              {shippedAt && (
                <p className="mt-1 text-xs text-emerald-600">
                  Shipped{" "}
                  {new Date(shippedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </>
          )}
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
            {showPrintButton && (
              <button
                onClick={handleOpenPrintModal}
                disabled={anyLoading}
                className="rounded bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50"
              >
                {printLoading && !showPrintModal ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> Loading...
                  </span>
                ) : (
                  "Send to print"
                )}
              </button>
            )}
            {showShipButton && (
              <button
                onClick={handleMarkShipped}
                disabled={anyLoading || shipInFlight.current}
                className="rounded bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
              >
                {shipLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner /> Shipping...
                  </span>
                ) : (
                  "Mark as shipped"
                )}
              </button>
            )}
          </div>
        </td>
      </tr>

      {showPrintModal && printDetails && (
        <PrintModal
          details={printDetails}
          onConfirm={handleConfirmPrint}
          onClose={() => setShowPrintModal(false)}
          confirming={printLoading}
        />
      )}
    </>
  );
}
