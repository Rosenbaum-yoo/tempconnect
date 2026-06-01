-- =============================================================================
-- Migration 075: Marketplace Dealflow — new interaction types
-- Adds: deal_accept (Konditionen zustimmen) and deal_negotiate (Verhandlung anfragen)
-- Extends existing capacity_interactions CHECK constraint.
-- Add-only. Fully backward-compatible.
-- =============================================================================

BEGIN;

ALTER TABLE capacity_interactions
  DROP CONSTRAINT IF EXISTS capacity_interactions_interaction_type_check;

ALTER TABLE capacity_interactions
  ADD CONSTRAINT capacity_interactions_interaction_type_check CHECK (
    interaction_type IN (
      -- existing types
      'interest', 'offer_request', 'question', 'save',
      'requisition_link', 'deal_start', 'contact',
      -- NEW: structured deal-closing actions
      'deal_accept',     -- Unternehmen stimmt Konditionen zu / signalisiert Dealbereitschaft
      'deal_negotiate'   -- Unternehmen bittet um Verhandlung / Anpassung der Konditionen
    )
  );

COMMENT ON CONSTRAINT capacity_interactions_interaction_type_check ON capacity_interactions
  IS 'Erlaubte Interaktionstypen inkl. deal_accept (Zustimmung) und deal_negotiate (Verhandlungsanfrage)';

COMMIT;
