-- 183_meldung_erreicht_das_buero.sql
-- Welle G4 — die Meldung des Menschen erreicht das Buero, sofort
--
-- WARUM DIESE MIGRATION
-- G1 bis G3 haben den Weg gebaut, auf dem sich jemand selbst abmeldet: die
-- Datenschicht (177/181), die Zeitsperre, die Mindestbeschreibung, den leichten
-- Weg fuer die Verspaetung (182). Nur erfaehrt das Buero davon bis heute nichts.
-- Die Zeile entsteht, die Tafel zeigt sie beim naechsten Laden — und morgens um
-- sechs laedt niemand eine Tafel.
--
-- Damit `notificationMatrix.dispatch()` die beiden Anlaesse zustellen kann,
-- braucht `notifications.type` zwei neue Werte. Ohne sie scheitert der INSERT
-- STILL: die Meldung entsteht, die Benachrichtigung nicht, und niemand merkt es
-- (genau die Drift, die Migration 139 einmal schliessen musste).
--
-- WARUM ZWEI TYPEN UND NICHT EINER
-- Abwesenheit und Verspaetung sind verschieden dringend und fuehren zu
-- verschiedenen Handlungen. Ein gemeinsamer Typ zwaenge den Disponenten, jede
-- Meldung zu oeffnen, um zu erfahren, ob er umdisponieren muss oder nur Bescheid
-- weiss. Die Trennung liegt deshalb im Typ, nicht im Text — nur so kann die
-- Oberflaeche spaeter unterscheiden, ohne den Rumpf zu lesen.
--
-- METHODE: ADDITIV AUS DEM BESTAND, NICHT ABGESCHRIEBEN
-- Uebernommen aus Migration 171. Die Liste wird gelesen, ergaenzt und neu
-- gesetzt — sie kann per Konstruktion nichts verlieren, und der Block prueft am
-- Ende nach, dass sie nicht geschrumpft ist. Wer stattdessen eine Typliste
-- abschreibt, loescht die seither hinzugekommenen Werte wieder; das faellt erst
-- auf, wenn eine ganz andere Benachrichtigung ausbleibt.
--
-- ROLLBACK
--   -- Zeilen der beiden Typen entfernen (sonst verletzt der engere CHECK sie):
--   -- DELETE FROM notifications WHERE type IN ('worker_absence_reported','worker_delay_reported');
--   -- danach den CHECK ohne die beiden Werte neu setzen (Muster wie unten,
--   -- nur mit array_remove statt Anhaengen).

SET client_min_messages TO WARNING;

BEGIN;

DO $$
DECLARE
  bestand   TEXT[];
  neu       TEXT[] := ARRAY['worker_absence_reported','worker_delay_reported'];
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
