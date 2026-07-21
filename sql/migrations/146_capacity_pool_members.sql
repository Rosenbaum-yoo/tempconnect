-- Migration 146: Sammelangebote — Pool-Mitglieder (Welle 4a)
-- =============================================================================
-- Ein Pool-Angebot (capacity_posts.offer_kind = pool_single_skill / pool_multi_skill)
-- bündelt mehrere Arbeiter unter EINEM Angebot (headcount = Anzahl). Diese Tabelle
-- hält fest, WELCHE Arbeiter im Pool sind — für die Anzahl-Anzeige, die spätere
-- Reservierung (Welle 4b) und den Dedup-Kontext. Add-only, rückwärtskompatibel.
--
-- Der "pauschal N Helfer ohne konkrete Personen"-Fall bleibt weiterhin möglich:
-- ein Pool-Angebot ohne Mitglieder (nur headcount) ist zulässig.
--
-- Rollback:
--   DROP TABLE IF EXISTS capacity_post_pool_members;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

CREATE TABLE IF NOT EXISTS capacity_post_pool_members (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capacity_post_id  UUID NOT NULL REFERENCES capacity_posts(id) ON DELETE CASCADE,
  worker_profile_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capacity_post_id, worker_profile_id)
);

CREATE INDEX IF NOT EXISTS capacity_post_pool_members_post_idx
  ON capacity_post_pool_members(capacity_post_id);
CREATE INDEX IF NOT EXISTS capacity_post_pool_members_worker_idx
  ON capacity_post_pool_members(worker_profile_id);

COMMIT;
