-- Migration 210: Zuordnungen schliessen, Lieferanten nachtragen (Owner-Entscheid E-K3-4)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Beim Bauen der Monatsplanung (K3.4) meldete die Konfliktpruefung eine
-- Doppelbelegung, die es nicht gab: eine Einsatzkraft schien seit dem
-- 01.04.2026 zwei Unternehmen zugeordnet zu sein. Tatsaechlich war einer der
-- beiden Einsaetze am 31.03.2025 abgeschlossen — nur der ZUORDNUNGSEINTRAG
-- (`worker_assignment_links`) trug kein Enddatum.
--
-- Die Monatsplanung rechnet seitdem gegen die WIRKSAME Zeitspanne (Link-Ende,
-- begrenzt vom Einsatzende) und kommt ohne diese Bereinigung aus. Aber jede
-- andere Auswertung, die nur den Link liest, zaehlt weiterhin falsch — und die
-- AUEG-Ueberlassungsdauer waere davon am schwersten betroffen: eine nie
-- geschlossene Zuordnung liefe dort UNBEGRENZT weiter und meldete irgendwann
-- jeden Kunden als ueber der gesetzlichen Hoechstdauer.
--
-- Owner-Entscheid 2026-08-31 (E-K3-4): "ja gerne anfassen aber vorher
-- genauestens pruefen und vorsichtig vorgehen, am besten mehrfach auf
-- verschiedene Wege pruefen, sodass alles erfasst werden kann."
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIE MEHRWEGEPRUEFUNG (2026-08-31, gegen die laufende Datenbank)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   A  Link offen, Einsatz beendet ................................  3
--   B  Link endet NACH dem Einsatz ................................  0
--   C  Link offen, Einsatz completed/cancelled ....................  1   (Teilmenge von A)
--   D  verwaist (Einsatz fehlt) ...................................  0
--   E  Ende vor Beginn ............................................  0
--   F  Link beginnt vor dem Einsatz ...............................  0
--   G  doppelter Link (dieselbe Kraft, derselbe Einsatz) ..........  0
--   H  Org-Angaben weichen vom Einsatz ab .........................  2
--                                                    Zuordnungen gesamt: 24
--
-- Acht Wege, zwei Funde. Weg H stellte sich als etwas anderes heraus als
-- gedacht: kein Widerspruch, sondern eine LUECKE — `assignments.supplier_org_id`
-- ist dort NULL, waehrend die Zuordnung den Lieferanten kennt. Nachgemessen:
-- **51 von 68 Einsaetzen tragen ueberhaupt keinen Lieferanten**, und fuer 49
-- davon gibt es keinerlei Anker (kein Angebot, kein Vertrag, keine
-- Ausschreibung, keine Zuordnung). Nur zwei sind rekonstruierbar, und dort ist
-- der Lieferant EINDEUTIG (je genau ein `supplier_org_id` unter den Links).
--
-- Diese Migration fasst deshalb nur an, was in ALLEN Wegen uebereinstimmt:
-- drei Zuordnungen und zwei Lieferanten-Eintraege. Die 49 ankerlosen Einsaetze
-- bleiben unberuehrt — sie zu raten waere das Gegenteil von vorsichtig.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIE SELBSTPRUEFUNG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Diese Migration zaehlt VORHER nach und bricht ab, wenn sie mehr findet als
-- gemessen. Dasselbe Muster wie Migration 191: eine Bestandsaenderung, deren
-- Umfang sich zwischen Messung und Ausfuehrung verschoben hat, ist keine
-- Bereinigung mehr, sondern ein Blindflug. Lieber rot als ungefragt.
--
-- Die Grenzen sind bewusst grosszuegig (Faktor 3 auf die gemessene Zahl): auf
-- einer anderen Umgebung — Staging, Produktion — sind andere Zahlen normal.
-- Was die Pruefung verhindern soll, ist eine GROESSENORDNUNG daneben, nicht
-- eine abweichende Ziffer.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WAS DIESE MIGRATION NICHT TUT
-- ═══════════════════════════════════════════════════════════════════════════
--
--   * Sie loescht nichts. Ein Enddatum zu setzen ist umkehrbar, eine geloeschte
--     Zeile nicht.
--   * Sie raet keinen Lieferanten. 49 Einsaetze bleiben ohne — sichtbar,
--     nicht stillschweigend gefuellt.
--   * Sie legt keinen Trigger an, der das kuenftig erledigt. Ob eine Zuordnung
--     beim Abschluss eines Einsatzes automatisch geschlossen wird, ist eine
--     Entscheidung ueber den Einsatz-Lebenszyklus und gehoert nicht in eine
--     Bereinigung.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- Die betroffenen Zeilen stehen VOR der Aenderung in `zuordnung_bereinigung_210`.
-- Zuruecknehmen:
--
--   UPDATE worker_assignment_links l SET end_date = b.end_date_vorher
--     FROM zuordnung_bereinigung_210 b
--    WHERE b.art = 'link_geschlossen' AND l.id = b.zeile_id;
--   UPDATE assignments a SET supplier_org_id = NULL
--     FROM zuordnung_bereinigung_210 b
--    WHERE b.art = 'lieferant_nachgetragen' AND a.id = b.zeile_id;
--   DROP TABLE zuordnung_bereinigung_210;

SET client_min_messages TO WARNING;

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Das Vorher-Bild. Ohne es waere die Aenderung nicht zuruecknehmbar.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS zuordnung_bereinigung_210 (
  id              BIGSERIAL PRIMARY KEY,
  art             TEXT NOT NULL CHECK (art IN ('link_geschlossen', 'lieferant_nachgetragen')),
  zeile_id        UUID NOT NULL,
  end_date_vorher DATE,
  end_date_nachher DATE,
  lieferant_nachher UUID,
  begruendung     TEXT NOT NULL,
  erfasst_am      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE zuordnung_bereinigung_210 IS
  'Das Vorher-Bild der Bereinigung aus Migration 210 (Owner-Entscheid E-K3-4). Eine Bestandsaenderung ohne Rueckweg ist keine.';

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Die Selbstpruefung — lieber rot als ungefragt
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  offene_links     INTEGER;
  nachtragbare     INTEGER;
  mehrdeutige      INTEGER;
  unplausible      INTEGER;
BEGIN
  SELECT COUNT(*) INTO offene_links
    FROM worker_assignment_links l
    JOIN assignments a ON a.id = l.assignment_id
   WHERE l.end_date IS NULL
     AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE;

  -- Ein Enddatum VOR dem Beginn waere kein Schliessen, sondern eine Verfaelschung.
  SELECT COUNT(*) INTO unplausible
    FROM worker_assignment_links l
    JOIN assignments a ON a.id = l.assignment_id
   WHERE l.end_date IS NULL
     AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE
     AND COALESCE(a.actual_end_date, a.planned_end_date) < l.start_date;

  SELECT COUNT(*) INTO nachtragbare
    FROM (SELECT a.id FROM assignments a
            JOIN worker_assignment_links l ON l.assignment_id = a.id
           WHERE a.supplier_org_id IS NULL AND l.supplier_org_id IS NOT NULL
           GROUP BY a.id HAVING COUNT(DISTINCT l.supplier_org_id) = 1) x;

  -- Mehrere verschiedene Lieferanten an einem Einsatz: dann ist nicht
  -- entscheidbar, welcher gemeint war — und wir tragen keinen ein.
  SELECT COUNT(*) INTO mehrdeutige
    FROM (SELECT a.id FROM assignments a
            JOIN worker_assignment_links l ON l.assignment_id = a.id
           WHERE a.supplier_org_id IS NULL AND l.supplier_org_id IS NOT NULL
           GROUP BY a.id HAVING COUNT(DISTINCT l.supplier_org_id) > 1) y;

  RAISE NOTICE '210: % offene Zuordnungen, % nachtragbare Lieferanten, % mehrdeutig, % unplausibel',
    offene_links, nachtragbare, mehrdeutige, unplausible;

  IF unplausible > 0 THEN
    RAISE EXCEPTION
      '210 ABGEBROCHEN: % Zuordnung(en) haetten ein Ende VOR ihrem Beginn bekommen. '
      'Das waere keine Bereinigung, sondern eine Verfaelschung. Erst die Daten ansehen.',
      unplausible;
  END IF;

  -- Gemessen am 2026-08-31: 3 offene Zuordnungen, 2 nachtragbare Lieferanten.
  -- Faktor 3 als Grenze — was hier abgefangen wird, ist eine Groessenordnung
  -- daneben, nicht eine abweichende Ziffer.
  IF offene_links > 9 THEN
    RAISE EXCEPTION
      '210 ABGEBROCHEN: % offene Zuordnungen gefunden, erwartet waren rund 3. '
      'Die Bereinigung wurde unter der Annahme eines kleinen Bestands geschrieben. '
      'Bei dieser Menge zuerst pruefen, warum Zuordnungen systematisch offen bleiben.',
      offene_links;
  END IF;

  IF nachtragbare > 6 THEN
    RAISE EXCEPTION
      '210 ABGEBROCHEN: % nachtragbare Lieferanten gefunden, erwartet waren rund 2. '
      'Erst pruefen, ob die Zuordnung wirklich die verlaessliche Quelle ist.',
      nachtragbare;
  END IF;

  IF mehrdeutige > 0 THEN
    RAISE NOTICE
      '210 HINWEIS: % Einsatz/Einsaetze haben MEHRERE verschiedene Lieferanten in ihren '
      'Zuordnungen und bleiben deshalb bewusst ohne Eintrag.', mehrdeutige;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Die Zuordnungen schliessen
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO zuordnung_bereinigung_210 (art, zeile_id, end_date_vorher, end_date_nachher, begruendung)
SELECT 'link_geschlossen', l.id, l.end_date,
       COALESCE(a.actual_end_date, a.planned_end_date),
       format('Einsatz %s endete am %s (Zustand: %s), die Zuordnung blieb offen.',
              a.id, COALESCE(a.actual_end_date, a.planned_end_date), a.status)
  FROM worker_assignment_links l
  JOIN assignments a ON a.id = l.assignment_id
 WHERE l.end_date IS NULL
   AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE;

UPDATE worker_assignment_links l
   SET end_date = COALESCE(a.actual_end_date, a.planned_end_date)
  FROM assignments a
 WHERE a.id = l.assignment_id
   AND l.end_date IS NULL
   AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Den Lieferanten nachtragen — nur wo er eindeutig ist
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO zuordnung_bereinigung_210 (art, zeile_id, lieferant_nachher, begruendung)
-- `MIN(uuid)` gibt es in Postgres nicht. Die HAVING-Bedingung garantiert
-- genau einen Wert, also wird er direkt genommen statt aggregiert.
SELECT 'lieferant_nachgetragen', a.id, (array_agg(DISTINCT l.supplier_org_id))[1],
       'Der Einsatz trug keinen Lieferanten; genau eine Zuordnung nennt ihn eindeutig.'
  FROM assignments a
  JOIN worker_assignment_links l ON l.assignment_id = a.id
 WHERE a.supplier_org_id IS NULL AND l.supplier_org_id IS NOT NULL
 GROUP BY a.id
HAVING COUNT(DISTINCT l.supplier_org_id) = 1;

UPDATE assignments a
   SET supplier_org_id = b.lieferant_nachher
  FROM zuordnung_bereinigung_210 b
 WHERE b.art = 'lieferant_nachgetragen'
   AND a.id = b.zeile_id
   AND a.supplier_org_id IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Nachher-Pruefung: hat die Bereinigung getan, was sie sollte?
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rest_offen   INTEGER;
  rest_nachtrag INTEGER;
  ohne_anker   INTEGER;
BEGIN
  SELECT COUNT(*) INTO rest_offen
    FROM worker_assignment_links l
    JOIN assignments a ON a.id = l.assignment_id
   WHERE l.end_date IS NULL
     AND COALESCE(a.actual_end_date, a.planned_end_date) < CURRENT_DATE;

  SELECT COUNT(*) INTO rest_nachtrag
    FROM (SELECT a.id FROM assignments a
            JOIN worker_assignment_links l ON l.assignment_id = a.id
           WHERE a.supplier_org_id IS NULL AND l.supplier_org_id IS NOT NULL
           GROUP BY a.id HAVING COUNT(DISTINCT l.supplier_org_id) = 1) x;

  SELECT COUNT(*) INTO ohne_anker FROM assignments WHERE supplier_org_id IS NULL;

  IF rest_offen > 0 OR rest_nachtrag > 0 THEN
    RAISE EXCEPTION
      '210 ABGEBROCHEN: nach der Bereinigung sind noch % Zuordnung(en) offen und '
      '% Lieferant(en) nachtragbar. Die Aenderung hat nicht gegriffen.',
      rest_offen, rest_nachtrag;
  END IF;

  RAISE NOTICE
    '210: bereinigt. % Einsatz/Einsaetze haben weiterhin keinen Lieferanten — '
    'fuer sie gibt es keinen Anker (kein Angebot, kein Vertrag, keine Ausschreibung, '
    'keine Zuordnung). Sie zu raten waere das Gegenteil von vorsichtig.', ohne_anker;
END $$;

COMMIT;
