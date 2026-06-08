import { NextRequest } from "next/server";
import { logEvent } from "@/lib/audit";

/**
 * POST /api/client-error
 *
 * Lightweight capture endpoint for error boundaries that cannot import
 * server actions (global-error.tsx). Mirrors the insert shape used by
 * reportClientError → logEvent, so all boundary errors land in the
 * same audit_log stream.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const boundary: string = body.boundary ?? "unknown";
    const digest: string | null = body.digest ?? null;
    const message: string | null = body.message ?? null;
    const pathname: string | null = body.pathname ?? null;

    await logEvent({
      event_type: "client_error.boundary",
      status: "error",
      message: message ?? undefined,
      metadata: {
        digest,
        pathname,
        boundary,
      },
    });
  } catch (err) {
    console.error("[/api/client-error] failed:", err);
  }

  return new Response(null, { status: 204 });
}
