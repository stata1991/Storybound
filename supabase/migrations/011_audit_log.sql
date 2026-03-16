-- ============================================================================
-- Storybound — Audit log for pipeline observability
-- Service-role only — no client-side reads
-- ============================================================================

create table audit_log (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz not null default now(),
  event_type  text not null,
  status      text not null,
  harvest_id  uuid references harvests(id) on delete set null,
  family_id   uuid references families(id) on delete set null,
  child_id    uuid references children(id) on delete set null,
  message     text,
  metadata    jsonb
);

alter table audit_log enable row level security;
-- No policies — only service role can read/write
