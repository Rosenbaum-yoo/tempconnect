-- 175_mitarbeiter_ohne_konto.sql
-- P10 Spur D / Welle D5 — ein Mitarbeiter existiert, bevor er sich anmeldet
--
-- WARUM DIESE MIGRATION
-- Der Owner hat entschieden (D-E1): ein Mitarbeiter soll ohne E-Mail
-- importierbar sein, wenn eine Personalnummer vorliegt. Bei der Umsetzung in
-- Welle D4 stellte sich heraus, dass das Datenmodell es nicht zulaesst:
--
--   users.email             NOT NULL
--   users.password_hash     NOT NULL
--   worker_profiles.user_id NOT NULL
--
-- Ein Profil haengt zwingend an einem Konto, ein Konto zwingend an einer
-- Adresse. Wer keine E-Mail hat, existiert nicht — obwohl er real jeden Tag auf
-- der Baustelle steht.
--
-- DREI WEGE STANDEN ZUR WAHL (dokumentiert in docs/features/P10_IMPORT_LIVE_ZEIT.md):
--   A  Platzhalter-Adresse erzeugen (p-4711@import.local)
--   B  worker_profiles.user_id nullbar machen        <- gewaehlt
--   C  users.email nullbar machen
--
-- A waere Fake-Data in einer Personalakte: eine erfundene Adresse, die niemand
-- als erfunden erkennt, und die spaetestens beim ersten Mailversand auffliegt.
-- C ruehrt an Anmeldung, Passwort-Zuruecksetzen, Benachrichtigungen und
-- Rechnungen — groesste Flaeche, groesstes Risiko, kleinster Gewinn.
--
-- B bildet ab, was ohnehin wahr ist: ein Mitarbeiter EXISTIERT, bevor er sich
-- anmeldet. Das Konto ist kein Teil seiner Identitaet, sondern ein Zugangsweg,
-- der spaeter dazukommt.
--
-- ZWEI SICHERUNGEN, DAMIT AUS "OHNE KONTO" KEIN "OHNE IDENTITAET" WIRD
--
-- 1. CHECK: ohne Konto muss eine Personalnummer da sein. Sonst entstuende ein
--    Datensatz, den niemand wiederfinden kann — nicht per E-Mail, nicht per
--    Nummer. Ein zweiter Import legte denselben Menschen erneut an, und keine
--    Auswertung koennte die beiden zusammenfuehren.
--
-- 2. TEILWEISE Eindeutigkeit auf (Org, Personalnummer), NUR fuer Zeilen ohne
--    Konto. Fuer sie ist die Nummer der einzige Schluessel — ohne Eindeutigkeit
--    waere jeder Folgeimport ein Ratespiel.
--    Bewusst NICHT fuer alle Zeilen: im Bestand liegt bereits ein Paar mit
--    gleicher Nummer (geprueft), beide MIT Konto. Dort ist die E-Mail der
--    Schluessel, die Nummer nur ein Merkmal. Eine Eindeutigkeit ueber alles
--    haette diese Migration an echten Daten scheitern lassen — und den
--    Bestand nachtraeglich fuer falsch erklaert, was er nicht ist.
--
-- BESTAND (geprueft, 33 Profile): 0 ohne Konto, 0 ohne Personalnummer UND ohne
-- E-Mail. Die CHECK-Bedingung ist also fuer alle vorhandenen Zeilen erfuellt und
-- laesst sich ohne Vorarbeit anlegen.
--
-- WAS DIESE MIGRATION NICHT TUT
-- Sie erzeugt keine Konten und veraendert keine bestehende Zeile. Ein Profil
-- ohne Konto entsteht nur, wenn der Import es ausdruecklich so anlegt.
--
-- ROLLBACK
--   -- Voraussetzung: es darf kein Profil ohne Konto mehr geben, sonst schlaegt
--   -- das Zuruecksetzen fehl (und das ist richtig so — die Zeilen waeren sonst
--   -- verloren). Zuerst pruefen:
--   --   SELECT count(*) FROM worker_profiles WHERE user_id IS NULL;
--   DROP INDEX IF EXISTS worker_profiles_personalnummer_ohne_konto_idx;
--   ALTER TABLE worker_profiles DROP CONSTRAINT IF EXISTS worker_profiles_identitaet_chk;
--   ALTER TABLE worker_profiles ALTER COLUMN user_id SET NOT NULL;

SET client_min_messages TO WARNING;

BEGIN;

/* ── 1. Das Konto wird optional ───────────────────────────────────────────── */

ALTER TABLE worker_profiles ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN worker_profiles.user_id IS
  'Benutzerkonto — NULL bedeutet: dieser Mitarbeiter ist erfasst, aber noch nicht eingeladen. Das Konto entsteht bei der Einladung und wird dann hier eingetragen. Der bestehende UNIQUE-Index bleibt gueltig: PostgreSQL behandelt NULL-Werte als verschieden, mehrere kontolose Profile sind also erlaubt.';

/* ── 2. Ohne Konto braucht es eine Personalnummer ─────────────────────────── */

DO $$
DECLARE
  verletzt INT;
BEGIN
  SELECT count(*) INTO verletzt
    FROM worker_profiles
   WHERE user_id IS NULL
     AND (personnel_number IS NULL OR btrim(personnel_number) = '');

  IF verletzt > 0 THEN
    RAISE EXCEPTION 'Es gibt % Profile ohne Konto UND ohne Personalnummer — '
                    'diese Zeilen waeren nicht wiederauffindbar. Migration abgebrochen.', verletzt;
  END IF;
END $$;

ALTER TABLE worker_profiles
  ADD CONSTRAINT worker_profiles_identitaet_chk
  CHECK (
    user_id IS NOT NULL
    OR (personnel_number IS NOT NULL AND btrim(personnel_number) <> '')
  );

COMMENT ON CONSTRAINT worker_profiles_identitaet_chk ON worker_profiles IS
  'Jeder Mitarbeiter muss wiederauffindbar sein: entweder ueber sein Konto (und damit seine E-Mail) oder ueber seine Personalnummer. Ohne beides entstuende ein Datensatz, den ein Folgeimport erneut anlegt, weil er ihn nicht wiedererkennt.';

/* ── 3. Die Personalnummer traegt die Eindeutigkeit, wo sie sie tragen muss ─ */

CREATE UNIQUE INDEX IF NOT EXISTS worker_profiles_personalnummer_ohne_konto_idx
  ON worker_profiles (supplier_org_id, lower(btrim(personnel_number)))
  WHERE user_id IS NULL;

COMMENT ON INDEX worker_profiles_personalnummer_ohne_konto_idx IS
  'Nur fuer Profile OHNE Konto: dort ist die Personalnummer der einzige Schluessel, ueber den ein Folgeimport denselben Menschen wiedererkennt. Bewusst nicht fuer alle Zeilen — bei Profilen MIT Konto ist die E-Mail der Schluessel, und im Bestand liegt bereits ein legitimes Paar mit gleicher Nummer.';

COMMIT;
