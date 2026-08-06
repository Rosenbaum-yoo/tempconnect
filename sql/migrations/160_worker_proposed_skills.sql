-- Migration 160: Eigene Faehigkeiten von Arbeitern (kuratierter Vorschlag)
-- =============================================================================
-- Bisher konnten Arbeiter im Einsatzportal ausschliesslich Katalog-Skills
-- ANKREUZEN (platform_skills, kuratiert seit Mig 145). Was ein Arbeiter kann,
-- aber im Katalog fehlt, ging damit verloren — und genau dieses Wissen ist der
-- Rohstoff des Multi-Skill-USP: es macht einen Arbeiter unterscheidbar.
--
-- WARUM NICHT einfach Freitext in den Katalog schreiben lassen:
-- platform_skills ist die gemeinsame Matching-Achse der ganzen Plattform.
-- Liesse man jeden Arbeiter neue Zeilen anlegen, entstuenden binnen Wochen
-- "Stapler", "Staplerfahrer", "Gabelstapler", "Gabelstaplerfahrer/in" als vier
-- verschiedene Skills. Ein Unternehmen, das nach einem davon sucht, faende dann
-- drei Viertel der passenden Arbeiter NICHT. Der Katalog wuerde die Suche
-- kaputtmachen, die er ermoeglichen soll.
--
-- LOESUNG: Ein Vorschlag ist ein echter Skill-Datensatz, aber mit
-- status='proposed'. Er
--   - wird am Arbeiterprofil gespeichert und ist fuer seine Agentur sichtbar
--     (nichts geht verloren, die Aufnahme ist vollstaendig),
--   - taucht NICHT im Auswahlkatalog anderer Arbeiter auf,
--   - erzeugt KEINE automatischen Marktplatz-Angebote,
-- bis ihn jemand freigibt. Beim Freigeben kann der Vorschlag auch als Alias
-- einem bestehenden Skill zugeschlagen werden (aliases[] ist seit Mig 023 da) —
-- dann finden kuenftige Sucher beide Schreibweisen.
--
-- Rollback:
--   DROP INDEX IF EXISTS platform_skills_status_idx;
--   ALTER TABLE platform_skills
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS proposed_by_user_id,
--     DROP COLUMN IF EXISTS proposed_by_org_id,
--     DROP COLUMN IF EXISTS merged_into_skill_id;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Kuratierungs-Status. DEFAULT 'approved' ist bewusst gewaehlt: alle heute
-- vorhandenen Katalog-Zeilen sind kuratiert und bleiben es ohne Datenmigration.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE platform_skills
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'proposed', 'rejected')),
  ADD COLUMN IF NOT EXISTS proposed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_by_org_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  -- Beim Zusammenfuehren: auf welchen kuratierten Skill wurde der Vorschlag
  -- zugeschlagen? Erhaelt die Spur, statt den Vorschlag spurlos zu loeschen.
  ADD COLUMN IF NOT EXISTS merged_into_skill_id UUID REFERENCES platform_skills(id) ON DELETE SET NULL;

-- Der Katalog liest ausschliesslich status='approved' — dieser Index traegt
-- genau diese Abfrage.
CREATE INDEX IF NOT EXISTS platform_skills_status_idx
  ON platform_skills(status, category)
  WHERE is_active = TRUE;

COMMIT;
