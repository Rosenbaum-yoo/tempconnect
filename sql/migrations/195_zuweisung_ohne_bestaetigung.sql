-- =============================================================================
-- 195_zuweisung_ohne_bestaetigung.sql — der Verfall bekommt zwei Empfaenger mehr
-- =============================================================================
-- OWNER-ENTSCHEID (I2_FRIST_REGULAERE_ZUWEISUNG.md, Freigabe 2026-08-24):
--   "Option C mit 72h und Kundenmeldung" — reguläre Zuweisungen bekommen eine
--   Frist von 72 Stunden, gedeckelt am Einsatzbeginn; beim Verfall erfaehrt es
--   auch der KUNDE.
--
-- WARUM DER KUNDE HIER MITMUSS, ANDERS ALS BEIM ERSATZ (193):
--   Die Live-Belegschaft des Kunden blendet offene Anfragen NUR im Ersatzfall
--   aus (workforceService.js: `AND NOT (ersetzt_link_id IS NOT NULL AND
--   worker_confirmation_status = 'pending_confirmation')`). Eine regulaere
--   Zuweisung steht dort vom ersten Tag an — gemessen am 2026-08-24: vier
--   Menschen auf Kundentafeln, ohne je zugesagt zu haben, der aelteste seit
--   136 Tagen. Beim Ersatz gab es beim Verfall nichts zurueckzunehmen; hier
--   verschwindet jemand, mit dem der Kunde seine Schicht geplant hat.
--
-- WARUM ZWEI TYPEN UND NICHT EINER:
--   Die Meldungen haben verschiedene Empfaenger, Rechte und Schalter:
--   `worker_assignment_not_confirmed` geht an die Disponenten der
--   Zeitarbeitsfirma (worker.manage, Kategorie workforce_updates),
--   `assignment_worker_not_confirmed` an das Einsatzunternehmen
--   (assignment.edit, Kategorie client_assignment_updates). Wer beides in
--   einen Typ legt, koppelt zwei Schalter, die G4b bewusst getrennt hat.
--
-- WARUM NICHT `worker_replacement_expired` MITBENUTZEN:
--   Der traegt den Titel "Ersatz-Anfrage verfallen". Bei einer regulaeren
--   Zuweisung ist nichts ersetzt worden — der Titel erscheint in Vorschau,
--   Push-Banner und Betreffzeile und waere schlicht falsch.
--
-- WARUM KEIN NEUER STATUSWERT: Der Verfall traegt weiterhin 'expired'
--   (Migration 193). Regulaer und Ersatz unterscheiden sich am `ersetzt_link_id`,
--   nicht am Status — eine zweite Verfallsart waere eine Unterscheidung ohne
--   Unterschied fuer jede spaetere Auswertung.
--
-- DER TITEL IST TEIL DES DATENSCHUTZES (Linie aus 184): In der Kundenrichtung
--   zeigt der Titel auf den EINSATZ, nicht auf die Person — "Platz wieder
--   offen", nicht "Kraft hat nicht bestaetigt".
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: liest den Bestand und haengt nur Fehlendes an (Muster 184/193,
--   bricht laut ab statt eine Liste zu raten).
-- ROLLBACK: Die Typen sind additiv. Rueckbau nur noetig, wenn Zeilen mit
--   diesen Typen geloescht werden sollen:
--     DELETE FROM notifications WHERE type IN
--       ('worker_assignment_not_confirmed','assignment_worker_not_confirmed');
--   dann den CHECK auf die vorherige Liste zuruecksetzen.
-- =============================================================================

SET client_min_messages TO WARNING;

DO $typen_check$
DECLARE
  bestand TEXT[];
  neu     TEXT[] := ARRAY[
    'worker_assignment_not_confirmed',  -- an die Disponenten: Platz wieder offen
    'assignment_worker_not_confirmed'   -- an den Kunden: die Besetzung kam nicht zustande
  ];
  gesamt  TEXT[];
  vorher  INT;
  nachher INT;
  def     TEXT;
  roh     TEXT;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE '195: notifications fehlt — uebersprungen.'; RETURN;
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass
     AND conname  = 'notifications_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION '195: notifications_type_check nicht gefunden — abgebrochen, '
                    'lieber laut scheitern als eine Typliste raten';
  END IF;

  /* Der CHECK hat ZWEI Darstellungen (Lehre aus 171/184/193): die
   * ARRAY['a'::text,...]-Form zitiert jeden Wert, die '{a,b,c}'::text[]-
   * Literal-Form nach einem format(%L) laesst die Anfuehrungszeichen weg. */
  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION '195: Typliste nicht lesbar (%) — abgebrochen', left(def, 120);
  END IF;

  vorher := array_length(bestand, 1);
  gesamt := bestand;
  FOR i IN 1 .. array_length(neu, 1) LOOP
    IF NOT (neu[i] = ANY (gesamt)) THEN
      gesamt := gesamt || neu[i];
    END IF;
  END LOOP;
  nachher := array_length(gesamt, 1);

  IF nachher < vorher THEN
    RAISE EXCEPTION '195: Typliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE '195: notifications.type kennt jetzt % Typen (vorher %).', nachher, vorher;
END $typen_check$;
