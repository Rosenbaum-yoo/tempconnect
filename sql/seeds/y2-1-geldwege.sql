-- =============================================================================
-- Y2 · DIE GELDWEGE UND DIE LEEREN TABELLEN (Y2.3 · Y2.5 · Y2.6)
-- =============================================================================
-- Welle Y, Abschnitt Y2 (docs/features/Y_PROBEBUEHNE.md).
--
-- GEMESSEN AM 2026-10-01 — drei Gegenstände fehlen nicht teilweise, sondern GANZ:
--
--   `invoices`                    **0 Zeilen**. Die gesamte Rechnungsfläche —
--                                 Entwurf, gestellt, bezahlt, überfällig,
--                                 storniert — hat keine Daten. Alle FÜNF
--                                 Zustände unbesetzt. Die Mahnstrecke, die Y2.3
--                                 verlangt, ist nicht zeigbar.
--   `company_worker_blocklist`    **0 Zeilen**. Y2.5s zentrale Zusage —
--                                 „dieselbe Kraft bei Kunde A gesperrt, bei
--                                 Kunde B sichtbar" — hat kein Beispiel.
--   offener Fähigkeits-Vorschlag  **0**. Alle 162 Katalog-Einträge stehen auf
--                                 `approved`; `proposed`, `rejected` und
--                                 `merged` sind unbesetzt. Die Kuratierfläche
--                                 aus b-6/b-7 ist leer, wenn man sie zeigt.
--
-- Eine leere Tabelle ist schlimmer als ein unbesetzter Zustand: beim Zustand
-- sieht man wenigstens die Liste. Hier sieht man nichts und weiß nicht, ob die
-- Fläche kaputt ist oder nur leer.
--
-- -----------------------------------------------------------------------------
-- ALLE FÄLLIGKEITEN SIND RELATIV. Y2.3 verlangt das ausdrücklich: „mit
-- RELATIVEN Datumswerten — die Mahnstrecke zeigt echte Fälligkeiten statt ,vor
-- zwei Jahren'". Ein festes Datum ist in drei Wochen falsch und in drei Monaten
-- lächerlich. Deshalb `CURRENT_DATE ± n` und `now() - interval`, nirgends ein
-- Kalenderdatum.
--
-- DIE GELD-ARITHMETIK MUSS STIMMEN, und die Datenbank erzwingt es:
--   CHECK (gross_amount_cents - discount_amount_cents = amount_cents)
-- Dazu `total_cents = amount_cents + tax_amount_cents`. Beides ist hier von Hand
-- durchgerechnet und steht als Kommentar an jeder Zeile — eine Rechnung, deren
-- Summen nicht aufgehen, wäre in einer Bühne für Geldwege das Gegenteil eines
-- Belegs.
--
-- Kennungen beginnen mit `b7` (hex-gültig).
-- =============================================================================

BEGIN;

-- ── SPERRE (2026-10-01) ──────────────────────────────────────────────────────
DO $sperre_saat$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'y2-1-geldwege.sql: SEED_DEMO_WORLD nicht aktiv - Saat verweigert (prod-sicher). Diese Saat legt Rechnungen und eine Sperrliste an.';
  END IF;
END $sperre_saat$;
-- ─────────────────────────────────────────────────────────────────────────────

DO $voraussetzungen$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'b0000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION
      'y2-1-geldwege.sql: Nordlicht Logistik GmbH fehlt (y1-2-standorte.sql). Die Rechnungen gehen an diesen Kunden, und die Sperre gilt bei ihm.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = 'b1000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION
      'y2-1-geldwege.sql: Hanse Personal Service GmbH fehlt (y1-4-belegschaft.sql). Sie ist der Lieferant der operativen Rechnungen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'b5000000-0000-4000-8000-00000000c001') THEN
    RAISE EXCEPTION
      'y2-1-geldwege.sql: das Arbeiterkonto kraft01 fehlt (y3-arbeiterstadien.sql). Die Sperre aus Y2.5 haengt an einem Arbeiter-KONTO, nicht am Profil.';
  END IF;
END $voraussetzungen$;

-- =============================================================================
-- Y2.3 · RECHNUNGEN IN JEDEM ZUSTAND, MIT RELATIVEN FÄLLIGKEITEN
-- =============================================================================
-- Fünf Zustände, fünf Zeilen, jede mit durchgerechneten Summen.
INSERT INTO invoices (
  id, invoice_number, org_id, supplier_org_id, assignment_id, invoice_type,
  billing_period_start, billing_period_end, plan,
  gross_amount_cents, discount_pct, discount_amount_cents, amount_cents,
  tax_rate_pct, tax_amount_cents, total_cents, currency,
  status, issued_at, due_at, paid_at, dunning_level, last_dunning_at,
  reference_number, notes
)
VALUES
  -- 1) ENTWURF: noch nicht gestellt, also auch nicht fällig.
  --    brutto 120000, kein Rabatt -> netto 120000, 19% = 22800, Summe 142800
  ('b7000000-0000-4000-8000-00000000a001', NULL,
   'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000f001', 'operational',
   CURRENT_DATE - 7, CURRENT_DATE - 1, 'PLUS',
   120000, 0, 0, 120000, 19.0, 22800, 142800, 'EUR',
   'draft', NULL, NULL, NULL, 0, NULL,
   'Y2-ENTWURF-001', 'Probebuehne Y2.3: Entwurf - gestellt wird er erst, wenn der Stundenzettel genehmigt ist.'),

  -- 2) GESTELLT, FÄLLIG IN DER ZUKUNFT: der gewoehnliche Fall.
  --    brutto 480000, kein Rabatt -> netto 480000, 19% = 91200, Summe 571200
  ('b7000000-0000-4000-8000-00000000a002', 'Y2-2026-0002',
   'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000f001', 'operational',
   CURRENT_DATE - 21, CURRENT_DATE - 7, 'PLUS',
   480000, 0, 0, 480000, 19.0, 91200, 571200, 'EUR',
   'issued', now() - interval '6 days', (CURRENT_DATE + 8)::timestamptz, NULL, 0, NULL,
   'Y2-2026-0002', 'Probebuehne Y2.3: gestellt, faellig in acht Tagen - der gewoehnliche Fall.'),

  -- 3) ÜBERFÄLLIG, MAHNSTUFE 2: der Fall, den die Mahnstrecke zeigt.
  --    Haengt an der Organisation, die wegen Zahlungsausfall gesperrt ist (Y1.3).
  --    brutto 350000, 10% Rabatt = 35000 -> netto 315000, 19% = 59850, Summe 374850
  ('b7000000-0000-4000-8000-00000000a003', 'Y2-2026-0003',
   'b3000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001',
   NULL, 'operational',
   CURRENT_DATE - 75, CURRENT_DATE - 45, 'PLUS',
   350000, 10, 35000, 315000, 19.0, 59850, 374850, 'EUR',
   'overdue', now() - interval '44 days', (CURRENT_DATE - 30)::timestamptz, NULL,
   2, now() - interval '9 days',
   'Y2-2026-0003', 'Probebuehne Y2.3: 30 Tage ueberfaellig, Mahnstufe 2 - dieselbe Organisation ist deshalb wegen Zahlungsausfall gesperrt (Y1.3).'),

  -- 4) BEZAHLT: der abgeschlossene Fall, mit Zahlungsdatum.
  --    brutto 290000, kein Rabatt -> netto 290000, 19% = 55100, Summe 345100
  ('b7000000-0000-4000-8000-00000000a004', 'Y2-2026-0004',
   'b0000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
   'b1000000-0000-4000-8000-00000000f001', 'operational',
   CURRENT_DATE - 60, CURRENT_DATE - 45, 'PLUS',
   290000, 0, 0, 290000, 19.0, 55100, 345100, 'EUR',
   'paid', now() - interval '44 days', (CURRENT_DATE - 30)::timestamptz,
   now() - interval '33 days', 0, NULL,
   'Y2-2026-0004', 'Probebuehne Y2.3: bezahlt, drei Tage vor Faelligkeit.'),

  -- 5) STORNIERT: eine Rechnung, die nicht mehr gilt. Eine ABO-Rechnung diesmal,
  --    damit auch invoice_type='subscription' ein Beispiel hat.
  --    brutto 14900, kein Rabatt -> netto 14900, 19% = 2831, Summe 17731
  ('b7000000-0000-4000-8000-00000000a005', 'Y2-2026-0005',
   'b0000000-0000-4000-8000-000000000001', NULL, NULL, 'subscription',
   CURRENT_DATE - 90, CURRENT_DATE - 60, 'PLUS',
   14900, 0, 0, 14900, 19.0, 2831, 17731, 'EUR',
   'void', now() - interval '59 days', (CURRENT_DATE - 45)::timestamptz, NULL, 0, NULL,
   'Y2-2026-0005', 'Probebuehne Y2.3: storniert - doppelt gestellt und zurueckgenommen.')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  issued_at = EXCLUDED.issued_at,
  due_at = EXCLUDED.due_at,
  paid_at = EXCLUDED.paid_at,
  dunning_level = EXCLUDED.dunning_level,
  last_dunning_at = EXCLUDED.last_dunning_at,
  billing_period_start = EXCLUDED.billing_period_start,
  billing_period_end = EXCLUDED.billing_period_end;

-- =============================================================================
-- Y2.5 · EINE SPERRE: BEI KUNDE A GESPERRT, BEI KUNDE B SICHTBAR
-- =============================================================================
-- Die zentrale Zusage der Sperrliste, und sie lässt sich nur zeigen, wenn
-- BEIDE Seiten da sind: die Sperre bei Nordlicht UND die Sichtbarkeit woanders.
--
-- Jonas Harms (kraft01) steht mit „Lagerhelfer:in" im Markt — ein automatisches
-- Angebot aus der Live-Belegschaft. Nordlicht sperrt ihn; jeder andere Kunde
-- sieht ihn weiter. Ohne die Sperre wäre die Liste leer, mit einer Sperre OHNE
-- sichtbares Angebot wäre die Gegenseite nicht belegt.
INSERT INTO company_worker_blocklist
  (id, company_org_id, worker_user_id, supplier_org_id, reason, blocked_until, created_by)
VALUES (
  'b7000000-0000-4000-8000-00000000b001',
  'b0000000-0000-4000-8000-000000000001',   -- Nordlicht Logistik sperrt
  'b5000000-0000-4000-8000-00000000c001',   -- Jonas Harms
  'b1000000-0000-4000-8000-000000000001',   -- vermittelt von Hanse Personal
  'Probebuehne Y2.5: nach einem Vorfall am Standort Hamburg vorlaeufig gesperrt. Bei anderen Kunden bleibt die Kraft sichtbar - genau das ist die Zusage der Sperrliste.',
  CURRENT_DATE + 90,
  'b0000000-0000-4000-8000-00000000c001'    -- die Verwaltung hat gesperrt
)
ON CONFLICT (company_org_id, worker_user_id) DO UPDATE SET
  reason = EXCLUDED.reason,
  blocked_until = EXCLUDED.blocked_until,
  supplier_org_id = EXCLUDED.supplier_org_id;

-- =============================================================================
-- Y2.6 · EIN OFFENER FÄHIGKEITS-VORSCHLAG UND EINE KATALOGFREMDE SCHREIBVARIANTE
-- =============================================================================
-- Alle 162 Einträge stehen auf `approved`. Die Kuratierfläche hat damit nichts
-- zu kuratieren.
--
-- ZWEI verschiedene Fälle, und der Unterschied ist der Punkt:
--   `proposed`  eine Firma schlägt eine Fähigkeit vor, die es noch nicht gibt
--   `merged`    eine Schreibvariante, die auf einen bestehenden Eintrag
--               zusammengeführt wurde — `merged_into_skill_id` zeigt dorthin
INSERT INTO platform_skills
  (id, name, category, aliases, usage_count, is_active, status,
   proposed_by_user_id, proposed_by_org_id, merged_into_skill_id)
VALUES
  ('b7000000-0000-4000-8000-00000000c001',
   'Kaltlager-Kommissionierung (-25 Grad)', 'Lager & Logistik',
   ARRAY['Tiefkuehllager', 'Frostlager'], 0, FALSE, 'proposed',
   'b1000000-0000-4000-8000-00000000c001',   -- der Disponent schlaegt vor
   'b1000000-0000-4000-8000-000000000001',
   NULL)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, is_active = EXCLUDED.is_active,
  aliases = EXCLUDED.aliases, category = EXCLUDED.category;

-- Die Schreibvariante: zusammengefuehrt auf den vorhandenen Eintrag. Das Ziel
-- wird AUS dem Katalog gelesen, nicht getippt - ein Tippfehler wuerde die
-- Zusammenfuehrung ins Leere zeigen lassen.
INSERT INTO platform_skills
  (id, name, category, aliases, usage_count, is_active, status,
   proposed_by_user_id, proposed_by_org_id, merged_into_skill_id)
SELECT
  'b7000000-0000-4000-8000-00000000c002',
  'Lagerhelfer/in (m/w/d)', ps.category, ARRAY['Lagerhelferin', 'Lagerhelfer'],
  0, FALSE, 'merged',
  'b1000000-0000-4000-8000-00000000c001',
  'b1000000-0000-4000-8000-000000000001',
  ps.id
  FROM platform_skills ps
 WHERE ps.name = 'Lagerhelfer:in' AND ps.is_active AND ps.status = 'approved'
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status, is_active = EXCLUDED.is_active,
  merged_into_skill_id = EXCLUDED.merged_into_skill_id;

-- Notbremse: steht jetzt wirklich jeder der drei Gegenstaende da?
DO $vollstaendig$
DECLARE fehlt text[] := '{}';
BEGIN
  FOR i IN 1..1 LOOP
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE status = 'draft')   THEN fehlt := fehlt || 'invoices.status=draft'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE status = 'issued')  THEN fehlt := fehlt || 'invoices.status=issued'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE status = 'overdue') THEN fehlt := fehlt || 'invoices.status=overdue'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE status = 'paid')    THEN fehlt := fehlt || 'invoices.status=paid'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE status = 'void')    THEN fehlt := fehlt || 'invoices.status=void'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE dunning_level > 0)  THEN fehlt := fehlt || 'Rechnung mit Mahnstufe > 0'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE due_at::date < CURRENT_DATE AND status = 'overdue')
      THEN fehlt := fehlt || 'ueberfaellige Rechnung mit Faelligkeit in der Vergangenheit'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE due_at::date > CURRENT_DATE AND status = 'issued')
      THEN fehlt := fehlt || 'gestellte Rechnung mit Faelligkeit in der Zukunft'; END IF;
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_type = 'subscription')
      THEN fehlt := fehlt || 'Abo-Rechnung (invoice_type=subscription)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM company_worker_blocklist)
      THEN fehlt := fehlt || 'Sperrliste (Y2.5)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM platform_skills WHERE status = 'proposed')
      THEN fehlt := fehlt || 'offener Faehigkeits-Vorschlag (Y2.6)'; END IF;
    IF NOT EXISTS (SELECT 1 FROM platform_skills WHERE status = 'merged' AND merged_into_skill_id IS NOT NULL)
      THEN fehlt := fehlt || 'zusammengefuehrte Schreibvariante MIT Ziel (Y2.6)'; END IF;
  END LOOP;
  IF array_length(fehlt, 1) > 0 THEN
    RAISE EXCEPTION
      'y2-1-geldwege.sql: nach der Saat fehlen weiter: %. Vermutlich passt ein Wert nicht zum CHECK, oder die Katalog-Faehigkeit "Lagerhelfer:in" wurde nicht gefunden - dann legt die INSERT..SELECT lautlos keine Zeile an.', array_to_string(fehlt, '; ');
  END IF;
END $vollstaendig$;

COMMIT;
