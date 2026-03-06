-- ============================================================================
-- Storybound — Initial Schema
-- Source of truth: data-models.md
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type subscription_status_enum as enum (
  'trialing', 'active', 'past_due', 'canceled', 'paused'
);

create type subscription_type_enum as enum (
  'founding', 'standard', 'one_time', 'gift'
);

create type subscription_tier_enum as enum (
  'physical_digital', 'digital_only'
);

create type pronouns_enum as enum (
  'she_her', 'he_him', 'they_them', 'other'
);

create type reading_level_enum as enum (
  'pre_reader', 'early_reader', 'independent', 'chapter_book'
);

create type season_enum as enum (
  'spring', 'summer', 'autumn', 'birthday'
);

create type story_bible_status_enum as enum (
  'draft', 'approved', 'in_use'
);

create type harvest_status_enum as enum (
  'pending', 'submitted', 'processing', 'complete', 'missed'
);

create type illustration_status_enum as enum (
  'pending', 'generating', 'review', 'approved', 'rejected'
);

create type print_status_enum as enum (
  'pending', 'submitted', 'printing', 'shipped', 'delivered'
);

create type episode_status_enum as enum (
  'draft', 'story_review', 'illustration_review',
  'approved', 'printing', 'shipped', 'delivered'
);

create type gift_claim_status_enum as enum (
  'pending', 'claimed', 'expired'
);

-- ─── Shared trigger function: auto-update updated_at ────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── Tables ─────────────────────────────────────────────────────────────────

-- 1. Families (root entity)
create table families (
  id                  uuid default gen_random_uuid() primary key,
  stripe_customer_id  text unique,
  subscription_status subscription_status_enum not null default 'trialing',
  subscription_type   subscription_type_enum not null default 'founding',
  subscription_tier   subscription_tier_enum not null default 'physical_digital',
  subscription_price  numeric(7,2),
  is_founding_member  boolean not null default false,
  billing_cycle_start date,
  referral_code       text unique,
  referred_by         uuid references families(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz  -- soft delete
);

create trigger families_updated_at
  before update on families
  for each row execute function set_updated_at();

-- 2. Parents (linked to Supabase Auth)
create table parents (
  id                          uuid primary key references auth.users(id),
  family_id                   uuid not null references families(id) on delete restrict,
  email                       text unique not null,
  first_name                  text,
  last_name                   text,
  phone                       text,
  timezone                    text,
  notification_preferences    jsonb default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger parents_updated_at
  before update on parents
  for each row execute function set_updated_at();

-- 3. Children (no cascade delete — protect story data)
create table children (
  id                  uuid default gen_random_uuid() primary key,
  family_id           uuid not null references families(id) on delete restrict,
  name                text not null,
  preferred_name      text,
  date_of_birth       date not null,
  pronouns            pronouns_enum not null default 'they_them',
  pronouns_other      text,
  reading_level       reading_level_enum not null default 'early_reader',
  interests           text[] default '{}',
  favorites           jsonb default '{}'::jsonb,
  avoidances          text[] default '{}',
  family_notes        text,
  default_archetype   text,
  is_one_time         boolean not null default false,
  current_year        integer not null default 1,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz  -- soft delete
);

create trigger children_updated_at
  before update on children
  for each row execute function set_updated_at();

-- 4. Story Bibles (one per child per year)
create table story_bibles (
  id                uuid default gen_random_uuid() primary key,
  child_id          uuid not null references children(id) on delete restrict,
  year              integer not null,
  season_title      text,
  hero_profile      jsonb,
  world_profile     jsonb,
  companion         jsonb,
  season_arc        jsonb,
  episode_outlines  jsonb[] default '{}',
  approved_at       timestamptz,
  approved_by       text,
  status            story_bible_status_enum not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (child_id, year)
);

create trigger story_bibles_updated_at
  before update on story_bibles
  for each row execute function set_updated_at();

-- 5. Harvests (memory drops — four per child per year)
create table harvests (
  id                    uuid default gen_random_uuid() primary key,
  child_id              uuid not null references children(id) on delete restrict,
  quarter               integer not null check (quarter between 1 and 4),
  year                  integer not null,
  season                season_enum not null,

  -- Window
  window_opens_at       timestamptz,
  window_closes_at      timestamptz,
  submitted_at          timestamptz,

  -- Submission content
  memory_1              text,
  memory_2              text,
  photo_count           integer default 0,
  photo_paths           text[] default '{}',
  current_interests     text[] default '{}',
  milestone_description text,
  character_archetype   text,
  notable_notes         text,

  -- Processing
  face_ref_generated    boolean not null default false,
  face_ref_path         text,
  photos_deleted_at     timestamptz,

  status                harvest_status_enum not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (child_id, year, quarter)
);

create trigger harvests_updated_at
  before update on harvests
  for each row execute function set_updated_at();

-- 6. Episodes (books — one per harvest)
create table episodes (
  id                    uuid default gen_random_uuid() primary key,
  child_id              uuid not null references children(id) on delete restrict,
  harvest_id            uuid not null references harvests(id) on delete restrict,
  story_bible_id        uuid references story_bibles(id) on delete restrict,
  quarter               integer not null check (quarter between 1 and 4),
  year                  integer not null,
  episode_number        integer not null check (episode_number between 1 and 4),

  -- Story content
  title                 text,
  dedication            text,
  scenes                jsonb[] default '{}',
  final_page            text,
  parent_note           text,

  -- Illustration
  illustration_status   illustration_status_enum not null default 'pending',
  illustration_paths    text[] default '{}',

  -- Production
  print_file_path       text,
  print_status          print_status_enum not null default 'pending',
  tracking_number       text,

  -- Approval
  story_approved_at     timestamptz,
  story_approved_by     text,
  print_approved_at     timestamptz,

  -- Delivery
  target_delivery_date  date,
  shipped_at            timestamptz,
  delivered_at          timestamptz,

  status                episode_status_enum not null default 'draft',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (child_id, year, episode_number)
);

create trigger episodes_updated_at
  before update on episodes
  for each row execute function set_updated_at();

-- 7. Delivery Calendar (operational reference, Q1-Q3 only)
create table delivery_calendar (
  id                uuid default gen_random_uuid() primary key,
  quarter           integer not null check (quarter between 1 and 3),
  year              integer not null,
  season            season_enum not null,

  harvest_opens     date not null,
  harvest_closes    date not null,
  production_start  date not null,
  ship_by_date      date not null,
  delivery_target   date not null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (year, quarter)
);

create trigger delivery_calendar_updated_at
  before update on delivery_calendar
  for each row execute function set_updated_at();

-- 8. Gift Claims
create table gift_claims (
  id                uuid default gen_random_uuid() primary key,
  family_id         uuid not null references families(id) on delete restrict,
  claim_token       text unique not null default encode(sha256(gen_random_uuid()::text::bytea), 'hex'),
  recipient_email   text,
  claimed_at        timestamptz,
  claimed_by        uuid references families(id) on delete set null,
  expires_at        timestamptz not null default (now() + interval '90 days'),
  status            gift_claim_status_enum not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger gift_claims_updated_at
  before update on gift_claims
  for each row execute function set_updated_at();

-- ─── Indexes ────────────────────────────────────────────────────────────────

create index idx_parents_family_id on parents(family_id);
create index idx_children_family_id on children(family_id);
create index idx_children_active on children(family_id) where active = true and deleted_at is null;
create index idx_story_bibles_child_id on story_bibles(child_id);
create index idx_harvests_child_id on harvests(child_id);
create index idx_harvests_status on harvests(status);
create index idx_episodes_child_id on episodes(child_id);
create index idx_episodes_harvest_id on episodes(harvest_id);
create index idx_gift_claims_token on gift_claims(claim_token);
create index idx_gift_claims_family_id on gift_claims(family_id);
create index idx_families_stripe on families(stripe_customer_id);
