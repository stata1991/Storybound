import { createClient as createAdminClient } from "@supabase/supabase-js";

interface LogEventParams {
  event_type: string;
  status: "started" | "success" | "error";
  message?: string;
  harvest_id?: string;
  family_id?: string;
  child_id?: string;
  metadata?: Record<string, unknown>;
}

function getAuditClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Fire-and-forget audit log entry.
 * Never throws — wraps all errors in try/catch.
 * Callers should NOT await this function.
 */
export function logEvent(params: LogEventParams): void {
  try {
    getAuditClient()
      .from("audit_log")
      .insert({
        event_type: params.event_type,
        status: params.status,
        message: params.message ?? null,
        harvest_id: params.harvest_id ?? null,
        family_id: params.family_id ?? null,
        child_id: params.child_id ?? null,
        metadata: params.metadata ?? null,
      })
      .then(({ error }) => {
        if (error) {
          console.error("audit_log insert failed:", error.message);
        }
      })
      .catch((err) => {
        console.error("audit_log insert failed:", err);
      });
  } catch (err) {
    console.error("audit_log setup failed:", err);
  }
}
