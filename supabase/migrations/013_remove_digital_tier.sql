-- 013_remove_digital_tier.sql
-- digital_only was never added to remote DB.
-- This migration is a no-op for clean remotes.
-- Local dev environments that had digital_only 
-- are handled by the conditional below.

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum 
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'subscription_tier_enum'
    AND pg_enum.enumlabel = 'digital_only'
  ) THEN
    UPDATE families 
    SET subscription_tier = 'physical_digital'
    WHERE subscription_tier = 'digital_only';
  END IF;
END $$;