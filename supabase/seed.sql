-- ============================================================================
-- Storybound — Seed Data
-- Test family with 2 children, harvests, and a gift claim
-- NOTE: In production, parents.id comes from auth.users.
--       For local seeding, insert a matching auth.users row first
--       or run this with RLS disabled (supabase db seed does this).
-- ============================================================================

-- ─── Test Family ────────────────────────────────────────────────────────────

insert into families (
  id, stripe_customer_id, subscription_status, subscription_type,
  subscription_tier, subscription_price, is_founding_member,
  billing_cycle_start, referral_code
) values (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'cus_test_founding_001',
  'active',
  'founding',
  'physical_digital',
  89.00,
  true,
  '2026-03-01',
  'STORY-FOUNDING-001'
);

-- ─── Test Parent ────────────────────────────────────────────────────────────
-- In real usage, this id matches auth.users(id).
-- For seed purposes, we insert directly.

insert into parents (
  id, family_id, email, first_name, last_name, timezone
) values (
  'b2c3d4e5-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'testparent@storybound.dev',
  'Jordan',
  'Tester',
  'America/Los_Angeles'
);

-- ─── Test Child 1: Aria (age 5) ────────────────────────────────────────────

insert into children (
  id, family_id, name, preferred_name, date_of_birth,
  pronouns, reading_level, interests, favorites,
  avoidances, family_notes, default_archetype,
  is_one_time, current_year
) values (
  'c3d4e5f6-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Aria',
  null,
  '2021-04-15',
  'she_her',
  'early_reader',
  array['dinosaurs', 'painting', 'her cat Whiskers'],
  '{"color": "purple", "food": "mac and cheese", "animal": "cat"}'::jsonb,
  array['spiders', 'loud thunder'],
  'Lives with mom and dad. Has a cat named Whiskers. Starting kindergarten this fall. Very imaginative.',
  'Dinosaur',
  false,
  1
);

-- ─── Test Child 2: Leo (age 7) ─────────────────────────────────────────────

insert into children (
  id, family_id, name, preferred_name, date_of_birth,
  pronouns, reading_level, interests, favorites,
  avoidances, family_notes, default_archetype,
  is_one_time, current_year
) values (
  'c3d4e5f6-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Leo',
  null,
  '2019-08-22',
  'he_him',
  'early_reader',
  array['space', 'building things', 'swimming'],
  '{"color": "blue", "food": "pizza", "animal": "dolphin"}'::jsonb,
  array['getting lost', 'scary monsters'],
  'Lives with mom and stepdad. Has a baby sister. Loves asking why questions. Recently visited a science museum.',
  'Astronaut',
  false,
  1
);

-- ─── Pending Harvest: Aria (Q2 Summer) ──────────────────────────────────────

insert into harvests (
  id, child_id, quarter, year, season,
  window_opens_at, window_closes_at, status
) values (
  'd4e5f6a7-0000-0000-0000-000000000001',
  'c3d4e5f6-0000-0000-0000-000000000001',
  2,
  2026,
  'summer',
  '2026-04-15T00:00:00Z',
  '2026-05-10T00:00:00Z',
  'pending'
);

-- ─── Pending Harvest: Leo (Q1 Spring) ───────────────────────────────────────

insert into harvests (
  id, child_id, quarter, year, season,
  window_opens_at, window_closes_at, status
) values (
  'd4e5f6a7-0000-0000-0000-000000000002',
  'c3d4e5f6-0000-0000-0000-000000000002',
  1,
  2026,
  'spring',
  '2026-01-15T00:00:00Z',
  '2026-02-10T00:00:00Z',
  'pending'
);

-- ─── Pending Gift Claim ─────────────────────────────────────────────────────

insert into gift_claims (
  id, family_id, recipient_email, status
) values (
  'e5f6a7b8-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'grandma@example.com',
  'pending'
);
