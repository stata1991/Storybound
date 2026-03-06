-- ============================================================================
-- Storybound — Add photo captions to harvests
-- ============================================================================

alter table harvests add column photo_captions text[] default '{}';
