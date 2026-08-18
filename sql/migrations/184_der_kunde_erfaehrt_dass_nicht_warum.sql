-- 184_der_kunde_erfaehrt_dass_nicht_warum.sql
-- Welle G4b — der Kunde erfaehrt, DASS jemand ausfaellt, nie WARUM
--
-- WARUM DIESE MIGRATION
-- G4 hat die Meldung ins eigene Buero der Zeitarbeitsfirma getragen. Das
-- Einsatzunternehmen weiss bis heute nichts: Es steht morgens um sechs vor einer
-- leeren Schicht und erfaehrt den Ausfall per Anruf — oder gar nicht.
--
-- Drei Anlaesse gehen an den Kunden, und sie brauchen zwei Typen:
--   * die Kraft faellt aus            -> assignment_worker_unavailable (warning)
--   * die Abwesenheit ist aufgehoben  -> assignment_worker_unavailable (Entwarnung,
--                                        derselbe Typ: es ist dieselbe Sache, nur
--                                        zurueckgenommen — ein eigener Typ wuerde
--                                        die Zusammengehoerigkeit zerreissen)
--   * Ersatz ist gestellt             -> assignment_worker_replaced (success)
--
-- DIE TYPNAMEN SIND TEIL DES DATENSCHUTZES
-- Sie heissen NICHT worker_absence_* wie auf der Arbeitgeberseite, sondern
-- assignment_worker_*. Der Typ steht in der Adresszeile der Benachrichtigung, in
-- Filtern, in Exporten und in der Integrations-Konfiguration — er ist selbst eine
-- Aussage. "assignment_worker_unavailable" sagt dem Kunden, was seinen Einsatz
-- angeht: seine Kraft ist nicht verfuegbar. "absence" waere schon ein Wort zu
-- viel Richtung Person statt Richtung Einsatz.
--
-- WAS HIER NICHT PASSIERT
-- Keine neue Spalte, keine neue Tabelle. Was dem Kunden gesagt wurde, steht in
-- `notifications` selbst — dieselbe Tabelle traegt die Historie. Ein eigenes
-- Gedaechtnis waere eine zweite Wahrheit; die Dedupe-Klausel in dispatch()
-- (user_id + type + entity_type + entity_id, eine Stunde) haelt den Doppelversand
-- ohnehin auf.
--
-- METHODE: ADDITIV AUS DEM BESTAND, NICHT ABGESCHRIEBEN
-- Uebernommen aus 171/183. Die Liste wird gelesen, ergaenzt und neu gesetzt — sie
-- kann per Konstruktion nichts verlieren, und der Block prueft am Ende nach, dass
-- sie nicht geschrumpft ist.
--
-- ROLLBACK
--   -- DELETE FROM notifications WHERE type IN ('assignment_worker_unavailable','assignment_worker_replaced');
--   -- danach den CHECK ohne die beiden Werte neu setzen (Muster wie unten,
--   -- nur mit array_remove statt Anhaengen).

SET client_min_messages TO WARNING;

BEGIN;

DO $$
DECLARE
  bestand   TEXT[];
  neu       TEXT[] := ARRAY['assignment_worker_unavailable','assignment_worker_replaced'];
  gesamt    TEXT[];
  vorher    INT;
  nachher   INT;
  def       TEXT;
  roh       TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass
     AND conname  = 'notifications_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check nicht gefunden — Migration abgebrochen, '
                    'lieber laut scheitern als eine Typliste raten';
  END IF;

  -- Beide Darstellungen lesen (siehe die Nachbesserung in 171): die
  -- Literal-Form '{a,b,c}'::text[] entsteht nach einem format(%L), die
  -- ARRAY['a'::text, …]-Form ist die urspruengliche Schreibweise.
  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION 'Typliste aus notifications_type_check nicht lesbar (%) — abgebrochen, '
                    'lieber laut scheitern als eine Typliste raten', left(def, 120);
  END IF;

  vorher := array_length(bestand, 1);

  -- Nur wirklich fehlende Werte anhaengen (idempotent bei Mehrfachlauf).
  gesamt := bestand;
  FOR i IN 1 .. array_length(neu, 1) LOOP
    IF NOT (neu[i] = ANY (gesamt)) THEN
      gesamt := gesamt || neu[i];
    END IF;
  END LOOP;

  nachher := array_length(gesamt, 1);
  IF nachher < vorher THEN
    RAISE EXCEPTION 'Typliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE 'notifications.type: % Typen (vorher %)', nachher, vorher;
END $$;

COMMIT;
