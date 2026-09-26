-- Migration 220: Ein Gesamtangebot je Mensch — nicht eines je Taktlauf (M4c.1)
-- =============================================================================
-- Migration 145 hat Buendel bewusst vom Dedup-Rueckgrat ausgenommen, mit dieser
-- Begruendung: "Sammel-/Gesamtangebote (bundle/pool_*) sind bewusst ausgenommen —
-- ein Arbeiter darf gezielt einzeln UND im Buendel angeboten werden."
--
-- Der Satz ist richtig und bleibt gueltig. Er beantwortet aber eine ANDERE Frage
-- als die, die M4c.1 stellt. Er erlaubt, dass ein Einzelangebot und ein Buendel
-- DESSELBEN Menschen nebeneinander stehen. Er sagt nichts darueber, ob derselbe
-- Mensch ZWEI Buendel haben darf.
--
-- Bis heute war das folgenlos: Buendel entstehen nur, wenn ein Mensch sie von Hand
-- anlegt (`createOffersFromSelection`, `include_bundle`). Mit M4c.1 erzeugt der
-- Takt sie — und ohne diesen Index legte er bei JEDEM Lauf ein weiteres an. Alle
-- 15 Minuten eines, unbegrenzt, und jedes einzelne sieht fuer sich gueltig aus.
-- Das ist dieselbe Klasse wie der Doppelbuchungs-Befund aus M4c.3: kein Fehler,
-- keine Meldung, nur ein Markt, der mit einem Menschen mehrfach wirbt.
--
-- Der Schutz haengt deshalb an der STRUKTUR, nicht an der Sorgfalt des Aufrufers
-- (CLAUDE.md: "Missbrauchsschutz durch STRUKTUR, nicht durch Kontrolle"). Ein
-- `NOT EXISTS` im Takt schuetzt nur, solange niemand einen zweiten Schreibweg baut.
--
-- Die Statusliste ist WORTGLEICH die des Einzelskill-Index aus 145
-- ('draft','active','paused'): ein archiviertes oder besetztes Buendel gibt den
-- Platz wieder frei, damit der Takt nach dem Einsatz erneut anbieten kann.
--
-- Gemessen am 2026-09-24 gegen die Entwicklungsdatenbank, bevor der Index gesetzt
-- wurde: zwei Menschen mit je EINEM Buendel-Entwurf, keine Doppelten. Der Index
-- kann ohne Bereinigung angelegt werden.
--
-- ROLLBACK / RUECKNAHME:
--   DROP INDEX IF EXISTS capacity_posts_bundle_unique_idx;
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS capacity_posts_bundle_unique_idx
  ON capacity_posts(worker_profile_id)
  WHERE offer_kind = 'bundle'
    AND worker_profile_id IS NOT NULL
    AND status IN ('draft','active','paused');

COMMENT ON INDEX capacity_posts_bundle_unique_idx IS
  'M4c.1: hoechstens EIN offenes Gesamtangebot je Mensch. Einzelangebote daneben bleiben erlaubt (Mig 145).';

COMMIT;
