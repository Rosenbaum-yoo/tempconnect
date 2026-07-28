-- 155: Nachzieh-Migration fuer webhook_deliveries_retry_failed_idx (Audit-Backlog C-10).
--
-- WARUM DIESE MIGRATION EXISTIERT — die Falle im Klartext:
--   Mig 122 legte den Index hinter einem `to_regclass`-Guard an, weil die Tabelle
--   `webhook_deliveries` damals fehlte und ein nacktes CREATE INDEX die gesamte
--   Transaktion abgebrochen haette. Der Guard tat, was er sollte: er UEBERSPRANG
--   den Index — still, per RAISE NOTICE. Mig 124 nahm ihn ausdruecklich nicht auf
--   ("bleibt bewusst draussen, bis die Integrations-Funktion ihre Tabelle
--   mitbringt"). Mig 130 (org_integrations) brachte die Tabelle dann tatsaechlich —
--   aber niemand zog den Index nach. 122 gilt als angewandt und laeuft nie wieder.
--
--   Ergebnis: der Retry-Sweep scannt `webhook_deliveries` sequenziell. Bei zehn
--   Kunden faellt das nicht auf; die Tabelle ist append-only und waechst mit jedem
--   ausgelieferten Event, also bricht genau dieser Pfad beim Hochlaufen.
--
--   LEHRE (gilt fuer jede kuenftige Guard-Migration): ein Guard, der ueberspringt,
--   braucht einen Ausloeser, der ihn nachholt. Hier ist dieser Ausloeser
--   `api/test/integration/scaling-indexes.flow.test.js` — der Test hat die Luecke
--   gefunden. Wer kuenftig einen Index hinter einen Guard stellt, traegt ihn dort
--   ein, sonst faellt der Ausfall erst unter Last auf.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS, Guard bleibt als Schutz fuer frische DBs,
-- in denen 130 noch nicht gelaufen ist.
--
-- Rollback: DROP INDEX IF EXISTS webhook_deliveries_retry_failed_idx;

BEGIN;

SET client_min_messages TO WARNING;

DO $$
BEGIN
  IF to_regclass('public.webhook_deliveries') IS NULL THEN
    RAISE NOTICE '155: webhook_deliveries fehlt weiterhin — Index uebersprungen.';
    RETURN;
  END IF;

  -- Deckt retryFailedDeliveries:
  --   WHERE status='failed' AND attempt < max_attempts AND next_retry_at <= NOW()
  --   ORDER BY next_retry_at ASC LIMIT 100
  -- Partiell auf status='failed', sortiert nach next_retry_at — der Sweep liest
  -- damit nur faellige Zeilen in Sortierreihenfolge statt die ganze Tabelle.
  CREATE INDEX IF NOT EXISTS webhook_deliveries_retry_failed_idx
    ON webhook_deliveries(next_retry_at)
    WHERE status = 'failed';

  COMMENT ON INDEX webhook_deliveries_retry_failed_idx IS
    'Stuetzt den webhook-retry-Sweep (status=failed, faellige Retries nach next_retry_at). Nachgezogen in Mig 155, weil der Guard in Mig 122 ihn uebersprang.';
END $$;

COMMIT;
