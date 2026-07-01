/* ─── Anthropic model IDs ─────────────────────────────────────────────────── */
// Canonical single source of truth for the story-generation model.
// Use a dateless ID so a retired dated snapshot can't 404 the generation path
// (migrated off the retired Sonnet 4 dated ID that caused not_found_error in prod).
// The standalone CLI at scripts/generate-story.ts mirrors this value manually
// (separate root package, cannot import across the web/ boundary) — keep in sync.
export const STORY_MODEL = "claude-sonnet-4-6";
