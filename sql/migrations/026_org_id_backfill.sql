-- Migration 026: org_id Backfill fuer Legacy-Tabellen
-- Fuegt org_id Spalte zu listings, requests, ratings, payment_sessions hinzu.
-- Backfill: org_id wird von users.org_id uebernommen (sofern vorhanden).
-- Add-only, keine bestehenden Spalten geaendert.

-- =============================================
-- A) LISTINGS — org_id von owner_id ableiten
-- =============================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS listings_org_idx ON listings(org_id) WHERE org_id IS NOT NULL;

-- Backfill: org_id aus users.org_id uebernehmen
UPDATE listings l
SET org_id = u.org_id
FROM users u
WHERE l.owner_id = u.id AND l.org_id IS NULL AND u.org_id IS NOT NULL;

-- =============================================
-- B) REQUESTS — org_id von requester_id ableiten
-- =============================================

ALTER TABLE requests ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS requests_org_idx ON requests(org_id) WHERE org_id IS NOT NULL;

-- Backfill
UPDATE requests r
SET org_id = u.org_id
FROM users u
WHERE r.requester_id = u.id AND r.org_id IS NULL AND u.org_id IS NOT NULL;

-- =============================================
-- C) RATINGS — org_id von rater_id ableiten
-- =============================================

ALTER TABLE ratings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ratings_org_idx ON ratings(org_id) WHERE org_id IS NOT NULL;

-- Backfill
UPDATE ratings rt
SET org_id = u.org_id
FROM users u
WHERE rt.rater_id = u.id AND rt.org_id IS NULL AND u.org_id IS NOT NULL;

-- =============================================
-- D) PAYMENT_SESSIONS — org_id von user_id ableiten
-- =============================================

ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_sessions_org_idx ON payment_sessions(org_id) WHERE org_id IS NOT NULL;

-- Backfill
UPDATE payment_sessions ps
SET org_id = u.org_id
FROM users u
WHERE ps.user_id = u.id AND ps.org_id IS NULL AND u.org_id IS NOT NULL;
