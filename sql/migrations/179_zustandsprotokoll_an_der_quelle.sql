-- 179_zustandsprotokoll_an_der_quelle.sql
-- P10 Spur E / Welle E5 — jede Zustandsaenderung wird mitgeschrieben
--
-- DIE ZUSAGE DES GATES
--   "Ein Test belegt, dass ein Zustandswechsel OHNE Protokolleintrag nicht
--    moeglich ist."
--
-- Das ist eine harte Zusage. Ein Dienst, der brav `protokolliere()` aufruft,
-- kann sie NICHT einloesen: die naechste Route, der naechste Import, ein
-- Hotfix per SQL — jeder Pfad, der die Quelle aendert, ohne den Dienst zu
-- benutzen, hinterlaesst eine Luecke, die niemand bemerkt. Ein Test koennte dann
-- nur beweisen, dass UNSER Code protokolliert, nicht dass ein Wechsel ohne
-- Eintrag unmoeglich ist.
--
-- Deshalb steht das Protokoll in der Datenbank, an den drei Tabellen, aus denen
-- der Zustand entsteht. Ein UPDATE per psql um drei Uhr nachts wird genauso
-- mitgeschrieben wie ein Klick in der Oberflaeche.
--
-- EINE DEFINITION DES ZUSTANDS, NICHT ZWEI
-- Die Tafel (workforceService.getWorkerLiveBoard) berechnet den Zustand in SQL.
-- Ein Trigger, der dieselbe Fallunterscheidung noch einmal in PL/pgSQL
-- nachbaut, waere eine zweite Wahrheit — und die driftet, sobald jemand nur
-- eine der beiden Stellen anfasst. Hier gibt es deshalb EINE Funktion,
-- `worker_live_status(profil)`, und ein Test vergleicht sie zeilenweise mit dem,
-- was die Tafel anzeigt (api/test/integration/zustandsprotokoll.flow.test.js).
--
-- WARUM 'endet_bald' NICHT PROTOKOLLIERT WIRD
-- Es ist keine Zustandsaenderung, sondern eine FRIST: niemand loest sie aus, sie
-- tritt durch Zeitablauf ein. Im Protokoll waere sie ein Ereignis ohne Ursache —
-- und ein Trigger kann sie ohnehin nicht sehen, weil zum Zeitpunkt des Uebergangs
-- keine Zeile geschrieben wird. Ein naechtlicher Job, der solche Uebergaenge
-- nachtraegt, wurde bewusst verworfen: er wuerde genau die kurzen Zustaende
-- verpassen, wegen derer der Plan das Protokoll ueberhaupt verlangt.
-- Das Protokoll fuehrt daher die FACHLICHEN Zustaende:
--   verfuegbar | im_einsatz | montage | abwesend | inaktiv
-- Die Tafel zeigt 'endet_bald' weiterhin — als Verfeinerung von 'im_einsatz'.
--
-- AUFBEWAHRUNG: 24 MONATE (Owner-Entscheidung 2026-08-13, VOR dem Bau getroffen)
-- Deckt eine Betriebspruefung ab und haelt die Tabelle klein. Die Regel steht als
-- Funktion `worker_status_events_aufraeumen()` in der Datenbank — dort, wo die
-- Daten liegen —, damit sie nicht davon abhaengt, dass jemand sie im
-- Anwendungscode nachbaut. Geplant wird sie taeglich ueber die vorhandene
-- Job-Infrastruktur (api/workers/index.js).
--
-- MENGENGERUEST: ein Ereignis je Zustandswechsel je Mensch. Bei 300 Kunden x 200
-- Kraeften x etwa 30 Wechseln im Jahr sind das ~1,8 Mio Zeilen in 24 Monaten —
-- unkritisch, solange der Index steht und die Aufbewahrung greift.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS worker_absences_protokoll ON worker_absences;
--   DROP TRIGGER IF EXISTS worker_assignment_links_protokoll ON worker_assignment_links;
--   DROP TRIGGER IF EXISTS worker_profiles_protokoll ON worker_profiles;
--   DROP FUNCTION IF EXISTS worker_status_protokoll_trigger();
--   DROP FUNCTION IF EXISTS worker_status_protokollieren(UUID, TEXT, UUID);
--   DROP FUNCTION IF EXISTS worker_status_events_aufraeumen();
--   DROP FUNCTION IF EXISTS worker_live_status(UUID);
--   DROP TABLE IF EXISTS worker_status_events;

SET client_min_messages TO WARNING;

BEGIN;

/* ── 1. Das Protokoll ──────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS worker_status_events (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  worker_profile_id UUID        NOT NULL,
  supplier_org_id   UUID        NOT NULL,

  -- NULL beim allerersten Ereignis eines Menschen: davor gab es keinen Zustand.
  -- Eine erfundene Vorgeschichte waere schlimmer als ein ehrliches "unbekannt".
  von_zustand       TEXT,
  nach_zustand      TEXT        NOT NULL,

  -- WAS die Aenderung ausgeloest hat (die Tabelle), nicht WER.
  ausgeloest_durch  TEXT        NOT NULL,
  -- Worauf sie sich bezieht: die Abwesenheit, der Einsatz, das Profil.
  bezug_typ         TEXT,
  bezug_id          UUID,

  zeitpunkt         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT worker_status_events_profil_org_fk
    FOREIGN KEY (worker_profile_id, supplier_org_id)
    REFERENCES worker_profiles (id, supplier_org_id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT worker_status_events_zustand_chk
    CHECK (nach_zustand IN ('verfuegbar', 'im_einsatz', 'montage', 'abwesend', 'inaktiv')),
  CONSTRAINT worker_status_events_von_zustand_chk
    CHECK (von_zustand IS NULL OR von_zustand IN ('verfuegbar', 'im_einsatz', 'montage', 'abwesend', 'inaktiv')),
  CONSTRAINT worker_status_events_ausloeser_chk
    CHECK (ausgeloest_durch IN ('abwesenheit', 'einsatz', 'profil')),

  -- Ein Ereignis, das nichts veraendert, ist kein Ereignis. Ohne diese Bedingung
  -- fuellte sich der Zeitstrahl mit Zeilen "im_einsatz -> im_einsatz", und die
  -- eine echte Aenderung ginge darin unter.
  CONSTRAINT worker_status_events_echte_aenderung_chk
    CHECK (von_zustand IS DISTINCT FROM nach_zustand)
);

/* Der eine Zugriff des Zeitstrahls: ein Mensch, neueste zuerst.
 * Die Aufbewahrung raeumt ueber `zeitpunkt` — deshalb steht er im Index. */
CREATE INDEX IF NOT EXISTS worker_status_events_profil_zeit_idx
  ON worker_status_events (worker_profile_id, zeitpunkt DESC);

/* Fuer die Aufraeum-Abfrage und org-weite Auswertungen. BRIN waere hier reizvoll
 * (append-only, zeitkorreliert), btree bleibt aber richtig: die Aufbewahrung
 * loescht einen zusammenhaengenden aeltesten Block, und dafuer ist ein
 * gewoehnlicher Bereichsscan schnell genug. */
CREATE INDEX IF NOT EXISTS worker_status_events_org_zeit_idx
  ON worker_status_events (supplier_org_id, zeitpunkt DESC);

COMMENT ON TABLE worker_status_events IS
  'Zustands-Protokoll der Belegschaft (Welle E5). Wird von Triggern an den drei Quelltabellen geschrieben — nicht vom Anwendungscode, damit kein Schreibpfad es umgehen kann. Aufbewahrung: 24 Monate (Owner-Entscheidung 2026-08-13).';
COMMENT ON COLUMN worker_status_events.von_zustand IS
  'Vorheriger Zustand. NULL nur beim allerersten Ereignis eines Menschen.';
COMMENT ON COLUMN worker_status_events.ausgeloest_durch IS
  'Welche Quelle die Aenderung ausgeloest hat: abwesenheit | einsatz | profil. Das WER steht im audit_log — hier gehoert es nicht hin, weil ein Trigger die Sitzung nicht kennt.';

/* ── 2. Die EINE Definition des Zustands ───────────────────────────────────── */

CREATE OR REPLACE FUNCTION worker_live_status(p_profil UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN wp.is_active = FALSE THEN 'inaktiv'
    WHEN EXISTS (
      SELECT 1 FROM worker_absences ab
       WHERE ab.worker_profile_id = wp.id
         AND ab.aufgehoben_am IS NULL
         AND ab.von <= CURRENT_DATE
         AND (ab.bis IS NULL OR ab.bis >= CURRENT_DATE)
    ) THEN 'abwesend'
    WHEN EXISTS (
      SELECT 1 FROM worker_assignment_links wal
       WHERE wal.worker_user_id = wp.user_id
         AND wal.supplier_org_id = wp.supplier_org_id
         AND wal.is_active = TRUE
         AND wal.is_montage = TRUE
         AND wal.start_date <= CURRENT_DATE
         AND (wal.end_date IS NULL OR wal.end_date >= CURRENT_DATE)
    ) THEN 'montage'
    WHEN EXISTS (
      SELECT 1 FROM worker_assignment_links wal
       WHERE wal.worker_user_id = wp.user_id
         AND wal.supplier_org_id = wp.supplier_org_id
         AND wal.is_active = TRUE
         AND wal.start_date <= CURRENT_DATE
         AND (wal.end_date IS NULL OR wal.end_date >= CURRENT_DATE)
    ) THEN 'im_einsatz'
    ELSE 'verfuegbar'
  END
  FROM worker_profiles wp
  WHERE wp.id = p_profil;
$$;

COMMENT ON FUNCTION worker_live_status(UUID) IS
  'Fachlicher Zustand eines Mitarbeiters — die EINE Definition, die auch die Trigger benutzen. Kennt bewusst kein "endet_bald": das ist eine Frist, kein Zustand, und hat keinen Ausloeser. Die Rangfolge ist dieselbe wie in getWorkerLiveBoard: inaktiv > abwesend > montage > im_einsatz > verfuegbar.';

/* ── 3. Schreiben, aber nur bei echter Aenderung ───────────────────────────── */

CREATE OR REPLACE FUNCTION worker_status_protokollieren(
  p_profil UUID, p_ausloeser TEXT, p_bezug_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_org    UUID;
  v_neu    TEXT;
  v_alt    TEXT;
BEGIN
  SELECT supplier_org_id INTO v_org FROM worker_profiles WHERE id = p_profil;
  IF v_org IS NULL THEN
    RETURN;   -- Profil geloescht: der Fremdschluessel raeumt ohnehin mit auf
  END IF;

  v_neu := worker_live_status(p_profil);
  IF v_neu IS NULL THEN
    RETURN;
  END IF;

  SELECT nach_zustand INTO v_alt
    FROM worker_status_events
   WHERE worker_profile_id = p_profil
   ORDER BY zeitpunkt DESC, id DESC
   LIMIT 1;

  -- Kein Eintrag, wenn sich nichts geaendert hat. Ein Zeitstrahl, der jede
  -- Adressaenderung als Zustandswechsel fuehrt, ist unlesbar.
  IF v_alt IS NOT DISTINCT FROM v_neu THEN
    RETURN;
  END IF;

  INSERT INTO worker_status_events
    (worker_profile_id, supplier_org_id, von_zustand, nach_zustand, ausgeloest_durch, bezug_typ, bezug_id)
  VALUES
    (p_profil, v_org, v_alt, v_neu, p_ausloeser, p_ausloeser, p_bezug_id);
END $$;

/* ── 4. Die Trigger an den drei Quellen ────────────────────────────────────── */

CREATE OR REPLACE FUNCTION worker_status_protokoll_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_profil UUID;
  v_zeile  RECORD;
BEGIN
  v_zeile := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME = 'worker_absences' THEN
    v_profil := v_zeile.worker_profile_id;
    PERFORM worker_status_protokollieren(v_profil, 'abwesenheit', v_zeile.id);

  ELSIF TG_TABLE_NAME = 'worker_assignment_links' THEN
    -- Der Link kennt das Konto, nicht das Profil. Ueber supplier_org_id
    -- eingegrenzt, damit nicht das gleichnamige Profil einer anderen Agentur
    -- getroffen wird.
    SELECT wp.id INTO v_profil
      FROM worker_profiles wp
     WHERE wp.user_id = v_zeile.worker_user_id
       AND wp.supplier_org_id = v_zeile.supplier_org_id
     LIMIT 1;
    IF v_profil IS NOT NULL THEN
      PERFORM worker_status_protokollieren(v_profil, 'einsatz', v_zeile.assignment_id);
    END IF;

  ELSIF TG_TABLE_NAME = 'worker_profiles' THEN
    PERFORM worker_status_protokollieren(v_zeile.id, 'profil', v_zeile.id);
  END IF;

  RETURN NULL;   -- AFTER-Trigger: der Rueckgabewert wird nicht ausgewertet
END $$;

DROP TRIGGER IF EXISTS worker_absences_protokoll ON worker_absences;
CREATE TRIGGER worker_absences_protokoll
  AFTER INSERT OR UPDATE OR DELETE ON worker_absences
  FOR EACH ROW EXECUTE FUNCTION worker_status_protokoll_trigger();

/* Nur die Spalten, die den Zustand tragen. Ohne diese Einschraenkung schriebe
 * jede Adress- oder Notizaenderung am Einsatz einen Trigger-Durchlauf — teuer
 * und ohne Erkenntnis. (Die Funktion filtert unveraenderte Zustaende ohnehin
 * heraus; hier wird der Aufruf selbst gespart.) */
DROP TRIGGER IF EXISTS worker_assignment_links_protokoll ON worker_assignment_links;
CREATE TRIGGER worker_assignment_links_protokoll
  AFTER INSERT OR DELETE ON worker_assignment_links
  FOR EACH ROW EXECUTE FUNCTION worker_status_protokoll_trigger();

DROP TRIGGER IF EXISTS worker_assignment_links_protokoll_upd ON worker_assignment_links;
CREATE TRIGGER worker_assignment_links_protokoll_upd
  AFTER UPDATE OF is_active, is_montage, start_date, end_date ON worker_assignment_links
  FOR EACH ROW EXECUTE FUNCTION worker_status_protokoll_trigger();

DROP TRIGGER IF EXISTS worker_profiles_protokoll ON worker_profiles;
CREATE TRIGGER worker_profiles_protokoll
  AFTER UPDATE OF is_active ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION worker_status_protokoll_trigger();

/* ── 5. Aufbewahrung: 24 Monate ────────────────────────────────────────────── */

CREATE OR REPLACE FUNCTION worker_status_events_aufraeumen()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_geloescht INTEGER;
BEGIN
  DELETE FROM worker_status_events
   WHERE zeitpunkt < NOW() - INTERVAL '24 months';
  GET DIAGNOSTICS v_geloescht = ROW_COUNT;
  RETURN v_geloescht;
END $$;

COMMENT ON FUNCTION worker_status_events_aufraeumen() IS
  'Aufbewahrung 24 Monate (Owner-Entscheidung 2026-08-13, vor dem Bau festgelegt). Die Frist steht hier statt im Anwendungscode, damit sie nicht davon abhaengt, dass jemand sie dort nachbaut. Geplant taeglich ueber api/workers/index.js.';

COMMIT;
