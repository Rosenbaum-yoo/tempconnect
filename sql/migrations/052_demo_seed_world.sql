-- =============================================================================
-- 052_demo_seed_world.sql — Vollständige Demo-Welt für TempConnect
-- =============================================================================
-- Erzeugt ein konsistentes NRW-Zeitarbeitsszenario mit realistischen Daten
-- über alle Module hinweg. Idempotent (ON CONFLICT DO NOTHING).
--
-- Szenario:
--   Nordbau Industrie GmbH (Buyer) sucht Fachkräfte.
--   ElektroStaff, StahlPro, RheinWorker (Agenturen) bieten an.
--   BauWest AG (zweiter Buyer) für Vergleichsdaten.
--
-- Demo-Accounts:  Passwort für alle: DemoPass2026!
--   demo-buyer@tempconnect.de    (company / ENTERPRISE / Nordbau)
--   demo-agency@tempconnect.de   (agency  / ENTERPRISE / ElektroStaff)
--   demo-admin@tempconnect.de    (company / ENTERPRISE / Nordbau admin)
--   demo-buyer2@tempconnect.de   (company / PLUS / BauWest)
--   demo-agency2@tempconnect.de  (agency  / PRO  / StahlPro)
--   demo-agency3@tempconnect.de  (agency  / BASIS / RheinWorker)
-- =============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- 1) DEMO-ACCOUNTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO users (id, role, email, password_hash, company_name, phone, contact_person, city, postal_code, street, is_verified, is_demo, onboarding_completed)
VALUES
  ('d0a00000-0000-0000-0000-000000000001', 'company',
   'demo-buyer@tempconnect.de',
   '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO',
   'Nordbau Industrie GmbH', '+49 211 4401200', 'Thomas Brinkmann',
   'Düsseldorf', '40210', 'Industriestr. 42', TRUE, TRUE, TRUE),

  ('d0a00000-0000-0000-0000-000000000002', 'agency',
   'demo-agency@tempconnect.de',
   '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO',
   'ElektroStaff GmbH', '+49 221 9987650', 'Sandra Köhler',
   'Köln', '50667', 'Rheinuferstr. 18', TRUE, TRUE, TRUE),

  ('d0a00000-0000-0000-0000-000000000003', 'company',
   'demo-admin@tempconnect.de',
   '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO',
   'Nordbau Industrie GmbH', '+49 211 4401201', 'Julia Hartmann',
   'Düsseldorf', '40210', 'Industriestr. 42', TRUE, TRUE, TRUE),

  ('d0a00000-0000-0000-0000-000000000004', 'company',
   'demo-buyer2@tempconnect.de',
   '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO',
   'BauWest AG', '+49 201 7785430', 'Markus Feldmann',
   'Essen', '45127', 'Bauweg 7', TRUE, TRUE, TRUE),

  ('d0a00000-0000-0000-0000-000000000005', 'agency',
   'demo-agency2@tempconnect.de',
   '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO',
   'StahlPro Personal', '+49 231 5543210', 'Michael Stahl',
   'Dortmund', '44135', 'Stahlwerkstr. 3', TRUE, TRUE, TRUE),

  ('d0a00000-0000-0000-0000-000000000006', 'agency',
   'demo-agency3@tempconnect.de',
   '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO',
   'RheinWorker Solutions', '+49 203 8876540', 'Anna Rheinfeld',
   'Duisburg', '47051', 'Hafenstr. 22', TRUE, TRUE, TRUE)
ON CONFLICT (email) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 2) ORGANISATIONEN
-- ═══════════════════════════════════════════════════════════════

INSERT INTO organizations (id, name, slug, type, plan, billing_email, is_active, legal_name)
VALUES
  ('d0b00000-0000-0000-0000-000000000001',
   'Nordbau Industrie GmbH', 'nordbau-industrie', 'company', 'ENTERPRISE',
   'einkauf@nordbau-industrie.de', TRUE, 'Nordbau Industrie GmbH'),

  ('d0b00000-0000-0000-0000-000000000002',
   'ElektroStaff GmbH', 'elektrostaff', 'agency', 'ENTERPRISE',
   'verwaltung@elektrostaff.de', TRUE, 'ElektroStaff GmbH'),

  ('d0b00000-0000-0000-0000-000000000003',
   'StahlPro Personal', 'stahlpro-personal', 'agency', 'PRO',
   'office@stahlpro-personal.de', TRUE, 'StahlPro Personal GmbH & Co. KG'),

  ('d0b00000-0000-0000-0000-000000000004',
   'RheinWorker Solutions', 'rheinworker', 'agency', 'BASIS',
   'info@rheinworker.de', TRUE, 'RheinWorker Solutions UG'),

  ('d0b00000-0000-0000-0000-000000000005',
   'BauWest AG', 'bauwest', 'company', 'PLUS',
   'beschaffung@bauwest.de', TRUE, 'BauWest AG')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3) ORG-MEMBERSHIPS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO org_memberships (user_id, org_id, role_key, is_active)
VALUES
  ('d0a00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000001', 'owner', TRUE),
  ('d0a00000-0000-0000-0000-000000000003', 'd0b00000-0000-0000-0000-000000000001', 'admin', TRUE),
  ('d0a00000-0000-0000-0000-000000000002', 'd0b00000-0000-0000-0000-000000000002', 'owner', TRUE),
  ('d0a00000-0000-0000-0000-000000000005', 'd0b00000-0000-0000-0000-000000000003', 'owner', TRUE),
  ('d0a00000-0000-0000-0000-000000000006', 'd0b00000-0000-0000-0000-000000000004', 'owner', TRUE),
  ('d0a00000-0000-0000-0000-000000000004', 'd0b00000-0000-0000-0000-000000000005', 'owner', TRUE)
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4) SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'ENTERPRISE', 'active' FROM users WHERE email = 'demo-buyer@tempconnect.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'demo-buyer@tempconnect.de'));
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'ENTERPRISE', 'active' FROM users WHERE email = 'demo-agency@tempconnect.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'demo-agency@tempconnect.de'));
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'ENTERPRISE', 'active' FROM users WHERE email = 'demo-admin@tempconnect.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'demo-admin@tempconnect.de'));
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'PLUS', 'active' FROM users WHERE email = 'demo-buyer2@tempconnect.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'demo-buyer2@tempconnect.de'));
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'PRO', 'active' FROM users WHERE email = 'demo-agency2@tempconnect.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'demo-agency2@tempconnect.de'));
INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'BASIS', 'active' FROM users WHERE email = 'demo-agency3@tempconnect.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'demo-agency3@tempconnect.de'));

-- ═══════════════════════════════════════════════════════════════
-- 5) LEGACY LISTINGS (für Marktplatz in index.html)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO listings (id, owner_id, type, category, region, qty, start_date, note, notdienst, is_active)
VALUES
  ('d0c00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000002', 'supply', 'Elektrotechnik', 'Köln', 5,
   CURRENT_DATE + INTERVAL '3 days', 'Elektrofachkräfte mit VDE-Zertifizierung, sofort einsatzbereit für Industrieprojekte', FALSE, TRUE),
  ('d0c00000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000005', 'supply', 'Metallbau / Schweißen', 'Dortmund', 3,
   CURRENT_DATE + INTERVAL '7 days', 'WIG/MAG-Schweißer mit Erfahrung im Rohrleitungsbau und Stahlkonstruktionen', FALSE, TRUE),
  ('d0c00000-0000-0000-0000-000000000003',
   'd0a00000-0000-0000-0000-000000000006', 'supply', 'Lager / Kommissionierung', 'Duisburg', 8,
   CURRENT_DATE + INTERVAL '1 day', 'Erfahrene Lagerlogistiker mit Staplerschein und SAP-Kenntnissen', FALSE, TRUE),
  ('d0c00000-0000-0000-0000-000000000004',
   'd0a00000-0000-0000-0000-000000000001', 'demand', 'Elektrotechnik', 'Düsseldorf', 4,
   CURRENT_DATE + INTERVAL '5 days', 'Dringend: Elektriker für Industrieanlage gesucht, Schichtbereitschaft erforderlich', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 6) CAPACITY POSTS (Kapazitätsbörse)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO capacity_posts (
  id, supplier_company_id, created_by, org_id, title, role,
  worker_category, headcount, skill_tags, location_city, location_postal,
  radius_km, availability_type, availability_from, availability_to,
  shift_model, employment_type, status, compliance_status
) VALUES
  ('d0d00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000002',
   'Elektrofachkräfte NRW — Industriemontage', 'Elektriker',
   'Fachkraft', 6, ARRAY['Elektroinstallation','SPS-Programmierung','Schaltschrankbau','VDE-Prüfung'],
   'Köln', '50667', 40, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '180 days',
   'day', 'temporary', 'active', 'complete'),

  ('d0d00000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000002',
   'IT-Systemadministratoren — Remote & Vor-Ort', 'IT-Administrator',
   'Fachkraft', 2, ARRAY['Windows Server','Active Directory','Linux','Netzwerk','Virtualisierung'],
   'Köln', '50667', 60, 'flexible', CURRENT_DATE, NULL,
   'day', 'temp_to_perm', 'active', 'complete'),

  ('d0d00000-0000-0000-0000-000000000003',
   'd0a00000-0000-0000-0000-000000000005', 'd0a00000-0000-0000-0000-000000000005',
   'd0b00000-0000-0000-0000-000000000003',
   'WIG/MAG-Schweißer — Stahlbau & Rohrleitungen', 'Schweißer',
   'Spezialist', 4, ARRAY['WIG-Schweißen','MAG-Schweißen','Rohrleitungsbau','Schweißerprüfung EN ISO 9606'],
   'Dortmund', '44135', 35, 'scheduled', CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '365 days',
   'rotating', 'temporary', 'active', 'complete'),

  ('d0d00000-0000-0000-0000-000000000004',
   'd0a00000-0000-0000-0000-000000000005', 'd0a00000-0000-0000-0000-000000000005',
   'd0b00000-0000-0000-0000-000000000003',
   'CNC-Bediener mit Programmierkenntnissen', 'CNC-Bediener',
   'Fachkraft', 3, ARRAY['CNC-Drehen','CNC-Fräsen','Heidenhain','Siemens-Steuerung'],
   'Dortmund', '44135', 50, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '120 days',
   'day', 'temporary', 'active', 'partial'),

  ('d0d00000-0000-0000-0000-000000000005',
   'd0a00000-0000-0000-0000-000000000006', 'd0a00000-0000-0000-0000-000000000006',
   'd0b00000-0000-0000-0000-000000000004',
   'Lagerlogistiker mit Staplerschein', 'Lagerarbeiter',
   'Helfer', 10, ARRAY['Staplerschein','Kommissionierung','SAP WM','Inventur'],
   'Duisburg', '47051', 30, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days',
   'day', 'temporary', 'active', 'complete'),

  ('d0d00000-0000-0000-0000-000000000006',
   'd0a00000-0000-0000-0000-000000000006', 'd0a00000-0000-0000-0000-000000000006',
   'd0b00000-0000-0000-0000-000000000004',
   'Bauhelfer & Hilfsarbeiter — Großbaustelle', 'Bauhelfer',
   'Helfer', 15, ARRAY['Betonarbeiten','Abbruch','Aufräumarbeiten','Baustellensicherung'],
   'Essen', '45127', 25, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '60 days',
   'day', 'temporary', 'active', 'complete'),

  ('d0d00000-0000-0000-0000-000000000007',
   'd0a00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000002',
   'Pflegefachkräfte — Intensivstation', 'Pflegefachkraft',
   'Fachkraft', 8, ARRAY['Intensivpflege','Beatmung','Wundmanagement','Examen'],
   'Düsseldorf', '40210', 30, 'immediate', CURRENT_DATE, CURRENT_DATE + INTERVAL '150 days',
   'night', 'temporary', 'active', 'complete'),

  ('d0d00000-0000-0000-0000-000000000008',
   'd0a00000-0000-0000-0000-000000000005', 'd0a00000-0000-0000-0000-000000000005',
   'd0b00000-0000-0000-0000-000000000003',
   'Industriemechaniker — Instandhaltung', 'Industriemechaniker',
   'Fachkraft', 3, ARRAY['Hydraulik','Pneumatik','Instandhaltung','SPS-Grundkenntnisse'],
   'Dortmund', '44135', 40, 'scheduled', CURRENT_DATE + INTERVAL '14 days', NULL,
   'rotating', 'contract', 'active', 'pending')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 7) DEMAND REQUESTS (Nachfragen von Buyer-Seite)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO demand_requests (
  id, requester_company_id, title, role, skill_tags, headcount,
  start_date, end_date, location_city, location_postal, radius_km,
  urgency, budget_min, budget_max, status
) VALUES
  ('d0e00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001',
   'Elektrofachkräfte für Anlagenmontage — Düsseldorf', 'Elektriker',
   ARRAY['Elektroinstallation','SPS','Schaltschrankbau'], 5,
   CURRENT_DATE + INTERVAL '5 days', CURRENT_DATE + INTERVAL '90 days',
   'Düsseldorf', '40210', 30, 'plus', 32.00, 38.00, 'open'),

  ('d0e00000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000001',
   'Schweißer für Rohrleitungsprojekt — Köln', 'Schweißer',
   ARRAY['WIG-Schweißen','MAG-Schweißen','EN ISO 9606'], 3,
   CURRENT_DATE + INTERVAL '10 days', CURRENT_DATE + INTERVAL '180 days',
   'Köln', '50667', 25, 'normal', 36.00, 42.00, 'open'),

  ('d0e00000-0000-0000-0000-000000000003',
   'd0a00000-0000-0000-0000-000000000001',
   'Lagerarbeiter Logistikzentrum — Dortmund', 'Lagerarbeiter',
   ARRAY['Staplerschein','Kommissionierung','SAP WM'], 8,
   CURRENT_DATE + INTERVAL '3 days', CURRENT_DATE + INTERVAL '60 days',
   'Dortmund', '44135', 20, 'plus', 18.00, 24.00, 'open'),

  ('d0e00000-0000-0000-0000-000000000004',
   'd0a00000-0000-0000-0000-000000000004',
   'Bauhelfer für Großprojekt A44 — Essen', 'Bauhelfer',
   ARRAY['Betonarbeiten','Schalungsbau','Baustellensicherheit'], 12,
   CURRENT_DATE + INTERVAL '7 days', CURRENT_DATE + INTERVAL '120 days',
   'Essen', '45127', 35, 'normal', 16.00, 22.00, 'open'),

  ('d0e00000-0000-0000-0000-000000000005',
   'd0a00000-0000-0000-0000-000000000004',
   'CNC-Fachkräfte für Serienfertigung — Bochum', 'CNC-Bediener',
   ARRAY['CNC-Drehen','CNC-Fräsen','Qualitätskontrolle'], 2,
   CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '90 days',
   'Bochum', '44787', 30, 'notdienst', 28.00, 35.00, 'open')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 8) CONTRACTS (Rahmenverträge)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO contracts (id, buyer_org_id, supplier_org_id, contract_type, title, description, status, valid_from, valid_until, terms_summary, created_by)
VALUES
  ('d0f00000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000002',
   'msa', 'Rahmenvertrag Nordbau ↔ ElektroStaff 2026',
   'Master Service Agreement für die Überlassung von Elektrofachkräften im Raum NRW. Umfasst Industriemontage, Anlagenbau und Instandhaltung.',
   'active', '2026-01-01', '2026-12-31',
   'Stundensatz 32–38 €/h · AÜG-konform · Mindestlaufzeit 3 Monate · 14 Tage Kündigungsfrist',
   'd0a00000-0000-0000-0000-000000000001'),

  ('d0f00000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000003',
   'framework', 'Rahmenvereinbarung Metallbau — StahlPro',
   'Liefervereinbarung für Schweißer und Schlosser, Schwerpunkt Rohrleitungsbau.',
   'draft', '2026-04-01', '2027-03-31',
   'Stundensatz 36–42 €/h · Qualifikationsnachweis EN ISO 9606 erforderlich',
   'd0a00000-0000-0000-0000-000000000001'),

  ('d0f00000-0000-0000-0000-000000000003',
   'd0b00000-0000-0000-0000-000000000005', 'd0b00000-0000-0000-0000-000000000004',
   'framework', 'Logistik-Rahmenvertrag BauWest ↔ RheinWorker 2025',
   'Abgelaufener Rahmenvertrag aus dem Vorjahr, dient als Referenz.',
   'expired', '2025-01-01', '2025-12-31',
   'Stundensatz 18–24 €/h · Staplerschein Pflicht',
   'd0a00000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 9) ASSIGNMENTS (Einsätze)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO assignments (id, org_id, supplier_org_id, contract_id, worker_description, worker_count, start_date, planned_end_date, actual_end_date, hourly_rate_cents, status, notes, created_by)
VALUES
  ('d0100000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000002',
   'd0f00000-0000-0000-0000-000000000001',
   'Elektrofachkräfte — Anlagenmontage Werk Düsseldorf', 3,
   CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '60 days', NULL,
   3500, 'active', 'Laufender Einsatz, bisher keine Beanstandungen', 'd0a00000-0000-0000-0000-000000000001'),

  ('d0100000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000002',
   'd0f00000-0000-0000-0000-000000000001',
   'SPS-Programmierer — Steuerungsmodernisierung', 1,
   CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE + INTERVAL '45 days', NULL,
   3800, 'active', 'Spezialprojekt Steuerungstechnik', 'd0a00000-0000-0000-0000-000000000001'),

  ('d0100000-0000-0000-0000-000000000003',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000003',
   NULL,
   'Schweißer — Rohrleitungsmontage Köln', 2,
   CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '5 days',
   4000, 'completed', 'Erfolgreich abgeschlossen, Bewertung ausstehend', 'd0a00000-0000-0000-0000-000000000001'),

  ('d0100000-0000-0000-0000-000000000004',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000004',
   NULL,
   'Lagerhelfer — Sondereinsatz Inventur', 5,
   CURRENT_DATE + INTERVAL '14 days', CURRENT_DATE + INTERVAL '28 days', NULL,
   2200, 'planned', 'Geplant für Jahresinventur', 'd0a00000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 10) RATE CARDS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO rate_cards (id, org_id, supplier_org_id, role_category, region, min_rate_cents, target_rate_cents, max_rate_cents, valid_from, valid_to, status, notes, created_by)
VALUES
  ('d0200000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', NULL,
   'Elektriker', 'NRW', 3000, 3400, 3800,
   '2026-01-01', '2026-12-31', 'active',
   'Standard-Rate für Elektrofachkräfte in NRW, gültig für alle Agenturen',
   'd0a00000-0000-0000-0000-000000000001'),

  ('d0200000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000003',
   'Schweißer', 'NRW', 3400, 3800, 4200,
   '2026-01-01', '2026-12-31', 'active',
   'Premium-Rate für zertifizierte Schweißer (EN ISO 9606), nur StahlPro',
   'd0a00000-0000-0000-0000-000000000001'),

  ('d0200000-0000-0000-0000-000000000003',
   'd0b00000-0000-0000-0000-000000000001', NULL,
   'Lagerarbeiter', 'NRW', 1800, 2100, 2400,
   '2026-01-01', '2026-12-31', 'active',
   'Helfer-Rate, Staplerschein ist Voraussetzung',
   'd0a00000-0000-0000-0000-000000000001'),

  ('d0200000-0000-0000-0000-000000000004',
   'd0b00000-0000-0000-0000-000000000001', NULL,
   'Pflegefachkraft', 'NRW', 2800, 3200, 3500,
   '2026-01-01', '2026-12-31', 'active',
   'Rate für examinierte Pflegefachkräfte, Nachtzuschlag separat',
   'd0a00000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 11) COMPLIANCE DOCUMENTS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO compliance_documents (id, org_id, uploaded_by, doc_type, doc_name, status, valid_from, valid_until, notes)
VALUES
  ('d0300000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000002',
   'aueg_erlaubnis', 'AÜG-Erlaubnis ElektroStaff 2026',
   'verified', '2026-01-01', '2026-12-31',
   'Arbeitnehmerüberlassungserlaubnis, ausgestellt von der Agentur für Arbeit Köln'),

  ('d0300000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000002',
   'versicherung', 'Betriebshaftpflicht ElektroStaff',
   'verified', '2026-01-01', '2027-01-01',
   'Betriebshaftpflichtversicherung, Deckungssumme 5 Mio. EUR'),

  ('d0300000-0000-0000-0000-000000000003',
   'd0b00000-0000-0000-0000-000000000003', 'd0a00000-0000-0000-0000-000000000005',
   'arbeitssicherheit', 'Arbeitssicherheitsnachweis StahlPro',
   'verified', '2025-06-01', CURRENT_DATE + INTERVAL '20 days',
   'Läuft bald ab — Erneuerung erforderlich'),

  ('d0300000-0000-0000-0000-000000000004',
   'd0b00000-0000-0000-0000-000000000003', 'd0a00000-0000-0000-0000-000000000005',
   'zertifikat', 'ISO 9001:2015 Zertifizierung',
   'pending', '2026-02-01', '2029-01-31',
   'Qualitätsmanagement-Zertifikat, Prüfung ausstehend'),

  ('d0300000-0000-0000-0000-000000000005',
   'd0b00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000002',
   'datenschutz', 'Datenschutzkonzept ElektroStaff (AVV)',
   'verified', '2026-01-15', '2027-01-15',
   'Auftragsverarbeitungsvereinbarung gemäß Art. 28 DSGVO')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 12) NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════

INSERT INTO notifications (id, user_id, org_id, type, title, message, severity, is_read, created_at)
VALUES
  ('d0400000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000001',
   'offer_received', 'Neues Angebot: Elektrofachkräfte',
   'ElektroStaff GmbH hat ein Angebot für Ihre Anfrage "Elektrofachkräfte für Anlagenmontage" eingereicht.',
   'info', FALSE, NOW() - INTERVAL '2 hours'),

  ('d0400000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000001',
   'compliance_expiring', 'Nachweis läuft ab: StahlPro Personal',
   'Der Arbeitssicherheitsnachweis von StahlPro Personal läuft in 20 Tagen ab. Bitte Erneuerung anfordern.',
   'warning', FALSE, NOW() - INTERVAL '1 day'),

  ('d0400000-0000-0000-0000-000000000003',
   'd0a00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000001',
   'general', 'Willkommen in der Demo!',
   'Dies ist Ihr Demo-Konto. Erkunden Sie alle Bereiche der Plattform mit realistischen Testdaten.',
   'success', FALSE, NOW() - INTERVAL '30 minutes'),

  ('d0400000-0000-0000-0000-000000000004',
   'd0a00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000001',
   'offer_accepted', 'Angebot angenommen: Schweißer Köln',
   'StahlPro Personal hat Ihr Angebot für den Schweißer-Einsatz in Köln angenommen.',
   'success', TRUE, NOW() - INTERVAL '3 days'),

  ('d0400000-0000-0000-0000-000000000005',
   'd0a00000-0000-0000-0000-000000000002', 'd0b00000-0000-0000-0000-000000000002',
   'offer_received', 'Neue Anfrage: Nordbau Industrie',
   'Nordbau Industrie GmbH sucht 5 Elektrofachkräfte für die Anlagenmontage in Düsseldorf.',
   'info', FALSE, NOW() - INTERVAL '4 hours'),

  ('d0400000-0000-0000-0000-000000000006',
   'd0a00000-0000-0000-0000-000000000002', 'd0b00000-0000-0000-0000-000000000002',
   'compliance_expiring', 'AÜG-Erlaubnis: Verlängerung planen',
   'Ihre AÜG-Erlaubnis ist bis 31.12.2026 gültig. Planen Sie die Verlängerung rechtzeitig.',
   'info', TRUE, NOW() - INTERVAL '7 days'),

  ('d0400000-0000-0000-0000-000000000007',
   'd0a00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000001',
   'sla_warning', 'SLA-Warnung: Reaktionszeit überschritten',
   'Die Anfrage "Lagerarbeiter Logistikzentrum" hat die SLA-Reaktionszeit von 48h überschritten.',
   'warning', FALSE, NOW() - INTERVAL '6 hours'),

  ('d0400000-0000-0000-0000-000000000008',
   'd0a00000-0000-0000-0000-000000000003', 'd0b00000-0000-0000-0000-000000000001',
   'general', 'Admin-Hinweis: 3 offene Genehmigungen',
   'Es liegen 3 offene Genehmigungsanfragen vor, die Ihre Prüfung erfordern.',
   'info', FALSE, NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 13) TIMESHEETS (ergänzend zu bestehenden demo-timesheets.sql)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO timesheets (id, org_id, supplier_org_id, worker_name, worker_identifier, week_start, week_end, status, submitted_at, submitted_by, approved_at, approved_by, notes)
VALUES
  ('d0500000-0000-0000-0000-000000000001',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000002',
   'Klaus Bergmann', 'EK-2001',
   CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '10 days',
   'approved',
   NOW() - INTERVAL '9 days', 'd0a00000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '7 days', 'd0a00000-0000-0000-0000-000000000001',
   'Reguläre Arbeitswoche, Anlagenmontage Halle 3'),

  ('d0500000-0000-0000-0000-000000000002',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000002',
   'Klaus Bergmann', 'EK-2001',
   CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '3 days',
   'submitted',
   NOW() - INTERVAL '2 days', 'd0a00000-0000-0000-0000-000000000002',
   NULL, NULL,
   'Aktuelle Woche, Überstunden am Mittwoch wegen Maschinenstillstand'),

  ('d0500000-0000-0000-0000-000000000003',
   'd0b00000-0000-0000-0000-000000000001', 'd0b00000-0000-0000-0000-000000000003',
   'Jürgen Wolff', 'SP-3001',
   CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '10 days',
   'approved',
   NOW() - INTERVAL '8 days', 'd0a00000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '6 days', 'd0a00000-0000-0000-0000-000000000001',
   'Schweißarbeiten Rohrleitungsprojekt, Abnahme erfolgt')
ON CONFLICT (id) DO NOTHING;

-- Timesheet Entries
INSERT INTO timesheet_entries (timesheet_id, work_date, hours_regular, hours_overtime, break_minutes, shift_start, shift_end)
VALUES
  ('d0500000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '14 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '13 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '12 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '11 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000001', CURRENT_DATE - INTERVAL '10 days', 8, 0, 30, '07:00', '15:30'),

  ('d0500000-0000-0000-0000-000000000002', CURRENT_DATE - INTERVAL '7 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000002', CURRENT_DATE - INTERVAL '6 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000002', CURRENT_DATE - INTERVAL '5 days', 8, 2, 30, '06:00', '16:30'),
  ('d0500000-0000-0000-0000-000000000002', CURRENT_DATE - INTERVAL '4 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000002', CURRENT_DATE - INTERVAL '3 days', 8, 0, 30, '07:00', '15:30'),

  ('d0500000-0000-0000-0000-000000000003', CURRENT_DATE - INTERVAL '14 days', 8, 1, 30, '06:30', '16:00'),
  ('d0500000-0000-0000-0000-000000000003', CURRENT_DATE - INTERVAL '13 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000003', CURRENT_DATE - INTERVAL '12 days', 8, 0, 30, '07:00', '15:30'),
  ('d0500000-0000-0000-0000-000000000003', CURRENT_DATE - INTERVAL '11 days', 8, 2, 30, '06:00', '16:30'),
  ('d0500000-0000-0000-0000-000000000003', CURRENT_DATE - INTERVAL '10 days', 8, 0, 30, '07:00', '15:30')
ON CONFLICT DO NOTHING;

-- Totals aktualisieren
UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'd0500000-0000-0000-0000-000000000001'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'd0500000-0000-0000-0000-000000000001')
WHERE id = 'd0500000-0000-0000-0000-000000000001';

UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'd0500000-0000-0000-0000-000000000002'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'd0500000-0000-0000-0000-000000000002')
WHERE id = 'd0500000-0000-0000-0000-000000000002';

UPDATE timesheets SET
  total_hours    = (SELECT COALESCE(SUM(hours_regular + hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'd0500000-0000-0000-0000-000000000003'),
  overtime_hours = (SELECT COALESCE(SUM(hours_overtime), 0) FROM timesheet_entries WHERE timesheet_id = 'd0500000-0000-0000-0000-000000000003')
WHERE id = 'd0500000-0000-0000-0000-000000000003';

-- ═══════════════════════════════════════════════════════════════
-- 14) REQUESTS (Legacy-Anfragen für index.html)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO requests (id, listing_id, requester_id, receiver_id, message, priority, status, contact_email, contact_phone, created_at)
VALUES
  ('d0700000-0000-0000-0000-000000000001',
   'd0c00000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001', 'd0a00000-0000-0000-0000-000000000002',
   'Wir suchen 4 Elektrofachkräfte für unsere Anlagenmontage in Düsseldorf ab nächster Woche. Schichtbereitschaft ist erforderlich.',
   'NORMAL', 'ACCEPTED',
   'einkauf@nordbau-industrie.de', '+49 211 4401200',
   NOW() - INTERVAL '14 days'),

  ('d0700000-0000-0000-0000-000000000002',
   'd0c00000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000001', 'd0a00000-0000-0000-0000-000000000005',
   'Anfrage für 3 WIG/MAG-Schweißer für unser Rohrleitungsprojekt in Köln. EN ISO 9606 Zertifizierung erforderlich.',
   'NORMAL', 'FINALIZED',
   'einkauf@nordbau-industrie.de', '+49 211 4401200',
   NOW() - INTERVAL '30 days'),

  ('d0700000-0000-0000-0000-000000000003',
   'd0c00000-0000-0000-0000-000000000003',
   'd0a00000-0000-0000-0000-000000000004', 'd0a00000-0000-0000-0000-000000000006',
   'Dringend 8 Lagerhelfer mit Staplerschein für unser Logistikzentrum in Essen benötigt.',
   'NORMAL', 'SENT',
   'beschaffung@bauwest.de', '+49 201 7785430',
   NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 15) RATINGS (Bewertungen, mit request_id FK)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO ratings (id, request_id, rater_id, rated_id, stars, reliability, communication, quality, comment, created_at)
VALUES
  ('d0600000-0000-0000-0000-000000000001',
   'd0700000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000001', 'd0a00000-0000-0000-0000-000000000002',
   5, 5, 5, 4,
   'Hervorragende Zusammenarbeit. Elektrofachkräfte waren pünktlich, qualifiziert und sehr professionell. Gerne wieder!',
   NOW() - INTERVAL '10 days'),

  ('d0600000-0000-0000-0000-000000000002',
   'd0700000-0000-0000-0000-000000000001',
   'd0a00000-0000-0000-0000-000000000002', 'd0a00000-0000-0000-0000-000000000001',
   4, 4, 5, 4,
   'Angenehmer Auftraggeber, klare Anforderungen, schnelle Entscheidungen. Einziger Punkt: Baustellenzugang war anfangs nicht vorbereitet.',
   NOW() - INTERVAL '9 days'),

  ('d0600000-0000-0000-0000-000000000003',
   'd0700000-0000-0000-0000-000000000002',
   'd0a00000-0000-0000-0000-000000000001', 'd0a00000-0000-0000-0000-000000000005',
   4, 3, 4, 5,
   'Sehr gute Schweißqualität. Kommunikation hätte etwas schneller sein können, aber die Arbeit war einwandfrei.',
   NOW() - INTERVAL '5 days'),

  ('d0600000-0000-0000-0000-000000000004',
   'd0700000-0000-0000-0000-000000000003',
   'd0a00000-0000-0000-0000-000000000004', 'd0a00000-0000-0000-0000-000000000006',
   3, 3, 4, 3,
   'Solide Leistung, Lagerhelfer waren zuverlässig. Qualifikationsniveau könnte bei einzelnen Kräften höher sein.',
   NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO NOTHING;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '052_demo_seed_world.sql: Demo-Welt erfolgreich erzeugt (6 Accounts, 5 Orgs, volles Szenario).';
END $$;
