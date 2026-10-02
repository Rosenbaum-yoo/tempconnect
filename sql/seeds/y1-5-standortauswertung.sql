-- =============================================================================
-- Y1.5 · DER STANDORTFILTER DES REPORTINGS HATTE NIE EINE ZEILE
-- =============================================================================
-- Anhang zu Y1.2 (docs/features/Y_PROBEBUEHNE.md) — die Skalierungsseite der
-- Mehrstandort-Firma.
--
-- GEMESSEN AM 2026-10-02 gegen die laufende Datenbank:
--
--   requisitions                       73 Zeilen, 22 Organisationen
--   davon MIT Standort                 **0**
--   Nordlicht Logistik GmbH            3 Standorte, **0** Requisitions
--
-- Y1.2 hat die Mehrstandort-Firma gebaut und damit die Standort*grenze*
-- vorführbar gemacht: `standort.hamburg@` sieht Berlin und München nicht. Was
-- Y1.2 NICHT vorführbar gemacht hat, ist die Standort*auswertung*. Über
-- **fünfzehn** Abfragestellen in `reportingService.js` und
-- `spendAnalyticsService.js` hängen an `r.location_id = $N` — und keine davon hat
-- je eine Zeile getroffen, weil keine einzige Requisition im ganzen Bestand einen
-- Standort trägt.
--
-- Das ist genau die Klasse aus Y1.3 und Y6: nicht fehlende Daten, sondern ein
-- fehlender ZUSTAND. Ein Filter, der nie etwas gefiltert hat, ist eine
-- Behauptung — und für einen Kunden mit fünfzig Standorten ist er der Pfad, in
-- dem er lebt.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE SAAT VORFÜHRBAR MACHT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Neun Bedarfe, nach Standort UNGLEICH verteilt — und das ist der Punkt:
--
--   Hamburg Hafen (HQ)    4    davon 2 offen
--   Berlin Schoenefeld    3    davon 1 offen
--   Muenchen Nord         2    davon 1 offen
--
-- Ungleich, weil ein Filter nur dann etwas beweist, wenn sein Ergebnis sich von
-- der Summe unterscheidet. Bei drei gleich großen Standorten sieht „Hamburg" wie
-- ein Drittel aus und man kann nicht unterscheiden, ob gefiltert wurde oder
-- geteilt. Bei 4/3/2 ist jede Zahl eindeutig.
--
-- Dazu zwei Nebenwirkungen, die nicht Beiwerk sind:
--
--   * `urgency` kannte im ganzen Bestand nur `normal` (60) und `high` (13).
--     `urgent` und `notdienst` hatten kein Beispiel — die Dringlichkeitsstufen,
--     an denen die Oberfläche farbig wird und der SLA-Takt kürzer rechnet. Beide
--     sind jetzt besetzt.
--   * Die Abteilungen aus Y1.2 (`Umschlag Hafen`, `Luftfracht`,
--     `Kontraktlogistik`) hingen bis jetzt an keinem einzigen Vorgang. Jeder
--     Bedarf trägt die Abteilung SEINES Standorts — die zweite Ebene der Bindung
--     wird damit erstmals in einer Auswertung sichtbar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE SAAT AUSDRÜCKLICH NICHT TUT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- **Kein SLA-Zustand.** `requisitions.sla_status` kennt `RUNNING`, `MET` und
-- `BREACHED`, und keiner hat ein Beispiel. Das bleibt so: diese Werte rechnet
-- der Sweep aus. Eine Saat, die `BREACHED` hinschreibt, widerspricht der Stelle,
-- die darüber entscheidet — dieselbe Regel, die in Y6 den Geltungsbereich der
-- Registratur begrenzt hat. Eine Notbremse unten erzwingt es, damit die Regel
-- nicht beim nächsten Handgriff aufweicht.
--
-- **Keine Mengen-Behauptung.** Neun Bedarfe beweisen nichts über 300 Kunden. Die
-- Skalierungsaussage steht strukturell in `api/test/standortfilterNieAllein.test.js`
-- (jeder brauchbare Index auf `requisitions` führt mit `org_id`, der Durchlauf
-- bleibt an einen Mandanten gebunden) — nicht in dieser Zeilenzahl. Bei 73 Zeilen
-- wählt Postgres ohnehin immer einen Durchlauf, mit Index oder ohne; gemessen.
--
-- Kennungen beginnen mit `b2` (hex-gültig, im Y-Block noch frei).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-02) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y1-5-standortauswertung.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert.';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
BEGIN
  /* Diese Saat haengt an Y1.2. Ohne die drei Standorte waere jede Einfuegung
     unten ein stiller No-Op - und eine Saat, die nichts tut und nichts sagt, ist
     schlimmer als eine, die bricht. */
  IF (SELECT count(*) FROM org_locations WHERE org_id = 'b0000000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: Nordlicht hat nicht drei Standorte - erst y1-2-standorte.sql laden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'b0000000-0000-4000-8000-00000000c002') THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: die Disposition von Nordlicht fehlt - erst y1-2-standorte.sql laden.';
  END IF;
END $voraussetzungen$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NEUN BEDARFE, VERTEILT 4 / 3 / 2
-- ─────────────────────────────────────────────────────────────────────────────
-- `created_by`: die Hamburger Bedarfe legt die standortgebundene Mitgliedschaft
-- an (`standort.hamburg@`), die anderen die Disposition. Damit traegt die
-- Auswertung auch die Frage „wer hat das eingestellt" ueber die Standortgrenze
-- hinweg — und der standortgebundene Mensch hat etwas, das ihm gehoert.
--
-- `location_city` wird MITGESCHRIEBEN, obwohl `location_id` schon da ist: der
-- Freitext ist der aeltere Weg und mehrere Abfragen lesen ihn (Trigramm-Indizes
-- auf `location_city`). Ein Bedarf, dessen Kennung Hamburg sagt und dessen
-- Freitext leer ist, erscheint in der einen Auswertung und in der anderen nicht —
-- genau die Sorte Abweichung, die ein Mensch nie findet.
--
-- `start_date` relativ (Y6.2). Keine festen Daten.

INSERT INTO requisitions (
  id, org_id, created_by, location_id, department_id,
  title, description, role, skill_tags, headcount,
  start_date, end_date, location_city, location_postal,
  urgency, status, approval_required
)
SELECT
  ('b2000000-0000-4000-8000-00000000a0' || r.nr)::uuid,
  'b0000000-0000-4000-8000-000000000001',
  r.ersteller::uuid,
  r.standort::uuid,
  r.abteilung::uuid,
  r.titel, r.beschreibung, r.rolle, r.faehigkeiten::text[], r.kopfzahl,
  (CURRENT_DATE + r.start_in)::date,
  (CURRENT_DATE + r.start_in + r.dauer)::date,
  r.stadt, r.plz,
  r.dringlichkeit, r.zustand, FALSE
FROM (VALUES
  -- Hamburg Hafen (HQ) — vier Bedarfe, zwei davon offen
  ('01', 'b0000000-0000-4000-8000-00000000c003', 'b0000000-0000-4000-8000-00000000a001', 'b0000000-0000-4000-8000-00000000b001',
   'Umschlagkraefte Nachtschicht', 'Containerumschlag am Terminal, drei Naechte je Woche.',
   'Lagerhelfer:in', '{"Lagerhelfer:in","Nachtschicht"}', 6, 7, 30, 'Hamburg', '20535', 'high',      'OPEN'),
  ('02', 'b0000000-0000-4000-8000-00000000c003', 'b0000000-0000-4000-8000-00000000a001', 'b0000000-0000-4000-8000-00000000b001',
   'Staplerfahrer:innen Halle 4', 'Kommissionierung mit Frontstapler, Schichtbetrieb.',
   'Gabelstaplerfahrer:in', '{"Gabelstaplerfahrer:in"}', 4, 14, 60, 'Hamburg', '20535', 'normal',    'OPEN'),
  ('03', 'b0000000-0000-4000-8000-00000000c003', 'b0000000-0000-4000-8000-00000000a001', 'b0000000-0000-4000-8000-00000000b001',
   'Ausfall Frühschicht kurzfristig', 'Zwei Kraefte fuer morgen, Krankheitsausfall.',
   'Lagerhelfer:in', '{"Lagerhelfer:in"}', 2, 1, 3, 'Hamburg', '20535', 'notdienst', 'IN_REVIEW'),
  ('04', 'b0000000-0000-4000-8000-00000000c003', 'b0000000-0000-4000-8000-00000000a001', 'b0000000-0000-4000-8000-00000000b001',
   'Inventur Jahresabschluss', 'Zaehlteams fuer die Bestandsaufnahme.',
   'Lagerhelfer:in', '{"Lagerhelfer:in"}', 8, 45, 10, 'Hamburg', '20535', 'normal',    'FILLED'),
  -- Berlin Schoenefeld — drei Bedarfe, einer offen
  ('05', 'b0000000-0000-4000-8000-00000000c002', 'b0000000-0000-4000-8000-00000000a002', 'b0000000-0000-4000-8000-00000000b002',
   'Luftfracht-Abfertigung', 'Annahme und Dokumentenpruefung, Wochenenddienst.',
   'Lagerhelfer:in', '{"Lagerhelfer:in","Wochenende"}', 3, 10, 45, 'Schoenefeld', '12529', 'urgent', 'OPEN'),
  ('06', 'b0000000-0000-4000-8000-00000000c002', 'b0000000-0000-4000-8000-00000000a002', 'b0000000-0000-4000-8000-00000000b002',
   'Gefahrgut-Beauftragte Vertretung', 'Vertretung wegen Elternzeit, ADR erforderlich.',
   'Disponent:in', '{"Disponent:in","ADR"}', 1, 21, 180, 'Schoenefeld', '12529', 'high',   'SHORTLISTED'),
  ('07', 'b0000000-0000-4000-8000-00000000c002', 'b0000000-0000-4000-8000-00000000a002', 'b0000000-0000-4000-8000-00000000b002',
   'Rampenkoordination Sommer', 'Saisonspitze, befristet.',
   'Disponent:in', '{"Disponent:in"}', 2, 60, 90, 'Schoenefeld', '12529', 'normal',   'CLOSED'),
  -- Muenchen Nord — zwei Bedarfe, einer offen
  ('08', 'b0000000-0000-4000-8000-00000000c002', 'b0000000-0000-4000-8000-00000000a003', 'b0000000-0000-4000-8000-00000000b003',
   'Kontraktlogistik Montageteam', 'Vormontage fuer Kunden aus der Automobilzulieferung.',
   'Monteur:in', '{"Monteur:in","Montage"}', 5, 14, 120, 'Muenchen', '80939', 'normal',   'OPEN'),
  ('09', 'b0000000-0000-4000-8000-00000000c002', 'b0000000-0000-4000-8000-00000000a003', 'b0000000-0000-4000-8000-00000000b003',
   'Qualitaetspruefung Wareneingang', 'Sichtpruefung und Dokumentation.',
   'Lagerhelfer:in', '{"Lagerhelfer:in","Qualitaet"}', 2, 30, 60, 'Muenchen', '80939', 'normal', 'PARTIALLY_FILLED')
) AS r(nr, ersteller, standort, abteilung, titel, beschreibung, rolle, faehigkeiten, kopfzahl,
       start_in, dauer, stadt, plz, dringlichkeit, zustand)
ON CONFLICT (id) DO UPDATE SET
  location_id = EXCLUDED.location_id,
  department_id = EXCLUDED.department_id,
  created_by = EXCLUDED.created_by,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  role = EXCLUDED.role,
  skill_tags = EXCLUDED.skill_tags,
  headcount = EXCLUDED.headcount,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  location_city = EXCLUDED.location_city,
  location_postal = EXCLUDED.location_postal,
  urgency = EXCLUDED.urgency,
  status = EXCLUDED.status,
  updated_at = NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTBREMSEN
-- ─────────────────────────────────────────────────────────────────────────────

DO $vollstaendig$
DECLARE
  n int;
  verteilung int[];
  fehlend text[];
BEGIN
  /* 1 · Alle drei Standorte tragen Bedarfe, und zwar UNGLEICH VIELE. Gleich
     viele waeren kein Beweis: dann sieht ein Filter wie eine Division aus. */
  SELECT array_agg(anzahl ORDER BY anzahl) INTO verteilung
    FROM (SELECT location_id, count(*) AS anzahl FROM requisitions
           WHERE id::text LIKE 'b2000000-0000-4000-8000-00000000a0%'
           GROUP BY location_id) x;
  IF array_length(verteilung, 1) <> 3 THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: % Standorte mit Bedarfen, erwartet 3.', coalesce(array_length(verteilung,1),0);
  END IF;
  IF verteilung[1] = verteilung[2] OR verteilung[2] = verteilung[3] THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: zwei Standorte haben gleich viele Bedarfe (%). Dann unterscheidet ein gefiltertes Ergebnis sich nicht erkennbar von einer Division.', verteilung;
  END IF;

  /* 2 · Jeder Bedarf traegt einen Standort UND die Abteilung dieses Standorts.
     Der zusammengesetzte Fremdschluessel erzwingt nur die ORG-Zugehoerigkeit,
     nicht die Zusammengehoerigkeit von Standort und Abteilung — die ist eine
     Zusage dieser Saat, also wird sie hier geprueft. */
  SELECT count(*) INTO n FROM requisitions r
   WHERE r.id::text LIKE 'b2000000-0000-4000-8000-00000000a0%'
     AND (r.location_id IS NULL OR r.department_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM org_departments d
                          WHERE d.id = r.department_id AND d.location_id = r.location_id));
  IF n <> 0 THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: % Bedarf(e) ohne Standort oder mit einer Abteilung, die nicht an diesem Standort haengt.', n;
  END IF;

  /* 3 · Der Freitext passt zur Kennung. Ein Bedarf, dessen `location_id` Hamburg
     sagt und dessen `location_city` etwas anderes, erscheint in der einen
     Auswertung und in der anderen nicht - und niemand findet das von Hand. */
  SELECT count(*) INTO n FROM requisitions r
   JOIN org_locations l ON l.id = r.location_id
   WHERE r.id::text LIKE 'b2000000-0000-4000-8000-00000000a0%'
     AND lower(coalesce(r.location_city, '')) <> lower(l.city);
  IF n <> 0 THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: bei % Bedarf(en) widerspricht location_city der Standort-Kennung.', n;
  END IF;

  /* 4 · Die beiden vorher unbesetzten Dringlichkeiten sind da. */
  SELECT array_agg(d ORDER BY d) INTO fehlend
    FROM unnest(ARRAY['normal','high','urgent','notdienst']) d
   WHERE NOT EXISTS (SELECT 1 FROM requisitions x WHERE x.urgency = d);
  IF fehlend IS NOT NULL THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: diese Dringlichkeiten haben kein Beispiel: %', fehlend;
  END IF;

  /* 5 · KEIN SLA-Zustand aus der Saat. Die Werte rechnet der Sweep aus; eine
     Saat, die sie hinschreibt, widerspricht der entscheidenden Stelle. Diese
     Bremse haelt die Regel fest, damit sie nicht beim naechsten Handgriff
     aufweicht. */
  /* GEMESSEN, nicht angenommen: `sla_status` hat KEINE Vorgabe und ist nullable
     — alle 73 vorhandenen Requisitions tragen NULL. Der erste Entwurf dieser
     Bremse verlangte `= 'RUNNING'` (die Vorgabe, die ich erwartet hatte) und
     brach damit die eigene Saat ab. Die Absicht war richtig, der Erwartungswert
     geraten. „Kein SLA-Zustand" heisst hier also: alles NULL. */
  SELECT count(*) INTO n FROM requisitions
   WHERE id::text LIKE 'b2000000-0000-4000-8000-00000000a0%'
     AND (sla_status IS NOT NULL OR sla_due_at IS NOT NULL
          OR sla_met_at IS NOT NULL OR sla_breached_at IS NOT NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: % Bedarf(e) tragen einen SLA-Zustand aus der Saat. Diese Werte gehoeren dem Sweep.', n;
  END IF;

  /* 6 · Und die Wirkung, um die es geht: der Standortfilter des Reportings hat
     jetzt ueberhaupt Zeilen. Vorher: null im ganzen Bestand. */
  SELECT count(*) INTO n FROM requisitions WHERE location_id IS NOT NULL;
  IF n < 9 THEN
    RAISE EXCEPTION 'y1-5-standortauswertung.sql: nur % Requisitions mit Standort im Gesamtbestand, erwartet mindestens 9.', n;
  END IF;

  RAISE NOTICE 'y1-5-standortauswertung.sql: 9 Bedarfe, verteilt % auf drei Standorte, vier Dringlichkeiten besetzt, kein SLA-Zustand aus der Saat.', verteilung;
END $vollstaendig$;

COMMIT;
