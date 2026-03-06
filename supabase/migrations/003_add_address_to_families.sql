-- ============================================================================
-- Storybound — Add shipping address columns to families
-- ============================================================================

alter table families
  add column shipping_name  text,
  add column address_line1  text,
  add column address_line2  text,
  add column city           text,
  add column state          text,
  add column zip            text,
  add column country        text default 'US';
