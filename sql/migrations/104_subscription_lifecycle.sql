-- =============================================================================
-- Migration 104: Subscription-Lifecycle (Welle 8 Schritt 16)
--
-- Ziele:
--   1. **Quote-Snapshot einfrieren**: sobald eine Anfrage in `offered` geht,
--      werden Plan/Preis/Add-ons/Features/Limits aus dem dann gueltigen
--      Catalog-Stand in `quote_snapshot` JSONB persistiert. Spaetere Catalog-
--      Aenderungen (planCatalog.js + Migration 102 catalog_versions) duerfen
--      ein bestehendes Angebot NICHT mehr veraendern. `quote_catalog_version`
--      haelt die Catalog-Version zum Zeitpunkt des Einfrierens.
--   2. **Offer-Ablauf**: `offer_expires_at` ist die deklarative Frist, ab
--      wann ein `offered`/`accepted`-Datensatz vom Cron auf `expired`
--      gesetzt werden darf. Default-Setzung erfolgt im Service
--      (DEFAULT_OFFER_VALIDITY_DAYS), kein DB-Default.
--   3. **Cron-Beobachtbarkeit**: `lifecycle_last_processed_at` haelt den
--      letzten erfolgreichen Lifecycle-Tick pro Anfrage; verhindert
--      Doppelarbeit, ist aber NICHT die Quelle der Idempotenz (das macht
--      der Status + die jeweilige Zeitspalte wie `effective_from`).
--
-- Auto-Linking (Public-Enterprise-Request -> Subscription-Request):
--   Wir haben bereits `source_strategic_request_id` aus 099. Diese Migration
--   ergaenzt einen Partial-UNIQUE-Index, damit pro strategic_request_id
--   maximal EIN offener Subscription-Request auto-verlinkt werden kann.
--   Doppel-Konvertierungen werden so DB-seitig verhindert.
--
-- Bewusst NICHT angefasst:
--   - `effective_from`, `cancellation_effective_at`, `effective_until`,
--     `billing_effective_from`: bestehen aus Migration 100, werden hier
--     vom Cron gelesen aber nicht geaendert.
--   - `subscriptions`/`organizations`: Live-State; wird vom
--     `subscriptionLifecycleService` zur Aktivierungs-/Cancellation-Zeit
--     transaktional manipuliert (eigener Code-Pfad, nicht im Schema).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Quote-Snapshot + Offer-Ablauf
-- ---------------------------------------------------------------------------
ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS quote_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS quote_frozen_at TIMESTAMPTZ NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS quote_catalog_version TEXT NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ NULL;

ALTER TABLE subscription_requests
  ADD COLUMN IF NOT EXISTS lifecycle_last_processed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN subscription_requests.quote_snapshot IS
  'Eingefrorener Plan/Preis/Addons/Features/Limits-Stand zum Zeitpunkt des Wechsels in offered. Spaetere Catalog-Aenderungen veraendern dieses Angebot NICHT. Format siehe subscriptionLifecycleService.buildQuoteSnapshot.';

COMMENT ON COLUMN subscription_requests.offer_expires_at IS
  'Wenn status in (offered, accepted) und offer_expires_at <= NOW(), markiert der Lifecycle-Cron die Anfrage als expired.';

-- ---------------------------------------------------------------------------
-- 2) Cron-Indexes
-- ---------------------------------------------------------------------------

-- Cron-Query 1: Expiry — offered/accepted mit abgelaufener offer_expires_at
CREATE INDEX IF NOT EXISTS idx_subreq_lifecycle_offer_expiry
  ON subscription_requests(offer_expires_at)
  WHERE offer_expires_at IS NOT NULL
    AND status IN ('offered','accepted');

-- Cron-Query 2: Activation — accepted mit faelligem effective_from
CREATE INDEX IF NOT EXISTS idx_subreq_lifecycle_activation_due
  ON subscription_requests(effective_from)
  WHERE effective_from IS NOT NULL
    AND status = 'accepted';

-- Cron-Query 3: Cancellation-Anwendung — active cancellation mit faelligem cancel-Datum
CREATE INDEX IF NOT EXISTS idx_subreq_lifecycle_cancellation_due
  ON subscription_requests(cancellation_effective_at)
  WHERE cancellation_effective_at IS NOT NULL
    AND status = 'active'
    AND request_type = 'cancellation';

-- ---------------------------------------------------------------------------
-- 3) Auto-Linking-Schutz: pro strategic_request_id max. EINE offene
--    Subscription-Request. Doppel-Konvertierungen schlagen DB-seitig fehl.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_subreq_per_strategic_source_open
  ON subscription_requests(source_strategic_request_id)
  WHERE source_strategic_request_id IS NOT NULL
    AND status NOT IN ('rejected','cancelled','expired');

COMMIT;
