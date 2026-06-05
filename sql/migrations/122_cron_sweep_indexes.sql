-- =============================================================================
-- Migration 122: Stuetz-Indizes fuer Cron-Sweep-Queries (Phase Q — Index-Review)
--
-- Skalierungs-Defektklasse "ok bei 10, bricht bei 300":
--   Timer-getriebene Sweeps (api/routes/internal.js) laufen im festen Takt. Ein
--   Praedikat ohne Stuetz-Index ist bei 10 Kunden ein billiger Seq-Scan — bei
--   300 Kunden wird er bei JEDEM Tick zum vollen Table-Scan + Sort. Diese
--   Migration legt fuer fuenf verifizierte Sweeps den jeweils fehlenden
--   Partial-Index an. Reines Performance-Add-on: KEINE Schema-/Verhaltensaenderung,
--   keine Bestandsdaten beruehrt, vollstaendig rueckwaertskompatibel.
--
-- Abgedeckte Sweeps (Sweep -> Service-Funktion -> Grund warum Bestandsindex fehlt):
--   1) webhook-retry        -> integrationService.retryFailedDeliveries
--      Filtert status='failed'. Bestand (Mig 047 webhook_del_retry_idx) ist
--      partiell WHERE status IN ('pending','retrying') — schliesst 'failed' aus.
--   2) staffing-maintenance -> assignmentStaffingService.expireStaleStaffingState
--      Invite-Sweep ueber expires_at. Bestandsindizes (Mig 087) fuehren mit
--      assignment_id / worker_user_id — kein Index auf expires_at.
--   3) staffing-maintenance -> assignmentStaffingService.expireStaleStaffingState
--      Reservierungs-Sweep ueber expires_at. Gleiche Luecke wie (2).
--   4) demand-notdienst-escalate -> marketplaceService.notdienstEscalationDemands
--      ORDER BY created_at, Filter urgency='notdienst'. Bestand
--      (Mig 014 demand_requests_sla_scan_idx) fuehrt mit sla_due_at, ohne
--      created_at-Ordnung und ohne urgency — erzwingt Sort.
--   5) sla-search-run       -> slaSearchService.runSearchJobsBatch
--      WHERE status='open' ORDER BY created_at. Bestandsindizes (Mig 015) fuehren
--      mit owner_company_id / target_type bzw. sind partiell auf sla_status=
--      'RUNNING' (deckt MET/BREACHED/NULL offene Jobs nicht) — voller Scan + Sort.
--
-- Bewusst NICHT enthalten (dokumentierte Owner-/Folge-Entscheidungen):
--   - recompute-compliance (requests-Sweep): Designschwäche, nicht Indexluecke —
--     der Sweep re-sortiert die gesamte requests-Tabelle ohne WHERE. Richtiger Fix
--     ist Bounding (Verhaltensaenderung), kein Index. Bleibt Folge-Ticket.
--   - notdienst-escalate (requests.priority): Spalten-Provenienz unbestaetigt +
--     Write-Amplification auf heisser Kerntabelle. Erst Owner-Klaerung.
--   - webhook-cleanup (created_at): Tabelle ist selbstbegrenzend (~30 Tage Aufbe-
--     wahrung) — Insert-Kosten eines weiteren Index ohne lohnenden ROI.
--
-- Rollback-Strategie (jeder Index einzeln idempotent abbaubar, kein Datenverlust):
--   DROP INDEX IF EXISTS webhook_deliveries_retry_failed_idx;
--   DROP INDEX IF EXISTS staffing_invites_expiry_idx;
--   DROP INDEX IF EXISTS staffing_reservations_expiry_idx;
--   DROP INDEX IF EXISTS demand_requests_notdienst_escalate_idx;
--   DROP INDEX IF EXISTS sla_search_jobs_open_created_idx;
--   (Indizes sind reine Lesepfad-Optimierung; ein Drop stellt exakt den Zustand
--    vor dieser Migration her. Sweeps funktionieren danach korrekt, nur langsamer.)
--
-- Phase 5 Finalisierung — Phase Q (Index-Review, Gate 100) — 2026-06-03
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- 1) webhook-retry: retryFailedDeliveries
--    WHERE status='failed' AND attempt < max_attempts AND next_retry_at <= NOW()
--    ORDER BY next_retry_at ASC LIMIT 100
--    Bestand deckt nur status IN ('pending','retrying') ab -> 'failed' fehlt.
-- ---------------------------------------------------------------------------
-- HINWEIS (2026-06-04): webhook_deliveries entsteht erst mit der (out-of-scope)
-- Integrations-Webhook-Funktion (Mig 047, to_regclass-Guard). Fehlt die Tabelle,
-- wuerde ein nacktes CREATE INDEX die gesamte Migration abbrechen — daher Guard.
-- Die uebrigen vier Indizes (2-5) brauchen keinen Guard: ihre Tabellen existieren.
DO $$
BEGIN
  IF to_regclass('public.webhook_deliveries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS webhook_deliveries_retry_failed_idx
      ON webhook_deliveries(next_retry_at)
      WHERE status = 'failed';
    COMMENT ON INDEX webhook_deliveries_retry_failed_idx
      IS 'Stuetzt den webhook-retry-Sweep (status=failed, faellige Retries nach next_retry_at). Ergaenzt Mig 047, das nur pending/retrying partiell indiziert.';
  ELSE
    RAISE NOTICE '122: webhook_deliveries fehlt — webhook_deliveries_retry_failed_idx uebersprungen (out of go-live scope).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) staffing-maintenance: expireStaleStaffingState (Invites)
--    WHERE status IN ('sent','viewed','interested','accepted')
--      AND expires_at IS NOT NULL AND expires_at <= NOW()
--    Bestandsindizes (Mig 087) fuehren mit assignment_id/worker_user_id.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS staffing_invites_expiry_idx
  ON assignment_staffing_invites(expires_at)
  WHERE expires_at IS NOT NULL
    AND status IN ('sent','viewed','interested','accepted');
COMMENT ON INDEX staffing_invites_expiry_idx
  IS 'Stuetzt expireStaleStaffingState: faellige offene Invites nach expires_at. Verhindert Full-Scan im staffing-maintenance-Tick.';

-- ---------------------------------------------------------------------------
-- 3) staffing-maintenance: expireStaleStaffingState (Reservierungen)
--    WHERE status='reserved' AND expires_at IS NOT NULL AND expires_at <= NOW()
--    Gleiche Luecke wie (2) auf der Reservierungstabelle.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS staffing_reservations_expiry_idx
  ON assignment_staffing_reservations(expires_at)
  WHERE expires_at IS NOT NULL
    AND status = 'reserved';
COMMENT ON INDEX staffing_reservations_expiry_idx
  IS 'Stuetzt expireStaleStaffingState: faellige reservierte Slots nach expires_at. Verhindert Full-Scan im staffing-maintenance-Tick.';

-- ---------------------------------------------------------------------------
-- 4) demand-notdienst-escalate: notdienstEscalationDemands
--    WHERE status='open' AND sla_status='RUNNING' AND urgency='notdienst'
--    ORDER BY created_at ASC LIMIT $1
--    Bestand (Mig 014) fuehrt mit sla_due_at -> erzwingt Sort, ohne urgency.
--    Partial deckt nur das kleine Notdienst-Subset -> winziger, billiger Index.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS demand_requests_notdienst_escalate_idx
  ON demand_requests(created_at)
  WHERE status = 'open'
    AND sla_status = 'RUNNING'
    AND urgency = 'notdienst';
COMMENT ON INDEX demand_requests_notdienst_escalate_idx
  IS 'Stuetzt notdienstEscalationDemands: offene Notdienst-Demands nach created_at. Partial auf das kleine Notdienst-Subset, eliminiert den Sort.';

-- ---------------------------------------------------------------------------
-- 5) sla-search-run: runSearchJobsBatch
--    WHERE status='open' ORDER BY created_at ASC LIMIT $1
--    Bestand (Mig 015) fuehrt mit owner_company_id/target_type bzw. ist partiell
--    auf sla_status='RUNNING' -> deckt offene Nicht-RUNNING-Jobs nicht ab.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sla_search_jobs_open_created_idx
  ON sla_search_jobs(created_at)
  WHERE status = 'open';
COMMENT ON INDEX sla_search_jobs_open_created_idx
  IS 'Stuetzt runSearchJobsBatch: offene Suchauftraege nach created_at. Ersetzt Full-Scan+Sort; Bestandsindizes fuehren mit owner/target oder sla_status=RUNNING.';

COMMIT;
