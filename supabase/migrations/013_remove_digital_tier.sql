-- 013_remove_digital_tier.sql
-- Remove the digital_only tier — all subscribers are physical.
--
-- PostgreSQL does not support DROP VALUE from enums directly.
-- Instead: migrate any existing digital_only rows to physical_digital,
-- then recreate the enum with a single value.

-- Step 1: Ensure no rows reference digital_only
UPDATE families
  SET subscription_tier = 'physical_digital'
  WHERE subscription_tier = 'digital_only';

-- Step 2: Rename old enum, create new one, migrate column, drop old
ALTER TYPE subscription_tier_enum RENAME TO subscription_tier_enum_old;

CREATE TYPE subscription_tier_enum AS ENUM ('physical_digital');

ALTER TABLE families
  ALTER COLUMN subscription_tier DROP DEFAULT,
  ALTER COLUMN subscription_tier TYPE subscription_tier_enum
    USING subscription_tier::text::subscription_tier_enum,
  ALTER COLUMN subscription_tier SET DEFAULT 'physical_digital';

DROP TYPE subscription_tier_enum_old;
