-- ============================================================================
-- 017: Onboarding draft persistence
--
-- Stores in-progress onboarding form state so users can refresh or close
-- their browser and resume exactly where they left off.
--
-- Keyed by auth user ID (not family_id) because new users don't have a
-- families or parents row until onboarding step 3 completes.
-- One row per user. Deleted when onboarding finishes.
-- ============================================================================

create table onboarding_drafts (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  child_id uuid references children (id) on delete set null,
  data     jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table onboarding_drafts is
  'Ephemeral onboarding form state. One row per user, deleted on completion.';

comment on column onboarding_drafts.child_id is
  'Set after saveChildProfile creates the child row (step 3). NULL during steps 1-2.';

comment on column onboarding_drafts.data is
  'JSON blob: { step, form: {name, dateOfBirth, ...}, memoryDrop: {milestone, notes} }';

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table onboarding_drafts enable row level security;

create policy "Users can view own draft"
  on onboarding_drafts for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create own draft"
  on onboarding_drafts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own draft"
  on onboarding_drafts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own draft"
  on onboarding_drafts for delete
  to authenticated
  using (user_id = auth.uid());
