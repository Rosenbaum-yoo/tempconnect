-- Migration 221: Der Anstoss zur Freigabe kommt an (M4c.12)
-- =============================================================================
-- DIE MELDUNG ENTSTAND NIE.
--
-- `notificationMatrix` fuehrt 54 Ereignisse. Genau EINES bildet auf einen Typ ab,
-- den die Positivliste von `notifications.type` nicht kennt:
--
--   worker.skills_awaiting_release  ->  worker_marktpraesenz
--
-- Gemessen am 2026-09-26 gegen die Entwicklungsdatenbank: 89 Typen erlaubt, 41
-- Typen in der Matrix, einer abgewiesen — mit 23514 (CHECK-Verletzung).
--
-- WARUM ES NIEMAND GEMERKT HAT. Der Aufrufer schluckt den Fehler bewusst
-- (`routes/workerPortal.js`, um die Zeile 615): die Faehigkeiten sind gespeichert,
-- und eine gescheiterte Meldung darf das nicht gefaehrden. Diese Entscheidung ist
-- richtig und bleibt. Die Folge war trotzdem eine gerissene Leitung:
--
--   Der Arbeiter traegt seine Faehigkeiten ein.  -> gespeichert
--   Die Zeitarbeitsfirma soll es erfahren.       -> Meldung scheitert, still
--   Niemand gibt frei.                           -> die Kraft bleibt unsichtbar
--
-- Beide Haelften funktionieren, und dazwischen vermisst niemand etwas — dieselbe
-- Klasse wie die Reset-Mail aus M3.4, die funktionierte und ins Leere fuehrte.
-- Das ist eine plausible Mitursache dafuer, dass am 2026-09-24 nur 3 von 33
-- Kraeften eine freigegebene Katalog-Faehigkeit trugen und der Marktplatz leer
-- wirkte. Es fehlte nicht eine Benachrichtigung, es fehlte der ANSTOSS.
--
-- WARUM DER TYP ERWEITERT WIRD UND NICHT DIE MATRIX GEAENDERT. `worker_marktpraesenz`
-- ist der richtige Name: die Meldung handelt von der Marktpraesenz einer Kraft,
-- nicht von einer Zuweisung oder einem Stundenzettel. Sie einem vorhandenen Typ
-- unterzuschieben haette die Meldung in eine fremde Gruppe gelegt — und die
-- Gruppierung ist das, wonach die Oberflaeche filtert.
--
-- MUSTER WIE MIGRATION 184: die bestehende Liste wird AUS DEM CONSTRAINT gelesen
-- und ergaenzt, nie geraten. Ein Migrationsschritt, der eine Typliste neu
-- hinschreibt, loescht die Typen, die zwischen seiner Entstehung und seinem Lauf
-- dazugekommen sind — lautlos.
--
-- ROLLBACK / RUECKNAHME:
--   -- Zuerst die Zeilen dieses Typs entfernen, sonst scheitert der neue CHECK:
--   -- DELETE FROM notifications WHERE type = 'worker_marktpraesenz';
--   -- danach den CHECK ohne den Wert neu setzen (Muster wie unten, nur mit
--   -- array_remove statt Anhaengen).
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

DO $$
DECLARE
  bestand   TEXT[];
  neu       TEXT[] := ARRAY['worker_marktpraesenz'];
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

  -- Beide Darstellungen lesen (wie 184, und die Nachbesserung aus 171): die
  -- Literal-Form '{a,b,c}'::text[] entsteht nach einem format(%L), die
  -- ARRAY['a'::text, …]-Form ist die urspruengliche Schreibweise. Wer nur eine
  -- liest, meldet eine leere Liste — und haelt dann 54 gueltige Typen fuer
  -- abgewiesen. Genau dieser Fehlalarm ist beim Messen zweimal passiert.
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
