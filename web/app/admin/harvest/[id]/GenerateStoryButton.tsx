"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  generateStory,
  updateHarvestStatus,
  forceResetStuckHarvest,
  getPrintDetails,
  markSentToPrint,
  markShipped,
  placeProdigiOrder,
  resetToBookReady,
} from "@/app/admin/actions";

/* ─── Shared UI ───────────────────────────────────────────────────────────── */

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

/* ─── Mark Processing button ──────────────────────────────────────────────── */

export function MarkProcessingButton({ harvestId }: { harvestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const result = await updateHarvestStatus(harvestId, "processing");

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner /> Updating...
          </>
        ) : (
          "Mark as processing"
        )}
      </button>
    </div>
  );
}

/* ─── Generate Story button ───────────────────────────────────────────────── */

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
      <p className="text-sm font-medium text-green-600">
        Story generated successfully. Reloading...
      </p>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 rounded bg-amber-50 px-4 py-3 text-sm text-amber-700">
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

/* ─── Run Illustrations button ────────────────────────────────────────────── */

export function RunIllustrationsButton({
  harvestId,
}: {
  harvestId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<"idle" | "training" | "generating">(
    "idle"
  );
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);
  const elapsed = useElapsedTimer(loading);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function pollHarvestStatus() {
    try {
      const res = await fetch(
        `/api/admin/harvest-status?harvestId=${harvestId}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { status: string };

      if (data.status === "processing" && phase === "training") {
        // Training done, generation now running — update phase
        setPhase("generating");
      }

      if (data.status === "complete") {
        // Everything done — stop polling
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setDone(true);
        setLoading(false);
        setPhase("idle");
        router.refresh();
      }
    } catch {
      // Polling failures are non-blocking
    }
  }

  async function handleClick() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setPhase("training");

    try {
      const res = await fetch("/api/admin/generate-illustrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ harvestId }),
      });

      const result = await res.json();

      if (res.status === 202) {
        // Async operation started — poll for completion
        const asyncPhase = result.status === "generating" ? "generating" : "training";
        setPhase(asyncPhase);
        if (result.message) setTrainingMessage(result.message);
        pollRef.current = setInterval(pollHarvestStatus, 15_000);
        inFlightRef.current = false;
        return;
      }

      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        setPhase("idle");
        inFlightRef.current = false;
        return;
      }

      // Synchronous completion (skip-lora path)
      setDone(true);
      setLoading(false);
      setPhase("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setLoading(false);
      setPhase("idle");
    }

    inFlightRef.current = false;
  }

  if (done) {
    return (
      <p className="text-sm font-medium text-green-600">
        Illustrations complete. Reloading...
      </p>
    );
  }

  const phaseLabel =
    phase === "training"
      ? "Training face model... "
      : phase === "generating"
        ? "Generating illustrations... "
        : "Running illustrations... ";

  return (
    <div>
      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {phase === "training" && (
        <div className="mb-4 rounded bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          <p className="font-medium">LoRA face training in progress</p>
          <p className="mt-1 text-xs text-indigo-500">
            {trainingMessage ?? "Illustrations will generate automatically when training completes."}{" "}
            Polling every 15s.
          </p>
        </div>
      )}
      {phase === "generating" && (
        <div className="mb-4 rounded bg-violet-50 px-4 py-3 text-sm text-violet-700">
          <p className="font-medium">Generating illustrations</p>
          <p className="mt-1 text-xs text-violet-500">
            {trainingMessage ?? "Illustrations are being generated in the background."}{" "}
            Polling every 15s.
          </p>
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner />
            {phaseLabel}
            {elapsed}
          </>
        ) : (
          "Run illustrations"
        )}
      </button>
      <p className="mt-2 text-xs text-gray-400">
        Training ~10 min, then illustrations ~5 min
      </p>
    </div>
  );
}

/* ─── Generate Book button ────────────────────────────────────────────────── */

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

    try {
      const res = await fetch("/api/admin/generate-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ harvestId }),
      });

      const result = await res.json();

      if ("error" in result) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }

    setLoading(false);
  }

  if (done) {
    return (
      <p className="text-sm font-medium text-green-600">
        Book generated successfully. Reloading...
      </p>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner />
            Building PDF... {elapsed}
          </>
        ) : (
          "Generate book"
        )}
      </button>
      <p className="mt-2 text-xs text-gray-400">Takes ~30 seconds</p>
    </div>
  );
}

/* ─── Reset to Book Ready button ──────────────────────────────────────────── */

export function ResetToBookReadyButton({
  harvestId,
}: {
  harvestId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    const result = await resetToBookReady(harvestId);

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner /> Resetting...
          </>
        ) : (
          "Reset to book ready"
        )}
      </button>
    </div>
  );
}

/* ─── Force-reset stuck harvest ──────────────────────────────────────────── */

export function ForceResetStuckButton({
  harvestId,
}: {
  harvestId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "This will reset the harvest to 'submitted' state, clearing face_ref_generated and face_ref_path. " +
        "You will need to re-run training from scratch. Continue?"
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    const result = await forceResetStuckHarvest(harvestId);

    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
      >
        {loading ? (
          <>
            <Spinner /> Resetting...
          </>
        ) : (
          "Reset and retry training"
        )}
      </button>
    </div>
  );
}

/* ─── Print flow (send to print + mark shipped) ──────────────────────────── */

export function PrintFlowButtons({
  harvestId,
  episodeStatus,
}: {
  harvestId: string;
  episodeStatus: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Print modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printDetails, setPrintDetails] = useState<{
    childName: string;
    childAge: number | null;
    shippingAddress: string | null;
    pdfUrl: string;
    episodeId: string;
    shipping: {
      name: string | null;
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      country: string | null;
    } | null;
  } | null>(null);
  const [printLoading, setPrintLoading] = useState(false);

  // Prodigi order modal state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({
    name: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    shippingMethod: "Budget",
  });
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<{
    prodigiOrderId: string;
    issues?: unknown[];
    adopted?: boolean;
  } | null>(null);
  const orderInFlight = useRef(false);

  // Ship state
  const [shipLoading, setShipLoading] = useState(false);

  // Refs for double-click protection
  const printInFlight = useRef(false);
  const shipInFlight = useRef(false);

  async function handleOpenPrintModal() {
    setError(null);
    setPrintLoading(true);

    const result = await getPrintDetails(harvestId);

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

    const result = await markSentToPrint(harvestId);

    if ("error" in result) {
      setError(result.error);
    } else {
      setShowPrintModal(false);
      router.refresh();
    }

    setPrintLoading(false);
    printInFlight.current = false;
  }

  async function handleOpenOrderModal() {
    setError(null);
    setOrderError(null);
    setOrderResult(null);
    setOrderLoading(true);

    const result = await getPrintDetails(harvestId);

    if ("error" in result) {
      setError(result.error);
    } else {
      setPrintDetails(result);
      const s = result.shipping;
      setOrderForm((prev) => ({
        ...prev,
        name: s?.name ?? "",
        line1: s?.line1 ?? "",
        line2: s?.line2 ?? "",
        city: s?.city ?? "",
        state: s?.state ?? "",
        zip: s?.zip ?? "",
        country: s?.country ?? "US",
      }));
      setShowOrderModal(true);
    }

    setOrderLoading(false);
  }

  async function handlePlaceOrder() {
    if (orderInFlight.current || !printDetails) return;
    orderInFlight.current = true;
    setOrderLoading(true);
    setOrderError(null);

    const result = await placeProdigiOrder(
      printDetails.episodeId,
      {
        name: orderForm.name.trim(),
        address: {
          line1: orderForm.line1.trim(),
          line2: orderForm.line2.trim() || undefined,
          postalOrZipCode: orderForm.zip.trim(),
          countryCode: orderForm.country.trim(),
          townOrCity: orderForm.city.trim(),
          stateOrCounty: orderForm.state.trim() || undefined,
        },
      },
      orderForm.shippingMethod
    );

    if ("error" in result) {
      setOrderError(result.error);
    } else {
      setOrderResult({
        prodigiOrderId: result.prodigiOrderId,
        issues: result.issues,
        adopted: result.adopted,
      });
      router.refresh();
    }

    setOrderLoading(false);
    orderInFlight.current = false;
  }

  async function handleMarkShipped() {
    if (shipInFlight.current) return;
    shipInFlight.current = true;
    setShipLoading(true);
    setError(null);

    const result = await markShipped(harvestId);

    if ("error" in result) {
      setError(result.error);
    } else {
      router.refresh();
    }

    setShipLoading(false);
    shipInFlight.current = false;
  }

  const [copied, setCopied] = useState(false);

  function handleCopyPdf() {
    if (printDetails) {
      navigator.clipboard.writeText(printDetails.pdfUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {episodeStatus === "parent_approved" && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenOrderModal}
            disabled={orderLoading}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {orderLoading && !showOrderModal ? (
              <>
                <Spinner /> Loading...
              </>
            ) : (
              "Order from Prodigi"
            )}
          </button>
          <details className="ml-1">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
              Manual fallback
            </summary>
            <button
              onClick={handleOpenPrintModal}
              disabled={printLoading}
              className="mt-2 inline-flex items-center gap-2 rounded-md bg-teal-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-600 disabled:opacity-60"
            >
              {printLoading && !showPrintModal ? (
                <>
                  <Spinner /> Loading...
                </>
              ) : (
                "Send to print"
              )}
            </button>
          </details>
        </div>
      )}

      {episodeStatus === "printing" && (
        <button
          onClick={handleMarkShipped}
          disabled={shipLoading}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
        >
          {shipLoading ? (
            <>
              <Spinner /> Shipping...
            </>
          ) : (
            "Mark as shipped"
          )}
        </button>
      )}

      {/* Prodigi order modal */}
      {showOrderModal && printDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !orderLoading) setShowOrderModal(false);
          }}
        >
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              Order from Prodigi
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              {printDetails.childName}
              {printDetails.childAge != null && ` (age ${printDetails.childAge})`}
              {" — 1 copy, hardcover 21×21cm"}
            </p>

            {orderResult ? (
              <div className="mt-4 space-y-3 text-sm">
                {orderResult.adopted ? (
                  <div className="rounded bg-amber-50 px-4 py-3 text-amber-800">
                    An earlier submission for this book already reached Prodigi
                    (
                    <span className="font-mono font-medium">
                      {orderResult.prodigiOrderId}
                    </span>
                    ) — it will print with the address from that attempt.
                  </div>
                ) : (
                  <div className="rounded bg-emerald-50 px-4 py-3 text-emerald-700">
                    Order placed:{" "}
                    <span className="font-mono font-medium">
                      {orderResult.prodigiOrderId}
                    </span>
                  </div>
                )}
                {orderResult.issues && orderResult.issues.length > 0 && (
                  <div className="rounded bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    <p className="mb-1 font-medium">Created with issues:</p>
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(orderResult.issues, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowOrderModal(false)}
                    className="rounded bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ["name", "Recipient name", "col-span-2"],
                      ["line1", "Address line 1", "col-span-2"],
                      ["line2", "Address line 2 (optional)", "col-span-2"],
                      ["city", "City", ""],
                      ["state", "State", ""],
                      ["zip", "ZIP / postal code", ""],
                      ["country", "Country code", ""],
                    ] as const
                  ).map(([key, label, span]) => (
                    <label key={key} className={`block ${span}`}>
                      <span className="mb-1 block text-xs font-medium text-gray-500">
                        {label}
                      </span>
                      <input
                        value={orderForm[key]}
                        onChange={(e) =>
                          setOrderForm((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-800"
                      />
                    </label>
                  ))}
                  <label className="col-span-2 block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">
                      Shipping method
                    </span>
                    <select
                      value={orderForm.shippingMethod}
                      onChange={(e) =>
                        setOrderForm((prev) => ({
                          ...prev,
                          shippingMethod: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-800"
                    >
                      <option value="Budget">Budget</option>
                      <option value="Standard">Standard</option>
                      <option value="Express">Express</option>
                      <option value="Overnight">Overnight</option>
                    </select>
                  </label>
                </div>

                {orderError && (
                  <div className="mt-3 rounded bg-red-50 px-4 py-3 text-xs text-red-700">
                    {orderError}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowOrderModal(false)}
                    disabled={orderLoading}
                    className="rounded px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePlaceOrder}
                    disabled={orderLoading}
                    className="rounded bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {orderLoading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Spinner /> Placing order...
                      </span>
                    ) : (
                      "Place order"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Print confirmation modal */}
      {showPrintModal && printDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrintModal(false);
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
                  {printDetails.childName}
                  {printDetails.childAge != null && (
                    <span className="ml-1 text-gray-400">
                      (age {printDetails.childAge})
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className="font-medium text-gray-500">
                  Shipping address:
                </span>
                {printDetails.shippingAddress ? (
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    {printDetails.shippingAddress}
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
                    value={printDetails.pdfUrl}
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
                onClick={() => setShowPrintModal(false)}
                className="rounded px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPrint}
                disabled={printLoading}
                className="rounded bg-teal-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
              >
                {printLoading ? (
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
      )}
    </div>
  );
}
