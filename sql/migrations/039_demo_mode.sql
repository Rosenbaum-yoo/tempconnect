-- Migration 039: Demo-Modus — is_demo Flag, Demo-Organisationen, Demo-Kapazitäten
-- Erweitert die bestehenden Demo-User um das is_demo Flag und fügt
-- realistische Demo-Daten für die Kapazitätsbörse hinzu.

BEGIN;

-- 1) is_demo Spalte
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Bestehende Demo-User flaggen
UPDATE users SET is_demo = TRUE
WHERE email IN (
  'demo-free@tempconnect.de',
  'demo-basis@tempconnect.de',
  'demo-plus@tempconnect.de',
  'demo-pro@tempconnect.de',
  'demo-enterprise@tempconnect.de'
);
-- Demo-Worker ebenfalls flaggen
UPDATE users SET is_demo = TRUE WHERE email LIKE '%@demo.tempconnect.de';

-- 3-6) Demo-Seed-Welt — entkoppelt vom Schema-Teil oben.
-- HINWEIS (2026-06-04): Die vier Seed-INSERTs referenzieren die hartkodierten
-- Demo-User-IDs a0000000-...-001..005, die NUR via sql/seeds/dev-data.sql
-- (dev/Docker) existieren. Auf einer frischen Prod-DB ohne diese User brach der
-- org_memberships-INSERT mit FK-Verletzung (org_memberships_user_id_fkey) die
-- GESAMTE Transaktion ab — und riss damit auch die is_demo-Spalte (Schritt 1) in
-- den Rollback. Folge: Kaskadenfehler in 040/041/052/074/081
-- (column is_demo does not exist). Guard -> Seeds laufen nur, wenn die Demo-User
-- vorhanden sind; sonst sauberer No-Op. is_demo (Schritt 1, ausserhalb des Guards)
-- wird IMMER angelegt. Die Tabellen selbst existieren (frühere Migrationen) — daher
-- direkte Statements + früher RETURN statt EXECUTE (kein Schema-Defekt, nur FK-Daten).
DO $demo$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'a0000000-0000-0000-0000-000000000001'::uuid) THEN
    RAISE NOTICE '039: Demo-User a0000000-...-001 nicht vorhanden — Demo-Welt uebersprungen (kein dev-data.sql). users.is_demo wurde dennoch angelegt.';
    RETURN;
  END IF;

-- 3) Demo-Organisationen (eine pro Rolle)
INSERT INTO organizations (id, name, slug, type, plan, billing_email, is_active)
VALUES
  ('dd000000-0000-0000-0000-000000000001',
   'Demo Unternehmen GmbH', 'demo-unternehmen', 'company', 'ENTERPRISE',
   'demo-company@tempconnect.de', true),
  ('dd000000-0000-0000-0000-000000000002',
   'Demo Personaldienstleister GmbH', 'demo-personal', 'agency', 'ENTERPRISE',
   'demo-agency@tempconnect.de', true)
ON CONFLICT (id) DO NOTHING;

-- 4) Org-Memberships für Demo-User
INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
VALUES
  -- Company-Demo-User → Company-Org
  ('a0000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'owner', true),
  ('a0000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000001', 'member', true),
  ('a0000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000001', 'admin', true),
  -- Agency-Demo-User → Agency-Org
  ('a0000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000002', 'owner', true),
  ('a0000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000002', 'admin', true)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- 5) Demo Capacity Posts (Angebote von Agency-Demo-Usern)
INSERT INTO capacity_posts (
  id, supplier_company_id, created_by, org_id, title, role,
  worker_category, headcount, skill_tags, location_city, location_postal,
  radius_km, availability_type, availability_from, availability_to,
  shift_model, employment_type, status, compliance_status
) VALUES
  -- Angebote von demo-basis (agency)
  ('cc000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'dd000000-0000-0000-0000-000000000002',
   'Lagerhelfer Hamburg — sofort verfügbar', 'Lagerhelfer',
   'Helfer', 5, ARRAY['Kommissionierung','Staplerschein','Verpackung'],
   'Hamburg', '20095', 25, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days',
   'day', 'temporary', 'active', 'complete'),
  ('cc000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'dd000000-0000-0000-0000-000000000002',
   'CNC-Fachkräfte Norddeutschland', 'CNC-Bediener',
   'Fachkraft', 3, ARRAY['CNC-Drehen','CNC-Fräsen','Qualitätskontrolle'],
   'Bremen', '28195', 50, 'scheduled', CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '180 days',
   'rotating', 'temporary', 'active', 'complete'),
  -- Angebote von demo-pro (agency)
  ('cc000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   'dd000000-0000-0000-0000-000000000002',
   'Elektrofachkräfte — Notdienst 24/7', 'Elektriker',
   'Fachkraft', 8, ARRAY['Elektroinstallation','SPS','Schaltschrankbau'],
   'München', '80331', 40, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days',
   'flexible', 'temporary', 'active', 'complete'),
  ('cc000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   'dd000000-0000-0000-0000-000000000002',
   'Schweißer und Schlosser — Industriemontage', 'Schweißer',
   'Spezialist', 4, ARRAY['WIG-Schweißen','MAG-Schweißen','Rohrleitungsbau'],
   'Stuttgart', '70173', 35, 'scheduled', CURRENT_DATE + INTERVAL '14 days', NULL,
   'day', 'contract', 'active', 'partial'),
  ('cc000000-0000-0000-0000-000000000005',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004',
   'dd000000-0000-0000-0000-000000000002',
   'Pflegefachkräfte mit Examen', 'Pflegefachkraft',
   'Fachkraft', 10, ARRAY['Intensivpflege','Beatmung','Wundmanagement'],
   'Berlin', '10115', 30, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '120 days',
   'night', 'temporary', 'active', 'complete'),
  ('cc000000-0000-0000-0000-000000000006',
   'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'dd000000-0000-0000-0000-000000000002',
   'IT-Administratoren — Remote & Vor-Ort', 'IT-Administrator',
   'Fachkraft', 2, ARRAY['Windows Server','Active Directory','Netzwerk','Linux'],
   'Frankfurt', '60311', 60, 'flexible', CURRENT_DATE, NULL,
   'day', 'temp_to_perm', 'active', 'pending')
ON CONFLICT (id) DO NOTHING;

-- 6) Demo Demand Requests (Nachfragen von Company-Demo-Usern)
INSERT INTO demand_requests (
  id, requester_company_id, title, role, skill_tags, headcount,
  start_date, end_date, location_city, location_postal, radius_km,
  urgency, budget_min, budget_max, status
) VALUES
  ('dd100000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'Produktionshelfer für Sonderschicht', 'Produktionshelfer',
   ARRAY['Maschinenbedienung','Qualitätsprüfung'], 8,
   CURRENT_DATE + INTERVAL '3 days', CURRENT_DATE + INTERVAL '60 days',
   'Düsseldorf', '40210', 25, 'normal', 22.50, 28.00, 'open'),
  ('dd100000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000003',
   'Gabelstaplerfahrer Logistikzentrum', 'Staplerfahrer',
   ARRAY['Staplerschein','Lagerverwaltung','SAP WM'], 4,
   CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '90 days',
   'Köln', '50667', 30, 'plus', 24.00, 30.00, 'open'),
  ('dd100000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000005',
   'SAP-Berater S/4HANA Migration — Dringend', 'SAP-Berater',
   ARRAY['S/4HANA','FI/CO','MM','ABAP'], 2,
   CURRENT_DATE, CURRENT_DATE + INTERVAL '180 days',
   'Frankfurt', '60311', 50, 'notdienst', 85.00, 120.00, 'open')
ON CONFLICT (id) DO NOTHING;

END $demo$;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '039_demo_mode.sql: Migration erfolgreich angewendet.';
END $$;
