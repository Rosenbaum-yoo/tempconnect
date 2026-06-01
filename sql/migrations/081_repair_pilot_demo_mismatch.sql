-- =============================================================================
-- Migration 081: Repair Pilot/Demo Mismatch
-- Pilotkunden mit DEMO/FREE-Subscription werden auf INDIVIDUELL hochgesetzt.
-- Echte Demo-Accounts (is_demo=TRUE) bleiben unberührt.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Subscriptions reparieren: Aktive Piloten mit FREE/DEMO → INDIVIDUELL
-- ---------------------------------------------------------------------------
UPDATE subscriptions s
SET plan = 'INDIVIDUELL',
    updated_at = NOW()
FROM users u
JOIN org_memberships om ON om.user_id = u.id AND om.is_active = TRUE
JOIN organizations o ON o.id = om.org_id
WHERE s.user_id = u.id
  AND u.is_demo = FALSE
  AND o.pilot_status = 'active'
  AND s.plan IN ('FREE', 'DEMO')
  AND s.status = 'active'
  AND s.id = (
    SELECT s2.id FROM subscriptions s2
    WHERE s2.user_id = u.id
    ORDER BY s2.created_at DESC LIMIT 1
  );

-- ---------------------------------------------------------------------------
-- 2. Organizations: feature_bundle + customer_stage für aktive Piloten setzen
-- ---------------------------------------------------------------------------
UPDATE organizations
SET feature_bundle = 'enterprise_full',
    customer_stage = 'pilot',
    account_type = 'live',
    updated_at = NOW()
WHERE pilot_status = 'active'
  AND (feature_bundle IS NULL OR feature_bundle = 'standard');

-- ---------------------------------------------------------------------------
-- 3. Users: customer_stage für Pilotmitglieder setzen
-- ---------------------------------------------------------------------------
UPDATE users u
SET customer_stage = 'pilot',
    updated_at = NOW()
FROM org_memberships om
JOIN organizations o ON o.id = om.org_id
WHERE om.user_id = u.id
  AND om.is_active = TRUE
  AND o.pilot_status = 'active'
  AND u.is_demo = FALSE
  AND (u.customer_stage IS NULL OR u.customer_stage = 'demo');

-- ---------------------------------------------------------------------------
-- 4. Audit: Anzahl der reparierten Records loggen (informativ)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  repaired_subs INT;
  repaired_orgs INT;
  repaired_users INT;
BEGIN
  SELECT COUNT(*) INTO repaired_subs FROM subscriptions WHERE plan = 'INDIVIDUELL' AND updated_at >= NOW() - INTERVAL '5 seconds';
  SELECT COUNT(*) INTO repaired_orgs FROM organizations WHERE feature_bundle = 'enterprise_full' AND updated_at >= NOW() - INTERVAL '5 seconds';
  SELECT COUNT(*) INTO repaired_users FROM users WHERE customer_stage = 'pilot' AND updated_at >= NOW() - INTERVAL '5 seconds';
  RAISE NOTICE 'Migration 081: Repaired % subscriptions, % organizations, % users', repaired_subs, repaired_orgs, repaired_users;
END $$;

COMMIT;
