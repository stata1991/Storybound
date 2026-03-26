-- 015_subscription_restructure.sql
-- Restructure subscription_type from enum to text for new flow:
--   none | digital_only | physical_digital
-- Preserves original plan info (founding/gift/one_time) in new subscription_plan column.

-- Step 1: Add subscription_plan column to preserve the original plan type
ALTER TABLE families ADD COLUMN IF NOT EXISTS subscription_plan text;

-- Step 2: Copy existing subscription_type values to subscription_plan
UPDATE families SET subscription_plan = subscription_type::text;

-- Step 3: Convert subscription_type from enum to text
ALTER TABLE families
  ALTER COLUMN subscription_type DROP DEFAULT,
  ALTER COLUMN subscription_type TYPE text USING subscription_type::text,
  ALTER COLUMN subscription_type SET DEFAULT 'none';

-- Step 4: Map existing values — all paid subscribers become 'physical_digital'
UPDATE families SET subscription_type = 'physical_digital'
  WHERE subscription_type IN ('founding', 'standard', 'one_time', 'gift');

-- Step 5: Drop the old enum type
DROP TYPE IF EXISTS subscription_type_enum;
