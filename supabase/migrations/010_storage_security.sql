-- ============================================================================
-- Storybound — Storage bucket RLS policies
-- 1. illustrations bucket: SELECT + INSERT scoped to family
-- 2. books bucket: SELECT scoped to family
-- ============================================================================

-- ─── 1. illustrations bucket ──────────────────────────────────────────────────
-- Path pattern: {child_id}/{episode_id}/{index}.png
-- First folder segment is child_id → look up children.family_id

create policy "Parents can view illustrations for own children"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'illustrations'
    and (storage.foldername(name))[1]::uuid in (
      select id from children where family_id = auth_family_id()
    )
  );

create policy "Parents can upload illustrations for own children"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'illustrations'
    and (storage.foldername(name))[1]::uuid in (
      select id from children where family_id = auth_family_id()
    )
  );

-- ─── 2. books bucket ─────────────────────────────────────────────────────────
-- Path pattern: {child_id}/{episode_id}/book.pdf
-- First folder segment is child_id → look up children.family_id

create policy "Parents can view books for own children"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'books'
    and (storage.foldername(name))[1]::uuid in (
      select id from children where family_id = auth_family_id()
    )
  );
