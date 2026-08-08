-- 166_bounty_schaltbarkeit.sql
-- P9 Spur A / Welle A1 — Wahrheitspruefung des Bounty-Katalogs
--
-- WARUM DIESE MIGRATION
-- A1 hat jede der 15 Bedingungen gegen ihre Datenquelle geprueft. Ergebnis:
-- eine Bedingung misst etwas, das auf dieser Plattform nie entsteht.
--
--   top_supplier (top_percentile_12m) liest `supplier_reputation.reputation_score`.
--   Geschrieben wird diese Spalte ausschliesslich von `reputationService.recomputeReputation`.
--   Diese Funktion wird nur von `batchRecompute` gerufen — und `batchRecompute`
--   von keiner Route, keinem Cron, keinem Job. Nur von Tests.
--   Messbar in der Datenbank: 5 Zeilen in supplier_reputation, davon 0 mit
--   reputation_score, 0 mit activity_score, grade ueberall 'UNRATED'.
--   Folge in `gatherUserData`: der Perzentil-Nenner (`WHERE grade != 'UNRATED'`)
--   ist 0, der Zweig faellt auf `percentileRank = 100`, und die Bedingung
--   `pct <= 10` ist fuer jeden Nutzer dauerhaft falsch.
--   Das Bounty ist also nicht "noch nicht erreicht", sondern rechnerisch
--   unerreichbar — beworben mit 5 % Rabatt.
--
-- Der Katalog hatte bis hierher keinen Aus-Schalter: ein Bounty liess sich nur
-- loeschen. Loeschen wuerde die Historie in `user_bounties` per FK mitreissen und
-- die Entscheidung unauffindbar machen. Darum: abschalten mit Begruendung.
--
-- Das ist zugleich die Grundlage fuer die geforderte Zuschaltbarkeit (Welle A2):
-- ein Bounty wird ueber `is_active` an- und abgeschaltet, ohne Codeaenderung.
--
-- ROLLBACK
--   UPDATE bounties SET is_active = TRUE, inactive_reason = NULL WHERE key = 'top_supplier';
--   ALTER TABLE bounties DROP COLUMN IF EXISTS inactive_reason;
--   ALTER TABLE bounties DROP COLUMN IF EXISTS is_active;

BEGIN;

ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Warum ein Bounty aus ist, gehoert neben den Schalter. Ohne Begruendung ist in
-- sechs Monaten nicht mehr entscheidbar, ob es ein Defekt oder eine
-- Geschaeftsentscheidung war.
ALTER TABLE bounties
  ADD COLUMN IF NOT EXISTS inactive_reason TEXT;

COMMENT ON COLUMN bounties.is_active IS
  'Aus = Bounty wird nicht mehr geprueft, nicht angezeigt und gewaehrt keinen Rabatt. Historie in user_bounties bleibt erhalten.';

UPDATE bounties
   SET is_active = FALSE,
       inactive_reason = 'Quelle wird nie berechnet: reputationService.recomputeReputation hat ausserhalb der Tests keinen Aufrufer, '
                      || 'darum bleibt supplier_reputation.reputation_score leer und grade auf UNRATED. '
                      || 'Der Perzentil-Nenner ist 0, percentileRank faellt auf 100, die Bedingung pct <= 10 ist nie wahr. '
                      || 'Wieder einschalten, sobald die Reputations-Neuberechnung geplant laeuft (Cron oder Ereignis).'
 WHERE key = 'top_supplier';

COMMIT;
