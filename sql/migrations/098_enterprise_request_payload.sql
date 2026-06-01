-- =============================================================================
-- Migration 098: enterprise-request Payload + Public-Submission
-- Erweitert `strategic_collaboration_requests` so, dass das Konfigurator-
-- Formular `/public/enterprise_anfrage.html` vollstaendig persistiert wird.
-- Zusaetzlich werden public Submissions (ohne Login) ermoeglicht.
--
-- Erlaubt SCC-Inbox dann, neue Anfragen ueber `request_type` zu unterscheiden
-- und alle relevanten Eckdaten anzuzeigen.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) NULLABLE machen: requester_user_id, requester_org_id
--    Migration 064 hatte diese als NOT NULL. Public-Submissions brauchen
--    aber Submissions ohne Session/Org-Kontext.
-- ---------------------------------------------------------------------------
ALTER TABLE strategic_collaboration_requests
  ALTER COLUMN requester_user_id DROP NOT NULL;

ALTER TABLE strategic_collaboration_requests
  ALTER COLUMN requester_org_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Payload-Spalten fuer Konfigurator (Plan, Addons, Seats, Schaetzungen).
--    Alle nullable, damit Public-Profile-Submissions weiterhin schlank sind.
-- ---------------------------------------------------------------------------
ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'enterprise_config';

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS plan_requested TEXT NULL;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS base_price_cents INTEGER NULL
    CHECK (base_price_cents IS NULL OR base_price_cents >= 0);

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS seats_requested INTEGER NULL
    CHECK (seats_requested IS NULL OR seats_requested >= 0);

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS seats_included INTEGER NULL
    CHECK (seats_included IS NULL OR seats_included >= 0);

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS seat_price_cents INTEGER NULL
    CHECK (seat_price_cents IS NULL OR seat_price_cents >= 0);

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS selected_addons JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS monthly_estimate_cents INTEGER NULL
    CHECK (monthly_estimate_cents IS NULL OR monthly_estimate_cents >= 0);

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS onetime_estimate_cents INTEGER NULL
    CHECK (onetime_estimate_cents IS NULL OR onetime_estimate_cents >= 0);

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS street TEXT NULL;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS city TEXT NULL;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS vat_id TEXT NULL;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS expected_start_date DATE NULL;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS submitted_ip TEXT NULL;

ALTER TABLE strategic_collaboration_requests
  ADD COLUMN IF NOT EXISTS submitted_user_agent TEXT NULL;

-- ---------------------------------------------------------------------------
-- 3) Backfill request_type fuer Bestandsdaten:
--    `enterprise_config` -> bleibt 'enterprise_config'
--    `public_profile`    -> bleibt 'public_profile' (qualifiziertes Interesse)
--    Da bestehende Rows den source_context kennen, mappen wir 1:1.
-- ---------------------------------------------------------------------------
UPDATE strategic_collaboration_requests
   SET request_type = source_context
 WHERE request_type = 'enterprise_config' -- nur unveraenderten Default ueberschreiben
   AND source_context IS NOT NULL
   AND source_context <> 'enterprise_config';

-- ---------------------------------------------------------------------------
-- 4) Indizes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scr_request_type_created
  ON strategic_collaboration_requests (request_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scr_contact_email_created
  ON strategic_collaboration_requests (contact_email, created_at DESC);

COMMIT;

COMMIT;
