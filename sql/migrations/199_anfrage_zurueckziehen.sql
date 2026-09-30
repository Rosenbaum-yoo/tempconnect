-- =============================================================================
-- 199_anfrage_zurueckziehen.sql — der Weg zurueck fuer den Disponenten
-- =============================================================================
-- OWNER-ENTSCHEID (I2_FRIST_REGULAERE_ZUWEISUNG.md, Entscheidung 4, Freigabe
--   2026-08-24): Der Disponent bekommt einen Rueckzieh-Knopf.
--
-- DER BEFUND DAHINTER: Bis hierher konnte eine gestellte Anfrage NUR durch die
--   Antwort des Arbeiters oder durch Zeitablauf enden. `removeAssignmentLink`
--   existierte im Dienst, hatte aber keinen einzigen Aufrufer — keine Route,
--   keinen Knopf. Der einzige indirekte Weg war, den ganzen Mitarbeiter zu
--   deaktivieren; das trifft alle seine Einsaetze zugleich.
--
-- WARUM EIN EIGENER STATUSWERT UND NICHT 'expired' ODER 'worker_declined':
--   Drei verschiedene Dinge, die in der Historie unterscheidbar bleiben muessen.
--   'worker_declined' waere eine Luege ueber den Menschen — er hat nicht
--   abgelehnt, ihm wurde die Anfrage genommen; jede Zuverlaessigkeitsauswertung
--   wuerde ihn dafuer bestrafen. 'expired' waere eine Luege ueber den Vorgang:
--   nichts ist abgelaufen, jemand hat entschieden. Dieselbe Begruendung, mit der
--   Migration 193 'expired' von 'worker_declined' getrennt hat.
--
-- WARUM EIN EIGENER ZEITSTEMPEL: `verfallen_am` mitzubenutzen haette denselben
--   Fehler eine Ebene tiefer wiederholt — die Spalte traegt laut ihrem eigenen
--   Kommentar den Unterschied zwischen "nicht geantwortet" und "abgelehnt".
--
-- DER MELDUNGSTYP geht an den ARBEITER: Ihm wurde etwas weggenommen, das er in
--   seinem Portal stehen hatte. Verschwaende die Zeile kommentarlos, suchte er
--   sie beim naechsten Blick vergeblich. Der Kunde erfaehrt es ueber den
--   bestehenden Typ `assignment_worker_not_confirmed` ("Platz auf Ihrem Einsatz
--   wieder offen") — fuer ihn ist das Ergebnis dasselbe wie beim Verfall, und
--   ein zweiter Kundentyp fuer denselben Sachverhalt zerrisse die Zusammen-
--   gehoerigkeit in Liste und Filter (Linie aus 184).
--
-- NUMMER: urspruenglich als 198 geschrieben. Eine parallel laufende Arbeit hat
--   dieselbe Nummer belegt (198_audit_login_zeilen_zuordenbar); da diese Datei
--   noch nicht ausgeliefert war, weicht sie aus — ein Duplikat waere dauerhaft
--   (der Runner trackt per Dateiname und darf nie umbenannt werden).
--
-- RESILIENZ: kein umschliessendes BEGIN; jeder Schritt per to_regclass.
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS; die CHECK-Erweiterungen lesen den
--   Bestand und haengen nur Fehlendes an (Muster 184/193/195).
-- ROLLBACK:
--   Spalte: ALTER TABLE worker_assignment_links DROP COLUMN zurueckgezogen_am;
--   Status: vorher UPDATE worker_assignment_links
--             SET worker_confirmation_status='worker_declined'
--           WHERE worker_confirmation_status='withdrawn';
--           dann CHECK auf die Sechserliste zuruecksetzen.
--   Meldungstyp: additiv, Rueckbau nur noetig, wenn Zeilen geloescht werden.
-- =============================================================================

SET client_min_messages TO WARNING;

-- ── 1. Der Zeitstempel ──────────────────────────────────────────────────────

DO $spalte$
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN
    RAISE NOTICE '199: worker_assignment_links fehlt — uebersprungen.'; RETURN;
  END IF;

  ALTER TABLE worker_assignment_links
    ADD COLUMN IF NOT EXISTS zurueckgezogen_am TIMESTAMPTZ;

  COMMENT ON COLUMN worker_assignment_links.zurueckgezogen_am IS
    'Wann die Zeitarbeitsfirma die Anfrage zurueckgezogen hat. Traegt zusammen '
    'mit worker_confirmation_status=''withdrawn'' den Unterschied zu Verfall '
    '(niemand hat geantwortet) und Absage (der Arbeiter hat abgelehnt). Der '
    'Grund steht im Audit, nicht an der Zeile: er ist eine Aussage der Firma '
    'ueber ihre Disposition, keine Eigenschaft des Menschen.';

  RAISE NOTICE '199: zurueckgezogen_am angelegt.';
END $spalte$;

-- ── 2. Statuswert 'withdrawn' (additiv, Muster 184) ─────────────────────────

DO $status_check$
DECLARE
  bestand TEXT[];
  neu     TEXT[] := ARRAY['withdrawn'];
  gesamt  TEXT[];
  vorher  INT;
  nachher INT;
  def     TEXT;
  roh     TEXT;
BEGIN
  IF to_regclass('public.worker_assignment_links') IS NULL THEN RETURN; END IF;

  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'worker_assignment_links'::regclass
     AND conname  = 'worker_assignment_links_worker_confirmation_status_check';

  IF def IS NULL THEN
    RAISE EXCEPTION '199: worker_confirmation_status-CHECK nicht gefunden — abgebrochen, '
                    'lieber laut scheitern als eine Statusliste raten';
  END IF;

  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION '199: Statusliste nicht lesbar (%) — abgebrochen', left(def, 120);
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
    RAISE EXCEPTION '199: Statusliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE worker_assignment_links DROP CONSTRAINT worker_assignment_links_worker_confirmation_status_check';
  EXECUTE format(
    'ALTER TABLE worker_assignment_links ADD CONSTRAINT worker_assignment_links_worker_confirmation_status_check CHECK (worker_confirmation_status = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE '199: worker_confirmation_status kennt jetzt % Werte (vorher %).', nachher, vorher;
END $status_check$;

-- ── 3. Der Meldungstyp an den Arbeiter (additiv, Muster 184) ────────────────

DO $typen_check$
DECLARE
  bestand TEXT[];
  neu     TEXT[] := ARRAY['worker_assignment_withdrawn'];
  gesamt  TEXT[];
  vorher  INT;
  nachher INT;
  def     TEXT;
  roh     TEXT;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN RETURN; END IF;

  SELECT pg_get_constraintdef(oid)
    INTO def
    FROM pg_constraint
   WHERE conrelid = 'notifications'::regclass
     AND conname  = 'notifications_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION '199: notifications_type_check nicht gefunden — abgebrochen';
  END IF;

  roh := (regexp_match(def, '''(\{.*\})''::text\[\]'))[1];
  IF roh IS NOT NULL THEN
    bestand := roh::TEXT[];
  ELSE
    SELECT array_agg(m[1] ORDER BY ord)
      INTO bestand
      FROM regexp_matches(def, '''([a-z_]+)''', 'g') WITH ORDINALITY AS a(m, ord);
  END IF;

  IF bestand IS NULL OR array_length(bestand, 1) IS NULL THEN
    RAISE EXCEPTION '199: Typliste nicht lesbar (%) — abgebrochen', left(def, 120);
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
    RAISE EXCEPTION '199: Typliste waere geschrumpft (% -> %) — abgebrochen', vorher, nachher;
  END IF;

  EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT notifications_type_check';
  EXECUTE format(
    'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (%L::text[]))',
    gesamt
  );

  RAISE NOTICE '199: notifications.type kennt jetzt % Typen (vorher %).', nachher, vorher;
END $typen_check$;
