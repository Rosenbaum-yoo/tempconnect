-- =============================================================================
-- Migration 124: Forward-Repair der Cron-Sweep-Indizes aus Migration 122
--
-- WARUM DIESE MIGRATION EXISTIERT (Drift-Reparatur, 2026-06-04):
--   Migration 122 legte fuenf Stuetz-Indizes an. Ihr erster Index referenzierte
--   `webhook_deliveries` — eine Tabelle, die nie entstand, weil ihre Eltern-
--   tabelle `org_integrations` im gesamten Migrations-Baum fehlt (Integrations-
--   Webhook = out of go-live scope, siehe 047 + docs/PILOT_GO_LIVE_TODOS.md).
--   122 war als eine Transaktion (BEGIN…COMMIT) geschrieben: das nackte
--   CREATE INDEX auf der fehlenden Tabelle brach die GESAMTE Transaktion ab —
--   ALLE fuenf Indizes wurden zurueckgerollt, auch die vier gueltigen.
--   Der damals ungehaertete migrate.sh-Runner (psql -f ohne ON_ERROR_STOP)
--   verbuchte den Fehlschlag dennoch faelschlich als "applied".
--   Netto: 122 steht als angewandt im Ledger, hat aber KEINEN Index angelegt.
--
-- WAS 124 TUT:
--   Legt die VIER gueltigen Indizes (Sweeps 2-5 aus 122) idempotent an. Der
--   webhook-Index bleibt bewusst draussen, bis die Integrations-Funktion ihre
--   eigene Tabelle mitbringt (dann greift der to_regclass-Guard in 047/122).
--
--   - Bestands-DB (Drift vorhanden): 124 legt die vier fehlenden Indizes an.
--   - Frische DB: 122 ist inzwischen gehaertet (webhook-Index hinter
--     to_regclass-Guard) und legt die vier Indizes bereits selbst an. 124 ist
--     dort dank CREATE INDEX IF NOT EXISTS ein sauberer No-Op.
--
--   Reines Performance-Add-on: KEINE Schema-/Verhaltensaenderung, keine
--   Bestandsdaten beruehrt, vollstaendig rueckwaertskompatibel. Identische
--   Index-Namen/Spalten/Praedikate wie in 122 (Sweeps 2-5).
--
-- WARUM KEINE _migrations-Zeilenchirurgie:
--   Die 122-Zeile zu loeschen wuerde 122 erneut ausfuehren (unnoetig + bei
--   weiteren latenten Defekten riskant). Stattdessen wird die Realitaet per
--   additivem 124 an das Ledger angeglichen — der idiomatische Forward-Fix.
--
-- Rollback (jeder Index einzeln idempotent abbaubar, kein Datenverlust):
--   DROP INDEX IF EXISTS staffing_invites_expiry_idx;
--   DROP INDEX IF EXISTS staffing_reservations_expiry_idx;
--   DROP INDEX IF EXISTS demand_requests_notdienst_escalate_idx;
--   DROP INDEX IF EXISTS sla_search_jobs_open_created_idx;
--
-- Phase 5 Finalisierung — Phase Q (Index-Review, Drift-Repair) — 2026-06-04
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- (122 §2) staffing-maintenance: expireStaleStaffingState (Invites)
--   WHERE status IN ('sent','viewed','interested','accepted')
--     AND expires_at IS NOT NULL AND expires_at <= NOW()
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS staffing_invites_expiry_idx
  ON assignment_staffing_invites(expires_at)
  WHERE expires_at IS NOT NULL
    AND status IN ('sent','viewed','interested','accepted');
COMMENT ON INDEX staffing_invites_expiry_idx
  IS 'Stuetzt expireStaleStaffingState: faellige offene Invites nach expires_at. Verhindert Full-Scan im staffing-maintenance-Tick.';

-- ---------------------------------------------------------------------------
-- (122 §3) staffing-maintenance: expireStaleStaffingState (Reservierungen)
--   WHERE status='reserved' AND expires_at IS NOT NULL AND expires_at <= NOW()
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS staffing_reservations_expiry_idx
  ON assignment_staffing_reservations(expires_at)
  WHERE expires_at IS NOT NULL
    AND status = 'reserved';
COMMENT ON INDEX staffing_reservations_expiry_idx
  IS 'Stuetzt expireStaleStaffingState: faellige reservierte Slots nach expires_at. Verhindert Full-Scan im staffing-maintenance-Tick.';

-- ---------------------------------------------------------------------------
-- (122 §4) demand-notdienst-escalate: notdienstEscalationDemands
--   WHERE status='open' AND sla_status='RUNNING' AND urgency='notdienst'
--   ORDER BY created_at ASC LIMIT $1
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS demand_requests_notdienst_escalate_idx
  ON demand_requests(created_at)
  WHERE status = 'open'
    AND sla_status = 'RUNNING'
    AND urgency = 'notdienst';
COMMENT ON INDEX demand_requests_notdienst_escalate_idx
  IS 'Stuetzt notdienstEscalationDemands: offene Notdienst-Demands nach created_at. Partial auf das kleine Notdienst-Subset, eliminiert den Sort.';

-- ---------------------------------------------------------------------------
-- (122 §5) sla-search-run: runSearchJobsBatch
--   WHERE status='open' ORDER BY created_at ASC LIMIT $1
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sla_search_jobs_open_created_idx
  ON sla_search_jobs(created_at)
  WHERE status = 'open';
COMMENT ON INDEX sla_search_jobs_open_created_idx
  IS 'Stuetzt runSearchJobsBatch: offene Suchauftraege nach created_at. Ersetzt Full-Scan+Sort; Bestandsindizes fuehren mit owner/target oder sla_status=RUNNING.';

COMMIT;
