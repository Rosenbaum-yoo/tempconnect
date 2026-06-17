-- =============================================================================
-- Migration 130: payment_sessions.request_id
--   (Korrelation Self-Service-Anfrage <-> Stripe-Payment-Session)
--
-- ZWECK (Pre-Launch-Review #2, Findings 2/3, 2026-06-16):
--   Die owner-gelockte Invariante "Aktivierung NUR nach verifizierter Zahlung,
--   NIE aus dem Staff Center" braucht ein serverseitiges Diskriminierungs-Signal:
--   Gehoert zu einer accepted NEW_INDIVIDUAL-Anfrage eine OFFENE (nicht
--   abgeschlossene) Stripe-Payment-Session? Dann darf NUR der Webhook (nach
--   Betrags-/Waehrungs-Tamper-Check) aktivieren — Staff /activate und der
--   Auto-Activate-Cron NICHT. Bisher hatte payment_sessions keine Verknuepfung
--   zur subscription_request, daher diese Korrelationsspalte.
--
--   Genutzt von subscriptionRequestService.applyApprovedChange (Diskriminator)
--   + gesetzt von paymentService.createPaymentSession (Self-Service-Stripe-Pfad,
--   api/routes/payment.js POST /payment/checkout/individuell).
--   Inquiry-Anfragen erzeugen KEINE Stripe-Session -> bleiben staff-aktivierbar.
--
-- Add-only, nullable, idempotent. Bewusst KEINE harte FK: payment_sessions ist ein
-- lose gekoppeltes Session-Log; eine verwaiste request_id ist harmlos und eine FK
-- wuerde nur Migrations-/Loesch-Kopplung erzeugen. Partial-Index nur auf gesetzte
-- Werte (der Lookup filtert request_id IS NOT NULL + method='stripe').
-- =============================================================================

ALTER TABLE payment_sessions
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE INDEX IF NOT EXISTS payment_sessions_request_id_idx
  ON payment_sessions (request_id)
  WHERE request_id IS NOT NULL;
