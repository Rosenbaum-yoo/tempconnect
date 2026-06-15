-- 136_search_history.sql — Phase 5: persoenliche Such-Historie (pro Nutzer).
-- Bounded by design: UNIQUE(user_id, query_norm) -> distinkte Suchbegriffe je Nutzer (Upsert statt Append),
-- kein unbegrenztes Zeilenwachstum bei wiederholten Suchen. Speist die "Letzte Suchen" im Topbar-Feld.
-- org_id nur als Kontext gespeichert; die Suche selbst ist serverseitig RBAC-/sichtbarkeits-gefiltert.
-- Rollback: DROP TABLE search_history;

CREATE TABLE IF NOT EXISTS search_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        uuid REFERENCES organizations(id) ON DELETE SET NULL,
  query         text NOT NULL,                                   -- Originaltext (Anzeige)
  query_norm    text NOT NULL,                                   -- normalisiert (lower/trim) fuer Dedup
  type          text NOT NULL DEFAULT 'all',                     -- all|requisitions|capacity_posts|companies
  result_count  integer NOT NULL DEFAULT 0,
  search_count  integer NOT NULL DEFAULT 1,                      -- wie oft gesucht (Ranking-Signal)
  last_used_at  timestamptz NOT NULL DEFAULT NOW(),
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_search_history_user_query UNIQUE (user_id, query_norm)
);

-- Recent-Lookup: jüngste distinkte Suchen eines Nutzers.
CREATE INDEX IF NOT EXISTS idx_search_history_user_recent ON search_history (user_id, last_used_at DESC);
