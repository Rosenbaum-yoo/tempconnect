-- Migration 114: Fix organizations.plan DEFAULT value
-- Hintergrund: Der DEFAULT-Wert 'FREE' verletzt die CHECK-Constraint
-- organizations_plan_check (erlaubt: DEMO, BASIS, PLUS, PRO, INDIVIDUELL).
-- Jede createOrgWithMembership()-Anfrage scheiterte lautlos daran.
-- Folge: Neu registrierte Nutzer hatten keine Org-Mitgliedschaft.

SET client_min_messages TO WARNING;

-- 1. Fix: DEFAULT von 'FREE' auf 'DEMO' aendern
ALTER TABLE organizations
  ALTER COLUMN plan SET DEFAULT 'DEMO';

-- 2. Sicherheitsnetz: Bestehende Orgs mit ungueltigem plan='FREE' auf 'DEMO' heben
--    (Fallback fuer Zeilen, die durch alte Inserts mit explizitem FREE entstanden sind)
UPDATE organizations
   SET plan = 'DEMO'
 WHERE plan = 'FREE';
