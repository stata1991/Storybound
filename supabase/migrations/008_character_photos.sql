-- ============================================================================
-- Storybound — Character photos support
-- Adds deletion tracking to children and storage bucket + RLS for
-- character reference photos used in illustration pipeline
-- ============================================================================

-- ─── 1. Add character_photos_deleted_at to children ─────────────────────────

alter table children add column character_photos_deleted_at timestamptz;

-- ─── 2. Create character-photos storage bucket ──────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'character-photos',
  'character-photos',
  false,
  10485760,  -- 10MB
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- ─── 3. Storage RLS policies for character-photos ───────────────────────────

create policy "Parents can upload character photos for own children"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'character-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from children where family_id = auth_family_id()
    )
  );

create policy "Parents can view character photos for own children"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'character-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from children where family_id = auth_family_id()
    )
  );
