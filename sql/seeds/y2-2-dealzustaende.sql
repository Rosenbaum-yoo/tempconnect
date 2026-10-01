-- =============================================================================
-- Y2.1 + Y2.2 · DEALS UND STUNDENZETTEL IN JEDEM ZUSTAND
-- =============================================================================
-- Welle Y, Abschnitt Y2.1 und Y2.2 (docs/features/Y_PROBEBUEHNE.md).
--
-- GEMESSEN AM 2026-10-01 — fünf Zustandsmengen, SECHZEHN unbesetzte Werte:
--
--   requests.status           CREATED · OFFER_SENT · DECLINED · CONFIRMED ·
--                            ASSIGNMENT_STARTED · COMPLETED · CANCELED  (7 von 11)
--   demand_requests.status    closed · cancelled · paused                (3 von 7)
--   offers.status             rejected · withdrawn · countered           (3 von 6)
--   offers.agreement_status   none · expired                             (2 von 7)
--   timesheets.status         cancelled                                  (1 von 5)
--
-- „Jeder Zustand einmal sichtbar, auf BEIDEN Seiten" verlangt der Plan. Auf
-- beiden Seiten heißt: derselbe Vorgang muss aus Sicht des Unternehmens UND aus
-- Sicht der Zeitarbeitsfirma einen Zustand zeigen — deshalb laufen alle Vorgänge
-- hier zwischen **Nordlicht Logistik** (Kunde, Y1.2) und **Hanse Personal
-- Service** (Lieferant, Y1.4), den zwei Organisationen, in die man sich anmelden
-- kann. Ein Zustand an zwei Organisationen, die niemand betreten kann, ist kein
-- vorführbarer Zustand.
--
-- ABGELEHNT, ZURÜCKGEZOGEN UND GEGENANGEBOT SIND DREI DINGE, und genau deshalb
-- stehen alle drei hier:
--   `rejected`  die Gegenseite hat entschieden
--   `withdrawn` die eigene Seite hat zurückgezogen
--   `countered` niemand hat abgelehnt — es liegt ein Gegenangebot
-- Eine Oberfläche, die nur eines kennt, nennt dem Nutzer den falschen Urheber.
--
-- DASSELBE BEI DEN ANFRAGEN: `DECLINED` (die Gegenseite sagt nein) und
-- `CANCELED` (der Besteller zieht zurück) sehen in einer Liste gleich aus und
-- bedeuten das Gegenteil. Beide stehen hier, an derselben Paarung.
--
-- KEINE PROSA IN DATENSPALTEN. `demand_requests.requirements` ist `jsonb` und in
-- keiner der 42 vorhandenen Zeilen benutzt. Eine Saat, die dort als Erste und
-- Einzige Text ablegt, erfindet eine Nutzung — die Begründungen stehen deshalb
-- als SQL-Kommentar an jeder Zeile.
--
-- Alle Datumswerte relativ (`CURRENT_DATE ± n`, `now() - interval`).
-- Kennungen beginnen mit `b9` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y2-2-dealzustaende.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'b0000000-0000-4000-8000-00000000c001') THEN
    RAISE EXCEPTION
      'y2-2-dealzustaende.sql: das Konto verwaltung@ fehlt (y1-2-standorte.sql). Es ist die KUNDENSEITE aller Vorgaenge hier.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'b1000000-0000-4000-8000-00000000c001') THEN
    RAISE EXCEPTION
      'y2-2-dealzustaende.sql: das Konto disponent@ fehlt (y1-4-belegschaft.sql). Es ist die LIEFERANTENSEITE aller Vorgaenge hier.';
  END IF;
END $voraussetzungen$;

-- =============================================================================
-- (A) BEDARFE · drei unbesetzte Zustände
-- =============================================================================
-- `closed`, `cancelled` und `paused` hatten kein Beispiel. Sie sind auch die
-- Grundlage für die Angebote weiter unten — ein Angebot hängt an einem Bedarf.
INSERT INTO demand_requests
  (id, requester_company_id, requester_org_id, title, role, headcount,
   start_date, location_city, radius_km, urgency, status, closed_at, cancelled_at)
VALUES
  ('b9000000-0000-4000-8000-00000000a001',
   'b0000000-0000-4000-8000-00000000c001', 'b0000000-0000-4000-8000-000000000001',
   'Umschlag Hafen, Frühschicht', 'Lagerhelfer:in', 3,
   -- offener Bedarf - Grundlage fuer das Gegenangebot weiter unten
   CURRENT_DATE + 10, 'Hamburg', 25, 'normal', 'open', NULL, NULL),

  ('b9000000-0000-4000-8000-00000000a002',
   'b0000000-0000-4000-8000-00000000c001', 'b0000000-0000-4000-8000-000000000001',
   'Luftfracht Berlin, Nachtschicht', 'Kommissionierer:in', 2,
   -- ANGEHALTEN: der Kunde wartet auf eine interne Freigabe. Unterscheidet
   -- sich von 'closed' darin, dass der Bedarf weiterlebt.
   CURRENT_DATE + 21, 'Schoenefeld', 40, 'plus', 'paused', NULL, NULL),

  ('b9000000-0000-4000-8000-00000000a003',
   'b0000000-0000-4000-8000-00000000c001', 'b0000000-0000-4000-8000-000000000001',
   'Kontraktlogistik Muenchen, Inventur', 'Lagerhelfer:in', 5,
   -- GESCHLOSSEN: die Inventur ist vorbei, der Bedarf wird nicht mehr bedient.
   -- closed_at gesetzt - ein Zustand ohne seinen Zeitstempel ist halb.
   CURRENT_DATE - 30, 'Muenchen', 30, 'normal', 'closed',
   now() - interval '25 days', NULL),

  ('b9000000-0000-4000-8000-00000000a004',
   'b0000000-0000-4000-8000-00000000c001', 'b0000000-0000-4000-8000-000000000001',
   'Umschlag Hafen, Spitzenabdeckung', 'Staplerfahrer:in', 4,
   -- VOM BESTELLER ZURUECKGEZOGEN - nicht von der Gegenseite abgelehnt.
   -- Der Unterschied ist der ganze Punkt dieser Zeile.
   CURRENT_DATE + 5, 'Hamburg', 25, 'notdienst', 'cancelled',
   NULL, now() - interval '8 days')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, start_date = EXCLUDED.start_date,
  urgency = EXCLUDED.urgency,
  closed_at = EXCLUDED.closed_at, cancelled_at = EXCLUDED.cancelled_at;

-- =============================================================================
-- (B) ANGEBOTE · drei Status- und zwei Vereinbarungs-Zustände
-- =============================================================================
INSERT INTO offers
  (id, demand_request_id, supplier_company_id, status, agreement_status,
   agreement_version, created_at, updated_at)
VALUES
  -- `rejected`: die GEGENSEITE hat entschieden. agreement_status 'none', weil es
  -- nie zu einer Vereinbarung kam - und 'none' war selbst unbesetzt.
  ('b9000000-0000-4000-8000-00000000b001',
   'b9000000-0000-4000-8000-00000000a003', 'b1000000-0000-4000-8000-00000000c001',
   'rejected', 'none', 0, now() - interval '28 days', now() - interval '26 days'),

  -- `withdrawn`: die EIGENE Seite hat zurueckgezogen. In einer Liste sieht das
  -- wie 'rejected' aus und bedeutet das Gegenteil.
  ('b9000000-0000-4000-8000-00000000b002',
   'b9000000-0000-4000-8000-00000000a004', 'b1000000-0000-4000-8000-00000000c001',
   'withdrawn', 'none', 0, now() - interval '12 days', now() - interval '9 days'),

  -- `countered`: NIEMAND hat abgelehnt, es liegt ein Gegenangebot. Dazu eine
  -- Vereinbarung, die abgelaufen ist - 'expired' war ebenfalls unbesetzt.
  ('b9000000-0000-4000-8000-00000000b003',
   'b9000000-0000-4000-8000-00000000a001', 'b1000000-0000-4000-8000-00000000c001',
   'countered', 'expired', 1, now() - interval '6 days', now() - interval '1 day')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  agreement_status = EXCLUDED.agreement_status,
  agreement_version = EXCLUDED.agreement_version,
  updated_at = EXCLUDED.updated_at;

-- =============================================================================
-- (C0) EIN EIGENES ANGEBOT DER BUEHNE
-- =============================================================================
-- `requests_capacity_listing_xor` verlangt, dass jede Anfrage GENAU EINES von
-- `capacity_id` oder `listing_id` nennt - beide NULL ist verboten (gemessen beim
-- ersten Ladeversuch). Die sieben Anfragen unten zeigen deshalb auf dieses
-- Listing.
--
-- Es gehoert der Buehne selbst und nicht der alten Demo-Welt: eine Bindung an
-- `d0c00000-...` waere eine Fremdbindung, die beim Aufraeumen jener Welt
-- mitstirbt und die Buehne stillschweigend unvollstaendig macht.
INSERT INTO listings (id, owner_id, type, category, region, qty, start_date, note, notdienst, is_active)
VALUES (
  'b9000000-0000-4000-8000-00000000e001',
  'b1000000-0000-4000-8000-00000000c001',   -- der Disponent von Hanse Personal
  'supply', 'Lager / Kommissionierung', 'Hamburg', 5,
  CURRENT_DATE + 7,
  'Probebuehne Y2.1: das Angebot, auf das die sieben Anfragen zeigen.',
  FALSE, TRUE
)
ON CONFLICT (id) DO UPDATE SET
  qty = EXCLUDED.qty, start_date = EXCLUDED.start_date,
  note = EXCLUDED.note, is_active = EXCLUDED.is_active;
-- =============================================================================
-- (C) ANFRAGEN · sieben unbesetzte Zustände
-- =============================================================================
-- Alle zwischen derselben Paarung, damit jeder Zustand aus BEIDEN Richtungen
-- sichtbar ist: Nordlicht fragt, Hanse empfängt.
INSERT INTO requests
  (id, listing_id, requester_id, receiver_id, org_id, status, priority, message,
   role, quantity, location_text, region, start_date, created_at, updated_at)
VALUES
  ('b9000000-0000-4000-8000-00000000c001',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'CREATED', 'NORMAL',
   'Probebuehne Y2.1: angelegt, aber noch nicht verschickt - der Entwurf auf der Kundenseite.',
   'Lagerhelfer:in', 2, 'Hamburg Hafen', 'Hamburg', CURRENT_DATE + 14,
   now() - interval '2 hours', now() - interval '2 hours'),

  ('b9000000-0000-4000-8000-00000000c002',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'OFFER_SENT', 'NORMAL',
   'Probebuehne Y2.1: die Zeitarbeitsfirma hat ein Angebot geschickt - der Ball liegt beim Kunden.',
   'Kommissionierer:in', 3, 'Berlin Schoenefeld', 'Berlin', CURRENT_DATE + 20,
   now() - interval '4 days', now() - interval '1 day'),

  ('b9000000-0000-4000-8000-00000000c003',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'DECLINED', 'NORMAL',
   'Probebuehne Y2.1: die GEGENSEITE hat abgelehnt. Nicht verwechseln mit CANCELED - dort zieht der Besteller zurueck.',
   'Staplerfahrer:in', 1, 'Muenchen Nord', 'Bayern', CURRENT_DATE + 8,
   now() - interval '9 days', now() - interval '7 days'),

  ('b9000000-0000-4000-8000-00000000c004',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'CONFIRMED', 'NORMAL',
   'Probebuehne Y2.1: beide Seiten haben bestaetigt - der Einsatz hat noch nicht begonnen.',
   'Lagerhelfer:in', 2, 'Hamburg Hafen', 'Hamburg', CURRENT_DATE + 3,
   now() - interval '6 days', now() - interval '2 days'),

  ('b9000000-0000-4000-8000-00000000c005',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'ASSIGNMENT_STARTED', 'NORMAL',
   'Probebuehne Y2.1: der Einsatz laeuft - zwischen CONFIRMED und FILLED liegt der Start.',
   'Lagerhelfer:in', 2, 'Hamburg Hafen', 'Hamburg', CURRENT_DATE - 7,
   now() - interval '14 days', now() - interval '7 days'),

  ('b9000000-0000-4000-8000-00000000c006',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'COMPLETED', 'NORMAL',
   'Probebuehne Y2.1: abgeschlossen und abgerechnet - der letzte Zustand des Kreislaufs.',
   'Kommissionierer:in', 4, 'Berlin Schoenefeld', 'Berlin', CURRENT_DATE - 45,
   now() - interval '60 days', now() - interval '30 days'),

  ('b9000000-0000-4000-8000-00000000c007',
   'b9000000-0000-4000-8000-00000000e001',
   'b0000000-0000-4000-8000-00000000c001', 'b1000000-0000-4000-8000-00000000c001',
   'b0000000-0000-4000-8000-000000000001', 'CANCELED', 'NOTDIENST',
   'Probebuehne Y2.1: der BESTELLER hat zurueckgezogen. Sieht in der Liste wie DECLINED aus und bedeutet das Gegenteil.',
   'Staplerfahrer:in', 3, 'Hamburg Hafen', 'Hamburg', CURRENT_DATE + 2,
   now() - interval '3 days', now() - interval '1 day')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, priority = EXCLUDED.priority,
  message = EXCLUDED.message, start_date = EXCLUDED.start_date,
  updated_at = EXCLUDED.updated_at;

-- =============================================================================
-- (D) STUNDENZETTEL · der eine unbesetzte Zustand (Y2.2)
-- =============================================================================
-- `cancelled` hatte kein Beispiel. Die Woche liegt bewusst weit zurueck, damit
-- die Eindeutigkeit (org_id, supplier_org_id, assignment_id, worker_identifier,
-- week_start) mit keinem der zehn vorhandenen Zettel kollidiert.
INSERT INTO timesheets
  (id, org_id, supplier_org_id, assignment_id, worker_name, worker_identifier,
   week_start, week_end, total_hours, overtime_hours, status, source,
   cancelled_by, created_at, updated_at)
VALUES (
  'b9000000-0000-4000-8000-00000000d001',
  'b0000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-00000000f001',
  'Tomasz Nowak', 'HPS-007',
  (date_trunc('week', CURRENT_DATE - 70))::date,
  (date_trunc('week', CURRENT_DATE - 70) + interval '6 days')::date,
  0, 0, 'cancelled', 'manual',
  'b1000000-0000-4000-8000-00000000c001',
  now() - interval '68 days', now() - interval '66 days'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  week_start = EXCLUDED.week_start, week_end = EXCLUDED.week_end,
  cancelled_by = EXCLUDED.cancelled_by, updated_at = EXCLUDED.updated_at;

-- Notbremse: stehen jetzt wirklich alle sechzehn Zustaende da?
DO $vollstaendig$
DECLARE fehlt text[] := '{}';
BEGIN
  FOR i IN 1..1 LOOP
    -- requests: sieben
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'CREATED')            THEN fehlt := fehlt || 'requests=CREATED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'OFFER_SENT')         THEN fehlt := fehlt || 'requests=OFFER_SENT'; END IF;
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'DECLINED')           THEN fehlt := fehlt || 'requests=DECLINED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'CONFIRMED')          THEN fehlt := fehlt || 'requests=CONFIRMED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'ASSIGNMENT_STARTED') THEN fehlt := fehlt || 'requests=ASSIGNMENT_STARTED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'COMPLETED')          THEN fehlt := fehlt || 'requests=COMPLETED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM requests WHERE status = 'CANCELED')           THEN fehlt := fehlt || 'requests=CANCELED'; END IF;
    -- demand_requests: drei
    IF NOT EXISTS (SELECT 1 FROM demand_requests WHERE status = 'closed')      THEN fehlt := fehlt || 'demand_requests=closed'; END IF;
    IF NOT EXISTS (SELECT 1 FROM demand_requests WHERE status = 'cancelled')   THEN fehlt := fehlt || 'demand_requests=cancelled'; END IF;
    IF NOT EXISTS (SELECT 1 FROM demand_requests WHERE status = 'paused')      THEN fehlt := fehlt || 'demand_requests=paused'; END IF;
    -- offers: drei plus zwei
    IF NOT EXISTS (SELECT 1 FROM offers WHERE status = 'rejected')             THEN fehlt := fehlt || 'offers=rejected'; END IF;
    IF NOT EXISTS (SELECT 1 FROM offers WHERE status = 'withdrawn')            THEN fehlt := fehlt || 'offers=withdrawn'; END IF;
    IF NOT EXISTS (SELECT 1 FROM offers WHERE status = 'countered')            THEN fehlt := fehlt || 'offers=countered'; END IF;
    IF NOT EXISTS (SELECT 1 FROM offers WHERE agreement_status = 'none')       THEN fehlt := fehlt || 'offers.agreement_status=none'; END IF;
    IF NOT EXISTS (SELECT 1 FROM offers WHERE agreement_status = 'expired')    THEN fehlt := fehlt || 'offers.agreement_status=expired'; END IF;
    -- timesheets: einer
    IF NOT EXISTS (SELECT 1 FROM timesheets WHERE status = 'cancelled')        THEN fehlt := fehlt || 'timesheets=cancelled'; END IF;
  END LOOP;
  IF array_length(fehlt, 1) > 0 THEN
    RAISE EXCEPTION
      'y2-2-dealzustaende.sql: nach der Saat sind diese Zustaende WEITER unbesetzt: %. Vermutlich passt ein Wert nicht zum CHECK oder eine Zeile wurde nicht eingefuegt - die Saat waere wirkungslos und saehe erfolgreich aus.', array_to_string(fehlt, ', ');
  END IF;
END $vollstaendig$;

COMMIT;
