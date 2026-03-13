-- ============================================================================
-- Storybound — Notifications log
-- Tracks every email sent to prevent duplicate sends
-- ============================================================================

create table notifications_log (
  id              uuid default gen_random_uuid() primary key,
  harvest_id      uuid not null references harvests(id) on delete cascade,
  email_type      text not null,
  recipient_email text not null,
  sent_at         timestamptz not null default now()
);

create index idx_notifications_dedup
  on notifications_log(harvest_id, email_type);
