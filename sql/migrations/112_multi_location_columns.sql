-- 027: Multi-Location Columns fuer capacity_posts und assignments
-- ================================================================
-- Ergaenzt location_id an capacity_posts (department_id existiert bereits seit 021).
-- Ergaenzt location_id und department_id an assignments.
-- Alle Spalten nullable mit FK ON DELETE SET NULL (rueckwaertskompatibel).
-- Prerequisite: org_locations und org_departments existieren (seit 022_strategic_platform_layer).

-- ── A) capacity_posts: location_id hinzufuegen ────────────────────────────────

ALTER TABLE capacity_posts
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES org_locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN capacity_posts.location_id IS
  'Standort-FK: welchem Unternehmensstandort dieses Angebot zugeordnet ist. NULL = kein Standort-Scope.';

CREATE INDEX IF NOT EXISTS capacity_posts_location_idx
  ON capacity_posts(location_id)
  WHERE location_id IS NOT NULL;

-- Compound-Index fuer Org+Location-Filterung (haeufigster Query-Pattern)
CREATE INDEX IF NOT EXISTS capacity_posts_org_location_idx
  ON capacity_posts(org_id, location_id, status)
  WHERE location_id IS NOT NULL;

-- ── B) assignments: location_id + department_id hinzufuegen ──────────────────

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES org_locations(id) ON DELETE SET NULL;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES org_departments(id) ON DELETE SET NULL;

COMMENT ON COLUMN assignments.location_id IS
  'Standort-FK: an welchem Standort der Einsatz stattfindet.';

COMMENT ON COLUMN assignments.department_id IS
  'Abteilungs-FK: welcher Abteilung der Einsatz zugeordnet ist.';

CREATE INDEX IF NOT EXISTS assignments_location_idx
  ON assignments(location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assignments_department_idx
  ON assignments(department_id)
  WHERE department_id IS NOT NULL;

-- Compound-Index fuer lokationsgebundene Einsatz-Abfragen
CREATE INDEX IF NOT EXISTS assignments_org_location_status_idx
  ON assignments(org_id, location_id, status)
  WHERE location_id IS NOT NULL;
