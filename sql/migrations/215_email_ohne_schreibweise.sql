-- Migration 215: eine Adresse ist eine Adresse (M2.2)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DER BEFUND, GEMESSEN AM 2026-09-02
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `users_email_key` ist ein gewoehnlicher UNIQUE-Index auf `email` — also
-- GROSS-/KLEINSCHREIBUNGSEMPFINDLICH. `Chef@Firma.de` und `chef@firma.de`
-- sind fuer ihn zwei verschiedene Adressen.
--
-- Und die Abfragen daneben passen dazu nicht zusammen. Drei Konventionen in
-- fuenf Dateien:
--
--   scimService.js:118    LOWER(email) = $1              richtig
--   ssoService.js:178     email = $1 mit toLowerCase()   halb: nur der Wert
--   authService.js:10/72/78   email = $1                 gar nicht
--   routes/demo.js:48         email = $1                 gar nicht
--
-- Daraus folgen DREI Symptome, nicht eines:
--
--   1. Registrierung: `emailExists` prueft exakt, der Index ist exakt — wer
--      sich mit anderer Schreibweise anmeldet, bekommt ein ZWEITES Konto.
--   2. Anmeldung: `getUserCredentials` sucht exakt — wer die Schreibweise
--      seines eigenen Kontos nicht trifft, bekommt "Zugangsdaten falsch",
--      obwohl das Konto existiert.
--   3. Passwort zuruecksetzen: dieselbe exakte Suche, also derselbe stille
--      Fehlschlag.
--
-- Gemessen: 404 Konten, 404 verschiedene Adressen nach Kleinschreibung —
-- heute also kein Doppel. Aber ZEHN Adressen tragen Grossbuchstaben, das
-- Risiko ist scharf.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM DIE DATENBANK ES GARANTIERT UND NICHT DER CODE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Der Code wird gleich mitgeaendert (alle Abfragen auf eine Konvention). Aber
-- der Code ist die Stelle, an der es schon dreimal auseinandergelaufen ist.
-- Ein UNIQUE-Index auf LOWER(email) macht das zweite Konto STRUKTURELL
-- unmoeglich: der naechste Einfuegepfad, den jemand vergisst, scheitert an
-- der Datenbank statt still ein Doppel anzulegen.
--
-- Derselbe Index bedient ausserdem die neuen Abfragen — ohne ihn waere
-- `LOWER(email) = LOWER($1)` ein voller Tabellendurchlauf bei JEDER Anmeldung.
--
-- Der alte Index `users_email_key` BLEIBT: er ist strenger, nicht falsch, und
-- ein Fremdschluessel oder ein ON CONFLICT (email) koennte an ihm haengen
-- (`acceptInvite` hatte bis heute genau das).

SET client_min_messages TO WARNING;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- ZUERST NACHSEHEN, DANN BAUEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Gibt es bereits zwei Konten, die sich nur in der Schreibweise
-- unterscheiden, kann der Index nicht entstehen. Ohne diesen Block waere die
-- Meldung ein nacktes "could not create unique index" — mit ihm steht da,
-- WELCHE Adressen es betrifft. Ein Migrationsfehler, den niemand einordnen
-- kann, wird uebersprungen; einer mit Namen wird behoben.
DO $$
DECLARE
  doppelt TEXT;
BEGIN
  SELECT string_agg(LOWER(email) || ' (' || n || 'x)', ', ')
    INTO doppelt
    FROM (SELECT LOWER(email) AS email, COUNT(*) AS n
            FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1) d;
  IF doppelt IS NOT NULL THEN
    RAISE EXCEPTION
      'Es gibt bereits Konten, die sich nur in der Schreibweise unterscheiden: %. '
      'Diese Doppel muessen zusammengefuehrt werden, BEVOR der Index entstehen kann — '
      'welches Konto bestehen bleibt, ist eine fachliche Entscheidung und keine '
      'technische.', doppelt;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uk
  ON users (LOWER(email));

COMMENT ON INDEX users_email_lower_uk IS
  'Eine Adresse ist eine Adresse (M2.2): macht ein zweites Konto mit anderer '
  'Gross-/Kleinschreibung strukturell unmoeglich und bedient zugleich die '
  'Anmeldung, die seither LOWER(email) = LOWER($1) sucht.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP INDEX IF EXISTS users_email_lower_uk;
--
-- Gefahrlos fuer die Daten — es geht kein Datensatz verloren. ABER: danach
-- sind zwei Konten mit unterschiedlicher Schreibweise wieder moeglich, und
-- die Anmeldung wird langsam (voller Durchlauf je Versuch). Wer den Index
-- zurueckbaut, sollte die Abfragen mit zurueckbauen — sonst bleibt die
-- Wirkung, aber der Schutz ist weg.
--
-- Die zehn heute vorhandenen Adressen mit Grossbuchstaben werden BEWUSST
-- NICHT kleingeschrieben: sie sind eindeutig, und eine Datenaenderung an
-- Konten braucht einen anderen Anlass als eine Index-Migration. Sobald die
-- Abfragen beidseitig kleinschreiben, kommen diese Nutzer mit jeder
-- Schreibweise hinein.
