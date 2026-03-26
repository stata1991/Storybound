-- ============================================================================
-- 016: Add 'training' to harvest_status_enum
-- ============================================================================

alter type harvest_status_enum add value if not exists 'training' after 'processing';
