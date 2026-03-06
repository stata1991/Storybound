-- ============================================================================
-- Storybound — Row Level Security Policies
-- Requirement: No child data accessible without authentication
-- ============================================================================

-- ─── Helper: get the authenticated user's family_id ─────────────────────────

create or replace function auth_family_id()
returns uuid as $$
  select family_id from parents where id = auth.uid()
$$ language sql security definer stable;

-- ─── Enable RLS on every table ──────────────────────────────────────────────

alter table families enable row level security;
alter table parents enable row level security;
alter table children enable row level security;
alter table story_bibles enable row level security;
alter table harvests enable row level security;
alter table episodes enable row level security;
alter table delivery_calendar enable row level security;
alter table gift_claims enable row level security;

-- ─── Families ───────────────────────────────────────────────────────────────

create policy "Parents can view own family"
  on families for select
  to authenticated
  using (id = auth_family_id());

create policy "Parents can update own family"
  on families for update
  to authenticated
  using (id = auth_family_id())
  with check (id = auth_family_id());

-- ─── Parents ────────────────────────────────────────────────────────────────

create policy "Parents can view own record"
  on parents for select
  to authenticated
  using (id = auth.uid());

create policy "Parents can update own record"
  on parents for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Parents can insert own record"
  on parents for insert
  to authenticated
  with check (id = auth.uid());

-- ─── Children ───────────────────────────────────────────────────────────────

create policy "Parents can view own children"
  on children for select
  to authenticated
  using (family_id = auth_family_id());

create policy "Parents can create children"
  on children for insert
  to authenticated
  with check (family_id = auth_family_id());

create policy "Parents can update own children"
  on children for update
  to authenticated
  using (family_id = auth_family_id())
  with check (family_id = auth_family_id());

-- No delete policy — soft deletes via deleted_at

-- ─── Story Bibles ───────────────────────────────────────────────────────────

create policy "Parents can view own story bibles"
  on story_bibles for select
  to authenticated
  using (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

create policy "Parents can update own story bibles"
  on story_bibles for update
  to authenticated
  using (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

-- ─── Harvests ───────────────────────────────────────────────────────────────

create policy "Parents can view own harvests"
  on harvests for select
  to authenticated
  using (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

create policy "Parents can create harvests"
  on harvests for insert
  to authenticated
  with check (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

create policy "Parents can update own harvests"
  on harvests for update
  to authenticated
  using (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

-- ─── Episodes ───────────────────────────────────────────────────────────────

create policy "Parents can view own episodes"
  on episodes for select
  to authenticated
  using (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

create policy "Parents can update own episodes"
  on episodes for update
  to authenticated
  using (
    child_id in (
      select id from children where family_id = auth_family_id()
    )
  );

-- ─── Delivery Calendar ──────────────────────────────────────────────────────
-- Operational reference data — read-only for all authenticated users

create policy "Authenticated users can view delivery calendar"
  on delivery_calendar for select
  to authenticated
  using (true);

-- ─── Gift Claims ────────────────────────────────────────────────────────────

-- Authenticated buyer: read own claims
create policy "Buyers can view own gift claims"
  on gift_claims for select
  to authenticated
  using (family_id = auth_family_id());

-- Authenticated buyer: update own claims (e.g. resend, cancel)
create policy "Buyers can update own gift claims"
  on gift_claims for update
  to authenticated
  using (family_id = auth_family_id());

-- Authenticated buyer: create gift claims
create policy "Buyers can create gift claims"
  on gift_claims for insert
  to authenticated
  with check (family_id = auth_family_id());

-- Anonymous/anyone: read a claim by valid token (for the claim landing page)
create policy "Anyone can view claim by token"
  on gift_claims for select
  to anon
  using (
    claim_token = current_setting('request.headers', true)::json->>'x-claim-token'
    and status = 'pending'
    and expires_at > now()
  );

-- Anonymous/anyone: claim a gift with valid token (one-time action)
create policy "Anyone can claim with valid token"
  on gift_claims for update
  to anon
  using (
    claim_token = current_setting('request.headers', true)::json->>'x-claim-token'
    and status = 'pending'
    and expires_at > now()
  )
  with check (
    status = 'claimed'
  );
