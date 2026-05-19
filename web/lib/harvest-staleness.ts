export const TRAINING_STUCK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
export const ILLUSTRATIONS_STUCK_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export type StuckState = "training_stuck" | "illustrations_stuck" | null;

export function isHarvestStuck(
  harvest: {
    status: string;
    face_ref_path: string | null;
    updated_at: string;
  },
  nowMs: number = Date.now()
): StuckState {
  const updatedMs = new Date(harvest.updated_at).getTime();
  if (!Number.isFinite(updatedMs)) return null;
  const elapsed = nowMs - updatedMs;

  if (harvest.status === "training" && elapsed > TRAINING_STUCK_THRESHOLD_MS) {
    return "training_stuck";
  }
  if (
    harvest.status === "processing" &&
    harvest.face_ref_path != null &&
    elapsed > ILLUSTRATIONS_STUCK_THRESHOLD_MS
  ) {
    return "illustrations_stuck";
  }
  return null;
}

export function formatElapsedSince(
  updatedAt: string,
  nowMs: number = Date.now()
): string {
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return "unknown";
  const elapsed = Math.max(0, nowMs - updatedMs);
  const hours = Math.floor(elapsed / (60 * 60 * 1000));
  const mins = Math.floor((elapsed % (60 * 60 * 1000)) / (60 * 1000));
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
