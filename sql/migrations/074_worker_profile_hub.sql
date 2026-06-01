-- =============================================================================
-- Migration 074: Worker Profile Hub
-- Adds persisted talent/profile fields and controlled public sharing metadata
-- to existing worker_profiles without creating a parallel profile system.
-- =============================================================================

BEGIN;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS skill_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS qualifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_text TEXT,
  ADD COLUMN IF NOT EXISTS profile_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_profile_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS public_profile_slug UUID NOT NULL DEFAULT uuid_generate_v4(),
  ADD COLUMN IF NOT EXISTS availability_note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_public_slug_idx
  ON worker_profiles(public_profile_slug);

CREATE INDEX IF NOT EXISTS worker_profiles_public_idx
  ON worker_profiles(profile_public)
  WHERE profile_public = TRUE;

CREATE INDEX IF NOT EXISTS worker_profiles_skill_tags_gin_idx
  ON worker_profiles USING GIN(skill_tags);

CREATE INDEX IF NOT EXISTS worker_profiles_qualifications_gin_idx
  ON worker_profiles USING GIN(qualifications);

COMMIT;
