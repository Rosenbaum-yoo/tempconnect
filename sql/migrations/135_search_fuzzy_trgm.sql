-- 135_search_fuzzy_trgm.sql — Phase 5: Plattformweite Fuzzy-Suche.
-- pg_trgm = Tippfehler-/Teilwort-Toleranz ("Anfargen" -> "Anfragen") via Trigram-Aehnlichkeit (%-Operator).
-- unaccent = verfuegbar fuer spaetere Umlaut-Normalisierung. Die GIN-Trigram-Indizes beschleunigen
-- sowohl ILIKE als auch den %-Operator auf den durchsuchten Spalten (org-/sichtbarkeits-gescopte Suche).
-- Rollback: DROP INDEX (Extensions koennen bleiben).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_trgm_req_title ON requisitions   USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_req_role  ON requisitions   USING gin (role gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_req_loc   ON requisitions   USING gin (location_city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_cap_title ON capacity_posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_cap_role  ON capacity_posts USING gin (role gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_cap_loc   ON capacity_posts USING gin (location_city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_org_name  ON organizations  USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_org_legal ON organizations  USING gin (legal_name gin_trgm_ops);
