-- =============================================================================
-- Migration 086: Operational Invoice Truth Hardening
-- Ziel:
--   - Operative Rechnungsfelder robust in invoices/invoice_items absichern
--   - Timesheet↔Invoice-Verknüpfung für eindeutige Leistungsfakturierung herstellen
--   - Payment-Session Plan-Check auf aktuellen Planraum harmonisieren
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) invoices: operational invoice columns + type constraint
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS invoice_type TEXT;

    UPDATE invoices
    SET invoice_type = COALESCE(invoice_type, 'subscription')
    WHERE invoice_type IS NULL;

    ALTER TABLE invoices
      ALTER COLUMN invoice_type SET DEFAULT 'subscription';
    ALTER TABLE invoices
      ALTER COLUMN invoice_type SET NOT NULL;

    ALTER TABLE invoices
      DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_invoice_type_check
      CHECK (invoice_type IN ('subscription', 'operational'));

    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS supplier_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS billing_contact_name TEXT;
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS reference_number TEXT;
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS overtime_surcharge_pct NUMERIC(5,2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoices_type_status_idx
  ON invoices(invoice_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_supplier_status_idx
  ON invoices(supplier_org_id, status, created_at DESC)
  WHERE supplier_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_assignment_idx
  ON invoices(assignment_id, created_at DESC)
  WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_reference_number_idx
  ON invoices(reference_number)
  WHERE reference_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) invoice_items: timesheet-aware line items with controlled item types
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS timesheet_id UUID;
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;
    ALTER TABLE invoice_items
      ADD COLUMN IF NOT EXISTS item_type TEXT;

    UPDATE invoice_items
    SET item_type = COALESCE(item_type, 'subscription')
    WHERE item_type IS NULL;

    ALTER TABLE invoice_items
      ALTER COLUMN item_type SET DEFAULT 'subscription';
    ALTER TABLE invoice_items
      ALTER COLUMN item_type SET NOT NULL;

    ALTER TABLE invoice_items
      DROP CONSTRAINT IF EXISTS invoice_items_item_type_check;
    ALTER TABLE invoice_items
      ADD CONSTRAINT invoice_items_item_type_check
      CHECK (item_type IN ('subscription', 'timesheet_regular', 'timesheet_overtime', 'adjustment'));

    IF to_regclass('public.timesheets') IS NOT NULL THEN
      ALTER TABLE invoice_items
        DROP CONSTRAINT IF EXISTS invoice_items_timesheet_id_fkey;
      ALTER TABLE invoice_items
        ADD CONSTRAINT invoice_items_timesheet_id_fkey
        FOREIGN KEY (timesheet_id) REFERENCES timesheets(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoice_items_timesheet_idx
  ON invoice_items(timesheet_id)
  WHERE timesheet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_items_assignment_idx
  ON invoice_items(assignment_id)
  WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_items_item_type_idx
  ON invoice_items(item_type);

-- ---------------------------------------------------------------------------
-- 3) timesheets: invoice linkage for duplicate-safe billing truth
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.timesheets') IS NOT NULL
     AND to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE timesheets
      ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.timesheets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS timesheets_invoice_id_idx
      ON timesheets(invoice_id)
      WHERE invoice_id IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) payment_sessions: normalize plan check for current commercial model
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.payment_sessions') IS NOT NULL THEN
    ALTER TABLE payment_sessions
      DROP CONSTRAINT IF EXISTS payment_sessions_plan_check;
    ALTER TABLE payment_sessions
      ADD CONSTRAINT payment_sessions_plan_check CHECK (
        plan IN ('FREE', 'DEMO', 'BASIS', 'PLUS', 'PRO', 'NOTDIENST', 'ENTERPRISE', 'INDIVIDUAL', 'INDIVIDUELL')
      );
  END IF;
END $$;

COMMIT;
