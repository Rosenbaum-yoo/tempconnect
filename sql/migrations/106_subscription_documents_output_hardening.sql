-- =============================================================================
-- Migration 106: subscription_documents output hardening
--
-- Ziel:
--   Neue Abo-Dokumente fachlich sauber halten:
--     - cost_preview
--     - offer
--     - order_confirmation
--     - change_confirmation
--     - cancellation_confirmation
--
-- WICHTIG:
--   Der neue CHECK wird NOT VALID angelegt. Dadurch bleiben ggf. bestehende
--   Alt-Dokumente vom frueheren Typ `plan_overview` erhalten und gehen nicht
--   verloren, neue Inserts muessen aber die bereinigte Typ-Liste erfuellen.
--   Nach Datenpruefung kann der Constraint spaeter validiert werden.
-- =============================================================================

BEGIN;

ALTER TABLE subscription_documents
  DROP CONSTRAINT IF EXISTS subscription_documents_document_type_check;

ALTER TABLE subscription_documents
  ADD CONSTRAINT subscription_documents_document_type_check
  CHECK (document_type IN (
    'cost_preview',
    'offer',
    'order_confirmation',
    'change_confirmation',
    'cancellation_confirmation'
  )) NOT VALID;

COMMENT ON CONSTRAINT subscription_documents_document_type_check ON subscription_documents IS
  'Neue Subscription-Dokumente sind auf nicht-rechnungsbezogene Tarif-/Vertragsdokumente begrenzt; NOT VALID schuetzt bestehende Alt-Dokumente bis zur Datenpruefung.';

COMMIT;
