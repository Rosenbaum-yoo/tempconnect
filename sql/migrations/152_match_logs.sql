-- 152: match_logs — die Auswertungsspur des Matchings.
--
-- Befund beim Live-Smoke zu P4.1 (2026-07-26): `matchingEngine.logMatch()` schreibt seit
-- jeher nach `match_logs`, aber die Tabelle wurde nie angelegt. Der INSERT laeuft in einem
-- try/catch ohne Log — jeder Aufruf ist seit Einfuehrung **still** ins Leere gelaufen.
-- Genau das Fehlermuster, das in SKILL.md als harte Lehre steht: ein Feature, das nirgends
-- scheitert und trotzdem nichts tut.
--
-- Warum das jetzt zaehlt: Welle 4.3 (KI-Ranking) soll gegen eine Baseline gemessen werden
-- ("Trefferqualitaet und Kosten pro Match protokollieren"). Ohne diese Tabelle gibt es
-- keine Messgrundlage — die Entscheidung "ist die KI besser?" waere eine Meinung.
--
-- Rollback: DROP TABLE IF EXISTS match_logs;

CREATE TABLE IF NOT EXISTS match_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_type  TEXT NOT NULL,
  source_id   UUID,
  target_id   UUID,
  score       INT,
  reasons     JSONB,
  outcome     TEXT NOT NULL DEFAULT 'suggested',
  org_id      UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only, zeitkorreliert, auf dem heissen Insert-Pfad: BRIN statt btree
-- (kein Write-Amplification-Aufschlag bei jedem Match).
CREATE INDEX IF NOT EXISTS match_logs_created_brin_idx
  ON match_logs USING BRIN (created_at);

-- Auswertung: "wie gut war Typ X mit Ergebnis Y?" (Baseline fuer 4.2/4.3)
CREATE INDEX IF NOT EXISTS match_logs_type_outcome_idx
  ON match_logs (match_type, outcome, created_at DESC);

-- Org-Sicht (Reporting bleibt org-gebunden)
CREATE INDEX IF NOT EXISTS match_logs_org_idx
  ON match_logs (org_id, created_at DESC)
  WHERE org_id IS NOT NULL;
