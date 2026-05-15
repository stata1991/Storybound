"use server";

import { logEvent } from "@/lib/audit";

export async function reportClientError(params: {
  message: string;
  digest?: string;
  pathname: string;
  boundary: "root" | "global" | "onboarding" | "dashboard";
}): Promise<void> {
  await logEvent({
    event_type: "client_error.boundary",
    status: "error",
    message: params.message,
    metadata: {
      digest: params.digest ?? null,
      pathname: params.pathname,
      boundary: params.boundary,
    },
  });
}
