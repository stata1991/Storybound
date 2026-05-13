import { createClient as createAdminClient } from "@supabase/supabase-js";

interface LogEventParams {
  event_type: string;
  status: "started" | "success" | "error" | "info" | "warn";
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
 * Audit log entry. Never throws — wraps all errors in try/catch.
 * Returns a Promise that callers may optionally await for reliability,
 * or ignore for fire-and-forget semantics.
 */
export function logEvent(params: LogEventParams): Promise<void> {
  try {
    return Promise.resolve(
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
    )
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
    return Promise.resolve();
  }
}
