-- =============================================================================
-- 030_invoicing.sql – B2B Invoice & Invoice Line-Item Tables
-- =============================================================================
-- Tracks subscription invoices per org/user, linked to payment sessions.
-- Supports draft → issued → paid | overdue | void lifecycle.
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Invoice number (human-readable, sequential within tenant)
  invoice_number        TEXT          NOT NULL UNIQUE,

  -- Billing target: org takes precedence over user for B2B
  org_id                UUID          REFERENCES organizations(id) ON DELETE SET NULL,
  user_id               UUID          REFERENCES users(id) ON DELETE SET NULL,

  -- Billing period
  billing_period_start  DATE          NOT NULL,
  billing_period_end    DATE          NOT NULL,

  -- Plan billed
  plan                  TEXT          NOT NULL CHECK (plan IN ('FREE','BASIS','PLUS','NOTDIENST','ENTERPRISE')),

  -- Amounts (in smallest currency unit — Euro Cents)
  amount_cents          INTEGER       NOT NULL CHECK (amount_cents >= 0),
  tax_rate_pct          NUMERIC(5,2)  NOT NULL DEFAULT 19.0,
  tax_amount_cents      INTEGER       NOT NULL DEFAULT 0 CHECK (tax_amount_cents >= 0),
  total_cents           INTEGER       NOT NULL CHECK (total_cents >= 0),
  currency              TEXT          NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR','USD','GBP')),

  -- Status lifecycle
  status                TEXT          NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','paid','overdue','void')),

  -- Payment linkage
  payment_session_id    TEXT,         -- internal checkout id
  stripe_invoice_id     TEXT,         -- Stripe invoice ID if applicable

  -- Dates
  issued_at             TIMESTAMPTZ,
  due_at                TIMESTAMPTZ,  -- 14-day net by default
  paid_at               TIMESTAMPTZ,

  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Line items for itemised invoicing (e.g. per timesheet, per posting, per plan seat)
CREATE TABLE IF NOT EXISTS invoice_items (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id        UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  description       TEXT        NOT NULL,
  quantity          NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit_amount_cents INTEGER     NOT NULL CHECK (unit_amount_cents >= 0),
  total_cents       INTEGER     NOT NULL CHECK (total_cents >= 0),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice number sequence (org-scoped, globally unique number)
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1000;

-- Indexes
CREATE INDEX IF NOT EXISTS invoices_org_status_idx
  ON invoices (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_user_status_idx
  ON invoices (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_stripe_invoice_idx
  ON invoices (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_payment_session_idx
  ON invoices (payment_session_id)
  WHERE payment_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_status_due_idx
  ON invoices (status, due_at)
  WHERE status IN ('issued', 'overdue');
