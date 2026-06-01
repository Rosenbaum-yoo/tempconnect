-- Migration 028: Add PRO and ENTERPRISE to plan check constraints
-- These plans are referenced by planFeatures.js (timesheets, advanced features) but were
-- missing from the DB-side CHECK constraints. This migration closes that gap.

-- subscriptions.plan_check: add PRO + ENTERPRISE
ALTER TABLE subscriptions
  DROP CONSTRAINT subscriptions_plan_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan = ANY (ARRAY[
    'FREE'::text,
    'BASIS'::text,
    'PLUS'::text,
    'NOTDIENST'::text,
    'PRO'::text,
    'ENTERPRISE'::text
  ]));

-- organizations.plan_check: add PRO (ENTERPRISE already present, but rebuild for safety)
ALTER TABLE organizations
  DROP CONSTRAINT organizations_plan_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan = ANY (ARRAY[
    'FREE'::text,
    'BASIS'::text,
    'PLUS'::text,
    'NOTDIENST'::text,
    'PRO'::text,
    'ENTERPRISE'::text
  ]));
