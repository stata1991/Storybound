-- ============================================================================
-- Storybound — Update pronouns enum: she_her/he_him/they_them/other → boy/girl
-- ============================================================================

-- 1. Drop default (depends on old enum type) and change column to text
alter table children alter column pronouns drop default;
alter table children alter column pronouns type text using pronouns::text;

-- 2. Update existing rows to valid values before recast
update children set pronouns = 'girl' where pronouns not in ('boy', 'girl');

-- 3. Drop old enum
drop type pronouns_enum;

-- 4. Create new enum
create type pronouns_enum as enum ('boy', 'girl');

-- 5. Cast column back to new enum
alter table children alter column pronouns type pronouns_enum using pronouns::pronouns_enum;

-- 6. Restore default
alter table children alter column pronouns set default 'boy';
