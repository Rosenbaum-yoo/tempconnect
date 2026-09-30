-- =============================================================================
-- 189_meldungen_die_ankommen.sql — die Meldefunktion kommt an (Plan I, 10)
-- =============================================================================
-- BEFUND (am 2026-08-22 gegen die LAUFENDE Datenbank bewiesen, nicht gelesen):
--
--   Die Meldefunktion fuer Profile hat noch nie einen Bericht gespeichert. Drei
--   Fehler uebereinander, alle drei lautlos:
--
--   1. FALSCHES VOKABULAR. `profileVisibility.js:225` nimmt die Gruende
--      `spam | fake_profile | misleading_info | inappropriate_content | other`
--      entgegen und die Staff-Oberflaeche zeigt genau dafuer Beschriftungen
--      (`marketplace-visibility/index.tsx:718-720`). Der CHECK dieser Tabelle
--      kennt aber `spam | misleading | inappropriate | fake | other`. Bewiesen:
--
--        INSERT ... reason='fake_profile'
--        ERROR: new row ... violates check constraint
--               "profile_abuse_reports_reason_check"
--
--      Drei der fuenf Gruende waren damit von vornherein unspeicherbar.
--
--   2. `ON CONFLICT` OHNE ZIEL. `profileVisibilityService.js:344` schreibt
--      `ON CONFLICT (reported_org_id, reporter_user_id)`. Einen passenden
--      eindeutigen Index gibt es NICHT — nur `profile_abuse_reports_pkey` auf
--      `id` und zwei nicht-eindeutige. Bewiesen:
--
--        ERROR: there is no unique or exclusion constraint matching the
--               ON CONFLICT specification
--
--      Damit scheiterten auch die verbleibenden zwei Gruende. JEDE Meldung.
--
--   3. STILLE FEHLER. Beide Stellen enden in `catch { return ... }` ohne
--      Protokoll (`:350`, `:373`, `:397`). Der Nutzer bekam "Meldung konnte
--      nicht gespeichert werden", niemand erfuhr warum, und die Tabelle blieb
--      leer — was wie "es meldet halt niemand" aussieht.
--
--   Beide Tabellen haben 0 Zeilen. Das ist kein Zufall, sondern der Beleg.
--
-- WAS DIESE MIGRATION TUT
--   (a) Das Vokabular der Gruende wird auf das der API und der Oberflaeche
--       gebracht. Vorhandene Kurzformen werden zuvor abgebildet — die Migration
--       darf auch in einer Umgebung laufen, in der wider Erwarten Zeilen stehen.
--   (b) Der eindeutige Index, den `ON CONFLICT` braucht, entsteht.
--   (c) `ziel_art`/`ziel_id`: dieselbe Tabelle traegt ab jetzt AUCH gemeldete
--       ANGEBOTE (Plan I, Abschnitt 10: "Bei Angeboten muss man freche oder
--       betruegerische Inhalte ins Staff Control Center melden koennen").
--
-- WARUM KEINE EIGENE TABELLE FUER ANGEBOTE
--   Es gibt bereits DREI angefangene Meldewege: `reports` (Nutzer melden — ein
--   INSERT, NULL Leser), `profile_abuse_reports` (Profile — dieser hier) und
--   `flagged_search_queries` (maschinell). Ein vierter waere die naechste halb
--   gebaute Flaeche. `profile_abuse_reports` ist der EINZIGE mit einem fertigen
--   Ausgang im Staff Control Center (Liste, Erledigen, Abweisen, Oberflaeche) —
--   also waechst dieser, statt daneben einen neuen zu setzen.
--
-- `ziel_id` ist BEWUSST auch bei Profilen gefuellt (dann = `reported_org_id`).
-- Ein NULL-faehiges Ziel haette einen `COALESCE`-Index erzwungen, und ein
-- `ON CONFLICT` auf einen Ausdrucks-Index ist genau die Art Feinheit, die beim
-- naechsten Anfassen bricht — siehe Fehler 2 oben.
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass
-- abgesichert (Lehre aus dem 116-Vorfall).
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
--   DROP CONSTRAINT IF EXISTS vor jedem ADD CONSTRAINT.
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_par_melder_ziel;
--   ALTER TABLE profile_abuse_reports DROP COLUMN ziel_art, DROP COLUMN ziel_id;
--   -- Das Grund-Vokabular zurueckzudrehen ist NICHT noetig: die alten
--   -- Kurzformen bleiben im CHECK erlaubt.
-- =============================================================================

SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------------
-- (a) Das Vokabular der Gruende
-- ---------------------------------------------------------------------------
DO $gruende$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN
    RAISE NOTICE '189: profile_abuse_reports fehlt — uebersprungen.'; RETURN;
  END IF;

  -- Vorhandene Kurzformen auf die Langform bringen. Heute betrifft das 0 Zeilen
  -- (schreiben konnte sie nie jemand), aber eine Migration, die sich darauf
  -- verlaesst, ist eine Migration, die in der einen Umgebung bricht, in der es
  -- doch anders war.
  UPDATE profile_abuse_reports SET reason = 'fake_profile'          WHERE reason = 'fake';
  UPDATE profile_abuse_reports SET reason = 'misleading_info'       WHERE reason = 'misleading';
  UPDATE profile_abuse_reports SET reason = 'inappropriate_content' WHERE reason = 'inappropriate';

  ALTER TABLE profile_abuse_reports DROP CONSTRAINT IF EXISTS profile_abuse_reports_reason_check;
  ALTER TABLE profile_abuse_reports ADD CONSTRAINT profile_abuse_reports_reason_check
    CHECK (reason IN (
      -- Das Vokabular der API (`profileVisibility.js:225`) und der
      -- Staff-Oberflaeche (`marketplace-visibility/index.tsx:718-720`).
      'spam', 'fake_profile', 'misleading_info', 'inappropriate_content', 'other',
      -- Die Kurzformen aus Migration 120 bleiben erlaubt, damit diese Migration
      -- in KEINER Umgebung an Altbestand scheitert. Neu geschrieben wird nur
      -- noch die Langform; der Dienst bildet ab.
      'fake', 'misleading', 'inappropriate'
    ));

  RAISE NOTICE '189: Grund-Vokabular auf die Langform gebracht.';
END $gruende$;

-- ---------------------------------------------------------------------------
-- (c) Ziel der Meldung — Profil oder Angebot
--     Steht VOR (b), weil der eindeutige Index `ziel_art`/`ziel_id` braucht.
-- ---------------------------------------------------------------------------
DO $ziel$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;

  ALTER TABLE profile_abuse_reports
    ADD COLUMN IF NOT EXISTS ziel_art TEXT NOT NULL DEFAULT 'profil',
    ADD COLUMN IF NOT EXISTS ziel_id  UUID;

  ALTER TABLE profile_abuse_reports DROP CONSTRAINT IF EXISTS par_ziel_art_check;
  ALTER TABLE profile_abuse_reports ADD CONSTRAINT par_ziel_art_check
    CHECK (ziel_art IN ('profil', 'angebot'));

  -- Bestand: eine Profilmeldung zeigt auf die gemeldete Organisation.
  UPDATE profile_abuse_reports SET ziel_id = reported_org_id WHERE ziel_id IS NULL;

  ALTER TABLE profile_abuse_reports ALTER COLUMN ziel_id SET NOT NULL;

  COMMENT ON COLUMN profile_abuse_reports.ziel_art IS
    'profil = die Organisation selbst (reported_org_id), angebot = ein Angebot dieser Organisation. '
    'Die Tabelle traegt beide, weil sie den EINZIGEN fertigen Ausgang im Staff Control Center hat — '
    'ein vierter Meldeweg neben reports/profile_abuse_reports/flagged_search_queries waere die '
    'naechste halb gebaute Flaeche.';
  COMMENT ON COLUMN profile_abuse_reports.ziel_id IS
    'Bei ziel_art=profil identisch mit reported_org_id, bei ziel_art=angebot die Angebotskennung. '
    'Bewusst NICHT NULL-faehig: ein NULL-Ziel haette einen COALESCE-Ausdrucksindex erzwungen, und '
    'ein ON CONFLICT darauf ist genau die Feinheit, die hier schon einmal gebrochen ist.';
  COMMENT ON COLUMN profile_abuse_reports.reported_org_id IS
    'Die Organisation, der der gemeldete Inhalt gehoert — auch bei ziel_art=angebot. Damit bleibt '
    'die Staff-Sicht "wer faellt wiederholt auf" ueber beide Zielarten hinweg beantwortbar.';

  RAISE NOTICE '189: ziel_art/ziel_id angelegt.';
END $ziel$;

-- ---------------------------------------------------------------------------
-- (b) Der eindeutige Index, den `ON CONFLICT` verlangt
-- ---------------------------------------------------------------------------
DO $eindeutig$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;

  -- Ein Melder, ein Ziel, eine Meldung. Meldet dieselbe Person dasselbe erneut,
  -- wird die vorhandene Meldung aktualisiert statt eine zweite anzulegen —
  -- genau das wollte `ON CONFLICT` im Dienst, ohne dass es je greifen konnte.
  -- `reporter_user_id` ist NULL-faehig (anonyme Meldung, Kommentar in Migration
  -- 120). NULL kollidiert in Postgres nie mit NULL, anonyme Meldungen werden
  -- also nicht zusammengefasst — das ist richtig so: sie lassen sich nicht
  -- derselben Person zuordnen.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_par_melder_ziel
    ON profile_abuse_reports (reporter_user_id, ziel_art, ziel_id);

  RAISE NOTICE '189: eindeutiger Index idx_par_melder_ziel angelegt.';
END $eindeutig$;

-- ---------------------------------------------------------------------------
-- Der Posteingang: offen ODER in Bearbeitung, aeltestes zuerst.
-- Der bestehende Teilindex deckt nur `status = 'open'` ab; der Dienst liest ab
-- jetzt beide Zustaende, damit ein angefasster Fall nicht aus der Liste faellt,
-- bevor er erledigt ist.
-- ---------------------------------------------------------------------------
DO $eingang$
BEGIN
  IF to_regclass('public.profile_abuse_reports') IS NULL THEN RETURN; END IF;
  CREATE INDEX IF NOT EXISTS idx_par_eingang
    ON profile_abuse_reports (status, created_at ASC)
    WHERE status IN ('open', 'under_review');
  RAISE NOTICE '189: Eingangsindex idx_par_eingang angelegt.';
END $eingang$;
