-- 142_invoice_dunning_state.sql
-- SaaS-Self-Service-Billing (feature-flagged, inaktiv bis UG-Gründung):
-- Dunning-State auf Rechnungen, damit der Dunning-Sweep gestaffelte
-- Zahlungserinnerungen genau einmal pro Stufe versendet (kein Spam, idempotent).
--
-- Steuert KEIN Verhalten von sich aus — der Sweep läuft nur bei DUNNING_ENABLED=true.
-- Reine additive Migration (IF NOT EXISTS), rückwärtskompatibel.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_subs_recurring_due;
--   DROP INDEX IF EXISTS invoices_dunning_overdue_idx;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS last_dunning_at;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS dunning_level;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS dunning_level   INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN invoices.dunning_level   IS 'Höchste bereits versendete Mahnstufe (0=keine). Gesteuert vom Dunning-Sweep (DUNNING_ENABLED).';
COMMENT ON COLUMN invoices.last_dunning_at IS 'Zeitpunkt der letzten versendeten Zahlungserinnerung (Cooldown-Schutz gegen Doppelversand).';

-- Partial-Index: der Dunning-Sweep scannt nur überfällige Rechnungen, geordnet nach
-- letzter Erinnerung. Hält den Sweep auch bei 300+ Kunden günstig (nur 'overdue'-Teilmenge).
CREATE INDEX IF NOT EXISTS invoices_dunning_overdue_idx
  ON invoices (last_dunning_at NULLS FIRST, due_at)
  WHERE status = 'overdue';

-- Recurring-Billing-Cron (`generateRecurringInvoices`): selektiert aktive, bezahlte
-- (nicht-Trial) Subscriptions mit abgelaufener Periode. Spiegelt die Partial-Index-
-- Strategie von Mig 119 (`idx_subs_trial_expiry` / `idx_subs_hard_lock_due`) für den
-- bezahlten Zwilling — hält den monatlichen Sweep auch bei 300→3000 Subs günstig.
CREATE INDEX IF NOT EXISTS idx_subs_recurring_due
  ON subscriptions (current_period_end)
  WHERE status = 'active'
    AND trial_mode = FALSE
    AND current_period_end IS NOT NULL;
