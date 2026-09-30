-- =============================================================================
-- 196_rls_backstop_achtzehn_tabellen.sql — V-1 wird scharf (Plan I, Vorlauf)
-- =============================================================================
-- WAS HIER PASSIERT: Row Level Security wird auf den 18 Tabellen aktiviert, die
-- `api/test/fixtures/mandantenTabellen.json` als `bereit` fuehrt — Traegerspalte
-- in ALLEN Zeilen gefuellt, mandanten-privat, RLS ohne Datenausfall moeglich.
--
-- ── DIE VORGESCHICHTE, ohne die man das hier falsch liest ──────────────────
--   `TENANT_ISOLATION_MODEL.md` verwies fuer 63 Tabellen auf eine Migration 117.
--   Die gibt es nicht; das Verzeichnis springt von 116 auf 118. Das Dokument
--   behauptete einen Schutz, den es nie gab — schlimmer als kein Schutz, weil
--   wer es liest, aufhoert zu suchen. Gemessen war es in BEIDE Richtungen
--   falsch: 18 der genannten Tabellen haben die behauptete Spalte gar nicht,
--   und umgekehrt fehlten 60, die sehr wohl einen Mandanten tragen.
--
--   Migration 116 riss sich selbst in den Rollback, weil sie auf Spalten baute,
--   die es nicht gab — und wurde trotzdem als "applied" verbucht. Diese
--   Migration nennt deshalb jede Tabelle EINZELN und prueft jede Spalte, statt
--   eine Liste abzuarbeiten.
--
-- ── WARUM `OR` UND NICHT NUR `org_id` ───────────────────────────────────────
--   Acht dieser Tabellen haben ZWEI Org-Spalten, weil ein Deal zwei Seiten hat:
--   ein Einsatz gehoert dem KUNDEN (`org_id`) und wird von der AGENTUR besetzt
--   (`supplier_org_id`). Eine Regel `org_id = current_org_id()` haette jede
--   Agentur fuer ihre EIGENE Arbeit blind gemacht — RLS waere kein Schutz
--   gewesen, sondern ein Datenausfall. Genau davor warnt der Plan.
--
-- ── DER NACHWEIS, den der Owner verlangt hat ────────────────────────────────
--   "Nachweis je Tabelle einzeln an einer Wegwerf-Datenbank mit
--    Nicht-Superuser-Rolle: zwei echte Organisationen; ohne Kontext 0 Zeilen,
--    mit Org A nur A, mit Staff-Bypass alles. Kein Sammelnachweis, keine
--    Aktivierung ohne diesen Beweis."
--
--   Gefuehrt am 2026-08-24 auf einer Wegwerf-Datenbank (`rls_probe`, Schema aus
--   der laufenden Instanz) mit der Rolle `rls_app` (`rolsuper = false`):
--     18 von 18 Tabellen einzeln  ·  ohne Kontext 0 · mit Org A nur A ·
--                                    mit Staff-Bypass alles
--      8 von  8 zweiseitigen      ·  Kunde 1 · Agentur 1 · unbeteiligter
--                                    Dritter 0
--
--   Der zweite Nachweis war noetig, weil der erste bei den zweiseitigen
--   Tabellen BEIDE Spalten auf dieselbe Organisation setzte — damit haette auch
--   eine Regel ohne `OR` bestanden, und der Ausfall waere erst im Betrieb
--   aufgefallen.
--
--   WARUM UEBERHAUPT EINE WEGWERF-DATENBANK: die Anwendung laeuft lokal als
--   Superuser. RLS ist dort wirkungslos, und ein Fehler wuerde von der
--   Testsuite NICHT bemerkt.
--
-- ── REIHENFOLGE (Owner-Entscheid 2026-08-21) ────────────────────────────────
--   8.1.1 zuerst, RLS danach: die Schreibseite wird repariert, bevor der
--   Backstop gesetzt wird — sonst sichert man leere Traegerspalten ab und macht
--   Daten unsichtbar statt sie zu schuetzen. 8.1.1 ist erledigt (Migration 187,
--   `fremde_org` 139 -> 0).
--
--   NICHT dabei: die 10 durch Daten blockierten Tabellen (`requests`,
--   `ratings`, `listings` zu 100 % ohne Traegerspalte, `notifications` zu 96 %)
--   und die 25 leeren. Bei ihnen waere RLS heute ein Datenausfall.
--
-- RESILIENZ: kein umschliessendes BEGIN; jede Tabelle einzeln per to_regclass
--   UND Spaltenpruefung. Fehlt eine Spalte, wird die Tabelle uebersprungen und
--   laut gemeldet — nicht die ganze Migration in den Rollback gerissen (116).
-- IDEMPOTENZ: ENABLE/FORCE sind idempotent; DROP POLICY IF EXISTS vor CREATE.
-- ROLLBACK je Tabelle:
--   ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS <p>_same_org ON <t>;
--   DROP POLICY IF EXISTS <p>_staff_bypass ON <t>;
--   Kein Datenverlust — RLS filtert nur, es loescht nichts.
-- =============================================================================

SET client_min_messages TO WARNING;

DO $backstop$
DECLARE
  -- Tabelle, Policy-Praefix, Org-Spalten. Einzeln benannt, nicht generiert:
  -- eine Liste, die sich selbst erzeugt, prueft niemand gegen.
  ziele CONSTANT TEXT[][] := ARRAY[
    ['assignment_staffing_campaigns', 'asc',  'org_id,supplier_org_id'],
    ['assignment_staffing_invites',   'asi',  'org_id,supplier_org_id'],
    ['assignment_staffing_waitlist',  'asw',  'org_id,supplier_org_id'],
    ['assignments',                   'asg',  'org_id,supplier_org_id'],
    ['contracts',                     'ctr',  'buyer_org_id,supplier_org_id'],
    ['document_center',               'doc',  'org_id'],
    ['org_api_keys',                  'oak',  'org_id'],
    ['org_departments',               'odp',  'org_id'],
    ['org_invitations',               'oiv',  'org_id'],
    ['org_locations',                 'olc',  'org_id'],
    ['org_settings',                  'ost',  'org_id'],
    ['rate_cards',                    'rcd',  'org_id,supplier_org_id'],
    ['search_history',                'shs',  'org_id'],
    ['worker_assignment_links',       'wal2', 'org_id,supplier_org_id'],
    ['worker_billing_snapshots',      'wbs',  'org_id'],
    ['worker_invites',                'wiv',  'supplier_org_id'],
    ['worker_profiles',               'wpf',  'supplier_org_id'],
    ['worker_time_submissions',       'wts',  'org_id,supplier_org_id']
  ];
  tab       TEXT;
  praefix   TEXT;
  spalten   TEXT[];
  spalte    TEXT;
  bedingung TEXT;
  fehlend   TEXT;
  gesetzt   INT := 0;
  uebersprungen INT := 0;
BEGIN
  FOR i IN 1 .. array_length(ziele, 1) LOOP
    tab     := ziele[i][1];
    praefix := ziele[i][2];
    spalten := string_to_array(ziele[i][3], ',');

    IF to_regclass('public.' || tab) IS NULL THEN
      RAISE NOTICE '196: % existiert nicht — uebersprungen.', tab;
      uebersprungen := uebersprungen + 1;
      CONTINUE;
    END IF;

    -- Jede Spalte einzeln pruefen. 116 ist daran gescheitert, dass sie eine
    -- Spalte voraussetzte, die es nicht gab — und riss dabei alles mit.
    fehlend := NULL;
    FOREACH spalte IN ARRAY spalten LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = tab AND column_name = spalte
      ) THEN
        fehlend := spalte;
        EXIT;
      END IF;
    END LOOP;

    IF fehlend IS NOT NULL THEN
      RAISE WARNING '196: %.% fehlt — Tabelle uebersprungen, RLS NICHT gesetzt.', tab, fehlend;
      uebersprungen := uebersprungen + 1;
      CONTINUE;
    END IF;

    -- `OR` ueber alle Traegerspalten: bei einem Deal muessen BEIDE Seiten ihre
    -- Zeile sehen. Am 2026-08-24 fuer alle acht zweiseitigen Tabellen einzeln
    -- nachgewiesen (Kunde 1 · Agentur 1 · Dritter 0).
    SELECT string_agg(format('%I = current_org_id()', s), ' OR ')
      INTO bedingung
      FROM unnest(spalten) AS s;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tab);
    -- FORCE, damit die Regel auch fuer den Tabelleneigentuemer gilt. Ohne sie
    -- waere der Schutz genau fuer die Rolle aus, unter der die Anwendung in
    -- vielen Installationen laeuft.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tab);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', praefix || '_staff_bypass', tab);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', praefix || '_same_org', tab);

    EXECUTE format('CREATE POLICY %I ON %I USING (is_staff_context())',
                   praefix || '_staff_bypass', tab);
    EXECUTE format('CREATE POLICY %I ON %I USING (%s)',
                   praefix || '_same_org', tab, bedingung);

    gesetzt := gesetzt + 1;
    RAISE NOTICE '196: % — RLS + FORCE + 2 Policies (%).', tab, bedingung;
  END LOOP;

  RAISE NOTICE '196: % Tabellen gesetzt, % uebersprungen.', gesetzt, uebersprungen;

  IF gesetzt = 0 THEN
    RAISE EXCEPTION '196: keine einzige Tabelle gesetzt — das ist kein Erfolg, '
                    'sondern ein stiller Ausfall. Abgebrochen.';
  END IF;
END $backstop$;
