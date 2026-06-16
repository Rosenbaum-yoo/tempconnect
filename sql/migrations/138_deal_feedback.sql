-- Migration: 138_deal_feedback
-- Deal-Feedback v2 (eBay-modelliert, transaktions-verankert an completed assignments).
-- Additiv: Legacy `ratings` (user<->user, request_id) bleibt unangetastet.
-- Spec: docs/finalization/RATING_SYSTEM_V2_EBAY_SPEC.md
-- Rollback: DROP TABLE IF EXISTS deal_feedback;

CREATE TABLE IF NOT EXISTS deal_feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  direction     TEXT NOT NULL CHECK (direction IN ('company_to_supplier','supplier_to_company')),
  rater_org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rated_org_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sentiment     TEXT NOT NULL CHECK (sentiment IN ('positive','neutral','negative')),
  dimensions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment       TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  reply         TEXT CHECK (reply IS NULL OR char_length(reply) <= 500),
  reply_at      TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','revealed','withheld')),
  revealed_at   TIMESTAMPTZ,
  moderation    TEXT NOT NULL DEFAULT 'pending' CHECK (moderation IN ('pending','approved','rejected','flagged')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- max. ein Feedback je Richtung je Deal (verhindert Doppel-/Spam-Bewertung)
  UNIQUE (assignment_id, direction)
);

-- Profil-/Reputationsanzeige: nur revealed + approved je bewerteter Org
CREATE INDEX IF NOT EXISTS deal_feedback_rated_idx ON deal_feedback(rated_org_id, moderation, revealed_at);
CREATE INDEX IF NOT EXISTS deal_feedback_assignment_idx ON deal_feedback(assignment_id);
CREATE INDEX IF NOT EXISTS deal_feedback_actor_idx ON deal_feedback(actor_user_id);
