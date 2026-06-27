-- 144_org_memberships_hr_attributes.sql
-- SCIM 2.0 Enterprise-User-Extension (urn:ietf:params:scim:schemas:extension:enterprise:2.0:User)
-- für den SAP/HR-Add-on (Integrations-Epic B2+). SAP SuccessFactors / Workday / Entra ID / Okta
-- liefern beim SCIM-Provisioning Personalnummer, Kostenstelle, Abteilung und Division mit — das
-- sind die SAP-CO/HR-Felder für Personalmanagement + Kostenstellen-Allokation (deckungsgleich mit
-- den DATEV-Lohn-/Buchungsexport-Feldern, Welle C). Wir speichern sie je ORG-MITGLIEDSCHAFT
-- (employment-spezifisch, NICHT global am User — derselbe Mensch kann in zwei Orgs andere
-- Kostenstellen haben).
-- department als hr_department (Freitext-Label aus dem HRIS) — bewusst getrennt vom bestehenden
-- internen department_id-FK (org_departments). Add-only/idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Rollback:
--   DROP INDEX IF EXISTS org_memberships_cost_center_idx;
--   ALTER TABLE org_memberships
--     DROP COLUMN IF EXISTS employee_number,
--     DROP COLUMN IF EXISTS cost_center,
--     DROP COLUMN IF EXISTS hr_department,
--     DROP COLUMN IF EXISTS division;

ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS cost_center     text;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS hr_department   text;
ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS division        text;

-- Lookup/Gruppierung nach Kostenstelle (SAP-CO- + DATEV-Lohn-Export gruppieren danach).
CREATE INDEX IF NOT EXISTS org_memberships_cost_center_idx
  ON org_memberships(org_id, cost_center) WHERE cost_center IS NOT NULL;

COMMENT ON COLUMN org_memberships.employee_number IS 'SCIM enterprise:2.0 employeeNumber — Personalnummer aus HRIS (SAP SuccessFactors/Workday).';
COMMENT ON COLUMN org_memberships.cost_center     IS 'SCIM enterprise:2.0 costCenter — SAP-CO-Kostenstelle (für Lohn-/Buchungsexport, Welle C).';
COMMENT ON COLUMN org_memberships.hr_department   IS 'SCIM enterprise:2.0 department — Abteilungs-Label aus HRIS (Freitext, ≠ internes department_id).';
COMMENT ON COLUMN org_memberships.division        IS 'SCIM enterprise:2.0 division — Bereich/Division aus HRIS.';
