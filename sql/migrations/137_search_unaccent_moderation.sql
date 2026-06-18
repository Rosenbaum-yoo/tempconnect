-- 137_search_unaccent_moderation.sql — Phase 5 Verfeinerung:
--  (A) Diakritik-/Umlaut-insensitive Fuzzy-Suche: IMMUTABLE f_unaccent-Wrapper + Ausdrucks-GIN-Indizes,
--      damit "muenchen"<->"münchen", "strasse"<->"straße", "Krefte"<->"Kräfte" indexgestützt matchen.
--      (unaccent() ist nur STABLE -> der IMMUTABLE-Wrapper ist die kanonische Voraussetzung fuer Ausdrucks-Indizes.)
--  (B) Moderation: flagged_search_queries — Faekal-/Vulgaer-Suchanfragen werden aussortiert (geblockt) und
--      hier gemeldet (Staff Center sichtet). Bounded via Upsert auf (user_id, query_norm).
-- pg_trgm + unaccent-Extensions existieren bereits aus Migration 135.
-- Rollback: DROP TABLE flagged_search_queries; DROP die *_unaccent-Indizes; DROP FUNCTION f_unaccent(text);
--           (alte Plain-Trigram-Indizes aus 135 koennen bei Bedarf neu angelegt werden.)

-- ── (A) IMMUTABLE unaccent-Wrapper (kanonisches Rezept) ──────────────────────────
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $func$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$func$;

-- Alte Plain-Trigram-Indizes (135) weichen den unaccent-Ausdrucks-Indizes (sonst ungenutzt + Write-Overhead).
DROP INDEX IF EXISTS idx_trgm_req_title;
DROP INDEX IF EXISTS idx_trgm_req_role;
DROP INDEX IF EXISTS idx_trgm_req_loc;
DROP INDEX IF EXISTS idx_trgm_cap_title;
DROP INDEX IF EXISTS idx_trgm_cap_role;
DROP INDEX IF EXISTS idx_trgm_cap_loc;
DROP INDEX IF EXISTS idx_trgm_org_name;
DROP INDEX IF EXISTS idx_trgm_org_legal;

CREATE INDEX IF NOT EXISTS idx_trgm_req_title_ua ON requisitions   USING gin (f_unaccent(title)         gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_req_role_ua  ON requisitions   USING gin (f_unaccent(role)          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_req_loc_ua   ON requisitions   USING gin (f_unaccent(location_city) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_cap_title_ua ON capacity_posts USING gin (f_unaccent(title)         gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_cap_role_ua  ON capacity_posts USING gin (f_unaccent(role)          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_cap_loc_ua   ON capacity_posts USING gin (f_unaccent(location_city) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_org_name_ua  ON organizations  USING gin (f_unaccent(name)          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_org_legal_ua ON organizations  USING gin (f_unaccent(legal_name)    gin_trgm_ops);

-- ── (B) Geflaggte Suchanfragen (Moderation) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS flagged_search_queries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,          -- Verursacher (Audit; bleibt bei User-Loeschung als NULL erhalten)
  org_id          uuid REFERENCES organizations(id) ON DELETE SET NULL,
  raw_query       text NOT NULL,                                          -- Originaltext (Staff muss den Begriff sehen)
  query_norm      text NOT NULL,                                          -- normalisiert (lower/trim) fuer Dedup
  severity        text NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low','medium','high','critical')), -- aus contentModerationService
  matched_terms   text[] NOT NULL DEFAULT '{}',                           -- welche Begriffe geflaggt haben
  hit_count       integer NOT NULL DEFAULT 1,                             -- Wiederholungen (Upsert) -> Wiederholungstaeter sichtbar
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','dismissed','actioned')),
  reviewed_by     uuid,                                                   -- Staff-Actor (tempconnect_staff; bewusst keine FK)
  reviewed_at     timestamptz,
  resolution_note text,
  ip              text,
  user_agent      text,
  first_seen_at   timestamptz NOT NULL DEFAULT NOW(),
  last_seen_at    timestamptz NOT NULL DEFAULT NOW(),
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_flagged_search_user_query UNIQUE (user_id, query_norm)
);

-- Offene Faelle zuerst, jüngste zuerst (Staff-Triage).
CREATE INDEX IF NOT EXISTS idx_flagged_search_status ON flagged_search_queries (status, last_seen_at DESC);
