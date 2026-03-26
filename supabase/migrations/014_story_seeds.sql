-- ============================================================================
-- 014 — Story Seeds for emotional continuity across episodes
-- ============================================================================

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS story_seeds jsonb;

COMMENT ON COLUMN episodes.story_seeds IS
  'Extracted after generation: key_moment, emotional_growth, unresolved_thread, callback_moment. Used to feed continuity into the next episode prompt.';
