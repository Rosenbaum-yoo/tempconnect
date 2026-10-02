-- =============================================================================
-- Y2.4 + Y2.7 · SAMMELANGEBOTE MIT EIGENEN MITGLIEDERN
-- =============================================================================
-- Welle Y, Abschnitt Y2.4 und Y2.7 (docs/features/Y_PROBEBUEHNE.md).
--
-- DER PLAN NENNT HIER SELBST EINE FALLE, und die Messung bestätigt sie genau.
-- Gemessen am 2026-10-01:
--
--   Die beiden vorhandenen Pool-Angebote teilen sich **dieselben zwei Menschen**
--   (Max Mustermann, Anna Kraft) — und beide stehen zusätzlich in **vier** bzw.
--   **drei** offenen Einzelangeboten.
--
-- Eine Bühne, die auf ihnen aufbaut, führt also genau die **Doppelbuchung** vor,
-- die der Betrugsriegel widerlegen soll. Der Owner nennt diesen Zustand
-- ausdrücklich Betrug: *„ein Mensch, fünfmal gebucht, wäre Betrug"*
-- (`api/services/bindungSql.js`).
--
-- -----------------------------------------------------------------------------
-- ZWEI ANGEBOTE, ZWEI VERSCHIEDENE ZWECKE:
--
--   (A) Y2.7 — vier Mitglieder, die in KEINEM Einzelangebot stehen.
--       Dafür sind die vier Kräfte ohne Katalog-Fähigkeit genau richtig
--       (HPS-009 bis HPS-012): `sweepMarktpraesenz()` legt für sie **nie** ein
--       Einzelangebot an, weil Bedingung 6 (freigegebene Katalog-Fähigkeit)
--       fehlt. Die Exklusivität der Pool-Mitgliedschaft bleibt damit DAUERHAFT —
--       nicht zufällig, bis der nächste Sweep läuft.
--
--   (B) Y2.4 — der Gegenstand für den Betrugsriegel M4c.3.
--       `capacityExchangeService` rechnet die FREIE Kopfzahl eines
--       Sammelangebots aus: `SUM(CASE WHEN NOT gebunden THEN 1 ELSE 0 END)`
--       über `capacity_post_pool_members`. Ein Angebot mit drei Mitgliedern,
--       von denen eines **im Einsatz** ist, muss **zwei** zeigen, nicht drei.
--       Dieses Angebot stellt genau das her: Tomasz Nowak ist auf dem Einsatz
--       bei Nordlicht (Y1.4) gebunden, Jonas Harms steht zusätzlich in einem
--       automatischen Einzelangebot, Dennis Brinkmann ist frei.
--
--       Members = 3, davon frei = 2. Wer die Oberfläche öffnet und drei sieht,
--       hat den Riegel gefunden.
--
-- -----------------------------------------------------------------------------
-- `quelle = 'manuell'`, NICHT `'live_belegschaft'`. Das ist kein Schmuck: die
-- Rücknahme des Sweeps fasst ausschließlich eigene Zeilen an
-- (`quelle = 'live_belegschaft'`). Mit der falschen Herkunft würde der nächste
-- Cron-Takt diese beiden Angebote abräumen, und die Bühne wäre nach einer Stunde
-- wieder leer — ohne dass jemand es merkt.
--
-- Kennungen beginnen mit `bb` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert (prod-sicher).';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'b1000000-0000-4000-8000-00000000c001') THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: das Konto disponent@ fehlt (y1-4-belegschaft.sql). Es ist der Ansprechpartner beider Sammelangebote.';
  END IF;
  SELECT count(*) INTO n FROM worker_profiles
   WHERE id IN ('b1000000-0000-4000-8000-00000000d009','b1000000-0000-4000-8000-00000000d010',
                'b1000000-0000-4000-8000-00000000d011','b1000000-0000-4000-8000-00000000d012',
                'b1000000-0000-4000-8000-00000000d007','b1000000-0000-4000-8000-00000000d001');
  IF n <> 6 THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: % von 6 benoetigten Kraeften vorhanden. Die Mitglieder kommen aus y1-4-belegschaft.sql (Y1.4) - bitte zuerst laden.', n;
  END IF;
  -- Die vier Mitglieder von (A) muessen OHNE Katalog-Faehigkeit sein, sonst legt
  -- der Sweep Einzelangebote fuer sie an und die Exklusivitaet ist beim naechsten
  -- Takt weg. Das ist die ganze Pointe von Y2.7 - also wird es geprueft.
  SELECT count(*) INTO n FROM worker_profile_skills
   WHERE worker_profile_id IN ('b1000000-0000-4000-8000-00000000d009','b1000000-0000-4000-8000-00000000d010',
                               'b1000000-0000-4000-8000-00000000d011','b1000000-0000-4000-8000-00000000d012');
  IF n <> 0 THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: eine der vier Pool-Kraefte (HPS-009..012) traegt inzwischen eine Katalog-Faehigkeit (% Zuordnungen). Dann legt sweepMarktpraesenz() fuer sie ein Einzelangebot an, und das Sammelangebot fuehrt wieder die Doppelbuchung vor, die es widerlegen soll.', n;
  END IF;
END $voraussetzungen$;

-- =============================================================================
-- (A) Y2.7 · VIER MITGLIEDER, DIE SONST NIRGENDS STEHEN
-- =============================================================================
INSERT INTO capacity_posts (
  id, supplier_company_id, org_id, title, role, skill_tags, worker_category,
  headcount, availability_from, availability_type, location_city, location_postal,
  radius_km, country, employment_type, status, is_active, visibility_status,
  offer_kind, priority_level, placement_boost_level, is_anonymous, quelle,
  primary_skill_id, last_confirmed_at
)
SELECT
  'bb000000-0000-4000-8000-00000000a001',
  'b1000000-0000-4000-8000-00000000c001',
  'b1000000-0000-4000-8000-000000000001',
  'Vier Helfer fuer die Inventur', 'Lagerhelfer:in',
  ARRAY['Lagerhelfer:in', 'Inventur'], ps.category,
  4, CURRENT_DATE + 3, 'immediate', 'Hamburg', '20457',
  30, 'DE', 'temporary', 'active', TRUE, 'public',
  'pool_multi_skill', 'normal', 0, TRUE, 'manuell',
  ps.id, now()
  FROM platform_skills ps
 WHERE ps.name = 'Lagerhelfer:in' AND ps.is_active AND ps.status = 'approved'
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, is_active = EXCLUDED.is_active,
  headcount = EXCLUDED.headcount, availability_from = EXCLUDED.availability_from,
  last_confirmed_at = EXCLUDED.last_confirmed_at;

INSERT INTO capacity_post_pool_members (id, capacity_post_id, worker_profile_id)
VALUES
  ('bb000000-0000-4000-8000-00000000b001', 'bb000000-0000-4000-8000-00000000a001', 'b1000000-0000-4000-8000-00000000d009'),
  ('bb000000-0000-4000-8000-00000000b002', 'bb000000-0000-4000-8000-00000000a001', 'b1000000-0000-4000-8000-00000000d010'),
  ('bb000000-0000-4000-8000-00000000b003', 'bb000000-0000-4000-8000-00000000a001', 'b1000000-0000-4000-8000-00000000d011'),
  ('bb000000-0000-4000-8000-00000000b004', 'bb000000-0000-4000-8000-00000000a001', 'b1000000-0000-4000-8000-00000000d012')
ON CONFLICT (capacity_post_id, worker_profile_id) DO NOTHING;

-- =============================================================================
-- (B) Y2.4 · DER GEGENSTAND FÜR DEN BETRUGSRIEGEL (M4c.3)
-- =============================================================================
-- Drei Mitglieder, davon EINES gebunden. Die freie Kopfzahl muss zwei zeigen.
INSERT INTO capacity_posts (
  id, supplier_company_id, org_id, title, role, skill_tags, worker_category,
  headcount, availability_from, availability_type, location_city, location_postal,
  radius_km, country, employment_type, status, is_active, visibility_status,
  offer_kind, priority_level, placement_boost_level, is_anonymous, quelle,
  primary_skill_id, last_confirmed_at
)
SELECT
  'bb000000-0000-4000-8000-00000000a002',
  'b1000000-0000-4000-8000-00000000c001',
  'b1000000-0000-4000-8000-000000000001',
  'Drei Kraefte Umschlag - eine davon im Einsatz', 'Lagerhelfer:in',
  ARRAY['Lagerhelfer:in'], ps.category,
  3, CURRENT_DATE + 1, 'immediate', 'Hamburg', '20457',
  25, 'DE', 'temporary', 'active', TRUE, 'public',
  'pool_single_skill', 'normal', 0, TRUE, 'manuell',
  ps.id, now()
  FROM platform_skills ps
 WHERE ps.name = 'Lagerhelfer:in' AND ps.is_active AND ps.status = 'approved'
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, is_active = EXCLUDED.is_active,
  headcount = EXCLUDED.headcount, availability_from = EXCLUDED.availability_from,
  last_confirmed_at = EXCLUDED.last_confirmed_at;

INSERT INTO capacity_post_pool_members (id, capacity_post_id, worker_profile_id)
VALUES
  -- GEBUNDEN: Tomasz Nowak ist auf dem Einsatz bei Nordlicht (Y1.4). Er zaehlt
  -- als Mitglied, aber NICHT als frei - das ist der Riegel.
  ('bb000000-0000-4000-8000-00000000b011', 'bb000000-0000-4000-8000-00000000a002', 'b1000000-0000-4000-8000-00000000d007'),
  -- DOPPELT GEFUEHRT, und zwar absichtlich: Jonas Harms steht zusaetzlich in
  -- einem automatischen Einzelangebot aus der Live-Belegschaft. Genau diese
  -- Lage verlangt Y2.4 fuer die Probe aus M4c.3.
  ('bb000000-0000-4000-8000-00000000b012', 'bb000000-0000-4000-8000-00000000a002', 'b1000000-0000-4000-8000-00000000d001'),
  -- FREI und sonst nirgends: Dennis Brinkmann.
  ('bb000000-0000-4000-8000-00000000b013', 'bb000000-0000-4000-8000-00000000a002', 'b1000000-0000-4000-8000-00000000d009')
ON CONFLICT (capacity_post_id, worker_profile_id) DO NOTHING;

-- Notbremse: steht die Lage wirklich so, wie der Riegel sie braucht?
DO $vollstaendig$
DECLARE mitglieder integer; frei integer; exklusiv integer; doppelt integer;
BEGIN
  -- (A) vier Mitglieder, und KEINES davon in einem offenen Einzelangebot
  SELECT count(*) INTO mitglieder FROM capacity_post_pool_members
   WHERE capacity_post_id = 'bb000000-0000-4000-8000-00000000a001';
  IF mitglieder <> 4 THEN
    RAISE EXCEPTION 'y2-3-sammelangebote.sql: Sammelangebot (A) hat % Mitglieder, erwartet vier.', mitglieder;
  END IF;
  SELECT count(*) INTO exklusiv FROM capacity_post_pool_members m
   WHERE m.capacity_post_id = 'bb000000-0000-4000-8000-00000000a001'
     AND EXISTS (SELECT 1 FROM capacity_posts e
                  WHERE e.worker_profile_id = m.worker_profile_id
                    AND e.offer_kind = 'single_skill'
                    AND e.status IN ('draft','active','paused'));
  IF exklusiv <> 0 THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: % der vier Mitglieder von (A) stehen AUCH in einem offenen Einzelangebot. Damit fuehrt die Buehne die Doppelbuchung vor, die sie widerlegen soll - genau der Zustand, den die beiden alten Sammelangebote haben.', exklusiv;
  END IF;

  -- (B) drei Mitglieder, genau eines gebunden, genau eines zusaetzlich einzeln
  SELECT count(*) INTO mitglieder FROM capacity_post_pool_members
   WHERE capacity_post_id = 'bb000000-0000-4000-8000-00000000a002';
  IF mitglieder <> 3 THEN
    RAISE EXCEPTION 'y2-3-sammelangebote.sql: Sammelangebot (B) hat % Mitglieder, erwartet drei.', mitglieder;
  END IF;
  SELECT count(*) INTO frei FROM capacity_post_pool_members m
   WHERE m.capacity_post_id = 'bb000000-0000-4000-8000-00000000a002'
     AND NOT EXISTS (
       SELECT 1 FROM worker_profiles bw
       JOIN worker_assignment_links bl ON bl.worker_user_id = bw.user_id
        AND bl.is_active AND (bl.end_date IS NULL OR bl.end_date >= CURRENT_DATE)
       WHERE bw.id = m.worker_profile_id);
  IF frei <> 2 THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: Sammelangebot (B) hat % freie Mitglieder, erwartet ZWEI von drei. Der Betrugsriegel aus M4c.3 ("ein Sammelangebot kann nie mehr Menschen liefern, als frei sind") braucht genau diese Luecke zwischen Mitgliederzahl und freier Kopfzahl - ohne sie ist er nicht vorfuehrbar.', frei;
  END IF;
  SELECT count(*) INTO doppelt FROM capacity_post_pool_members m
   WHERE m.capacity_post_id = 'bb000000-0000-4000-8000-00000000a002'
     AND EXISTS (SELECT 1 FROM capacity_posts e
                  WHERE e.worker_profile_id = m.worker_profile_id
                    AND e.offer_kind = 'single_skill'
                    AND e.status IN ('draft','active','paused'));
  IF doppelt < 1 THEN
    RAISE EXCEPTION
      'y2-3-sammelangebote.sql: kein Mitglied von (B) steht zusaetzlich in einem Einzelangebot. Y2.4 verlangt genau einen BEWUSST doppelt gefuehrten Menschen (gefunden: %) - ohne ihn fehlt der Probe aus M4c.3 ihr Gegenstand. Hinweis: das automatische Einzelangebot entsteht erst, wenn sweepMarktpraesenz() gelaufen ist.', doppelt;
  END IF;
END $vollstaendig$;

COMMIT;
