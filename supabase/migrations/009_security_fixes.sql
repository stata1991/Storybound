-- ============================================================================
-- Storybound — Security fixes
-- 1. Enable RLS on notifications_log
-- 2. Add RLS policies for harvest-photos storage bucket
-- ============================================================================

-- ─── 1. notifications_log: enable RLS + policies ──────────────────────────────

alter table notifications_log enable row level security;

-- Parents can view notification logs for their own children's harvests
create policy "Parents can view own notification logs"
  on notifications_log for select
  to authenticated
  using (
    harvest_id in (
      select h.id from harvests h
      join children c on c.id = h.child_id
      where c.family_id = auth_family_id()
    )
  );

-- Parents can insert notification logs for their own children's harvests
-- (currently only cron/service role inserts, but defense-in-depth)
create policy "Parents can insert own notification logs"
  on notifications_log for insert
  to authenticated
  with check (
    harvest_id in (
      select h.id from harvests h
      join children c on c.id = h.child_id
      where c.family_id = auth_family_id()
    )
  );

-- ─── 2. harvest-photos storage: RLS policies ─────────────────────────────────
-- Path pattern: {family_id}/{child_id}/{harvest_id}/{filename}
-- First folder segment is the family_id

create policy "Parents can upload harvest photos for own family"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'harvest-photos'
    and (storage.foldername(name))[1]::uuid = auth_family_id()
  );

create policy "Parents can view harvest photos for own family"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'harvest-photos'
    and (storage.foldername(name))[1]::uuid = auth_family_id()
  );
