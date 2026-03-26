-- 012_parent_preview.sql
-- Adds parent preview flow: new episode statuses + preview columns

-- ── Extend episode_status_enum ──────────────────────────────────────────────

ALTER TYPE episode_status_enum ADD VALUE IF NOT EXISTS 'book_ready'      BEFORE 'approved';
ALTER TYPE episode_status_enum ADD VALUE IF NOT EXISTS 'parent_approved'  AFTER 'book_ready';
ALTER TYPE episode_status_enum ADD VALUE IF NOT EXISTS 'parent_flagged'   AFTER 'parent_approved';

-- ── Add preview columns to episodes ─────────────────────────────────────────

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS parent_flag_message text,
  ADD COLUMN IF NOT EXISTS preview_deadline    timestamptz;

-- ── RLS: tighten parent episode updates to preview statuses only ───────────
-- The original 002 policy ("Parents can update own episodes") has no
-- WITH CHECK, so parents can set any column/value on their own episodes.
-- Drop it and replace with a restricted version that only allows
-- setting status to parent_approved or parent_flagged.

DROP POLICY IF EXISTS "Parents can update own episodes" ON episodes;

CREATE POLICY "Parents can update own episodes"
  ON episodes FOR UPDATE TO authenticated
  USING (
    child_id IN (
      SELECT id FROM children WHERE family_id = auth_family_id()
    )
  )
  WITH CHECK (
    child_id IN (
      SELECT id FROM children WHERE family_id = auth_family_id()
    )
    AND status IN ('parent_approved', 'parent_flagged')
  );
