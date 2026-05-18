"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL = 3_000;
const POLL_TIMEOUT = 60_000;

export interface ValidationPollResult {
  status: "idle" | "polling" | "passed" | "failed" | "timeout";
  hardPassCount?: number;
  effectivePhotoCount?: number;
  reason?: string;
  errors?: string[];
}

export function useValidationPoll(
  harvestId: string | null | undefined
): ValidationPollResult {
  const [result, setResult] = useState<ValidationPollResult>({ status: "idle" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!harvestId) {
      setResult({ status: "idle" });
      return;
    }

    let isActive = true;

    setResult({ status: "polling" });
    startRef.current = Date.now();

    async function poll() {
      if (!isActive) return;

      // Timeout check
      if (Date.now() - startRef.current >= POLL_TIMEOUT) {
        stop();
        setResult({ status: "timeout" });
        return;
      }

      try {
        const res = await fetch(
          `/api/photos/validation-status?harvestId=${encodeURIComponent(harvestId!)}`
        );
        if (!isActive) return;

        if (!res.ok) return; // Non-blocking — retry next interval

        const data = await res.json();
        if (!isActive) return;

        if (data.status === "passed") {
          stop();
          setResult({
            status: "passed",
            hardPassCount: data.hardPassCount,
            effectivePhotoCount: data.effectivePhotoCount,
          });
        } else if (data.status === "failed") {
          stop();
          setResult({
            status: "failed",
            reason: data.reason,
            errors: data.errors,
          });
        }
        // "pending" → continue polling
      } catch {
        // Fetch failure — non-blocking, continue polling
      }
    }

    // Initial poll immediately
    void poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      isActive = false;
      stop();
    };
  }, [harvestId, stop]);

  return result;
}
