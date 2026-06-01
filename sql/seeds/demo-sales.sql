-- =============================================================================
-- TempConnect – Sales-Demo-Seed-Daten (NUR DEMO-UMGEBUNG)
-- =============================================================================
-- Zweck: Realistische Demo-Daten fuer Vertriebsgespräche und Produkt-Demos.
-- Ladebefehl: psql $DATABASE_URL < sql/seeds/demo-sales.sql
--
-- ACHTUNG: NIEMALS in Produktionsumgebung ausfuehren!
-- Alle Passwort-Hashes entsprechen "Demo2026!" (bcrypt, Work Factor 10).
--
-- Demo-Accounts:
--   demo-hr@mustermann-gmbh.de  / Demo2026!  (company, PLUS-Plan)
--   demo-dispatch@toptemp.de    / Demo2026!  (agency, PRO-Plan)
--   demo-worker@example.de      / Demo2026!  (worker)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Demo-Nutzer anlegen
-- ---------------------------------------------------------------------------

-- HR-Manager (company, PLUS-Plan) — "Bedarfsseite"
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'company',
  'demo-hr@mustermann-gmbh.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  'Mustermann GmbH',
  '+49 40 123456',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Agenturdisponent (agency, PRO-Plan) — "Angebotsseite"
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'agency',
  'demo-dispatch@toptemp.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  'TopTemp Zeitarbeit GmbH',
  '+49 30 987654',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Zeitarbeitskraft (worker)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'worker',
  'demo-worker@example.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  NULL,
  '+49 170 1234567',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Subscriptions
-- ---------------------------------------------------------------------------

-- PLUS fuer HR-Manager
INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
SELECT u.id, 'PLUS', 'active',
       NOW() - INTERVAL '15 days',
       NOW() + INTERVAL '15 days'
FROM users u
WHERE u.email = 'demo-hr@mustermann-gmbh.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- PRO fuer Agenturdisponent
INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
SELECT u.id, 'PRO', 'active',
       NOW() - INTERVAL '10 days',
       NOW() + INTERVAL '20 days'
FROM users u
WHERE u.email = 'demo-dispatch@toptemp.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- ---------------------------------------------------------------------------
-- 3) Listings (Angebotsseite — TopTemp stellt Kräfte bereit)
-- ---------------------------------------------------------------------------

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Pflege / Betreuung', 'Hamburg', 5,
       CURRENT_DATE + INTERVAL '3 days',
       'Erfahrene Pflegekraefte (Examinierte Krankenpfleger, mind. 3 Jahre Erfahrung). Soforteinsatz möglich.',
       TRUE
FROM users u WHERE u.email = 'demo-dispatch@toptemp.de'
ON CONFLICT DO NOTHING;

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Lager / Kommissionierung', 'Hamburg', 8,
       CURRENT_DATE + INTERVAL '1 day',
       'Lagerarbeiter mit Staplerschein (Schein liegt vor). Frühschicht + Spätschicht möglich.',
       FALSE
FROM users u WHERE u.email = 'demo-dispatch@toptemp.de'
ON CONFLICT DO NOTHING;

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Büro / Verwaltung', 'Berlin', 3,
       CURRENT_DATE + INTERVAL '7 days',
       'Kaufmännische Fachkräfte mit SAP-Kenntnissen. Sofort verfügbar nach Briefing.',
       FALSE
FROM users u WHERE u.email = 'demo-dispatch@toptemp.de'
ON CONFLICT DO NOTHING;

-- Bedarfsseite — Mustermann GmbH sucht Kräfte
INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'demand', 'Lager / Kommissionierung', 'Hamburg', 6,
       CURRENT_DATE + INTERVAL '2 days',
       'Dringend: Saisonspitze in unserem Hamburger Lager. Mindest-Einsatzdauer 2 Wochen.',
       FALSE
FROM users u WHERE u.email = 'demo-hr@mustermann-gmbh.de'
ON CONFLICT DO NOTHING;

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'demand', 'Pflege / Betreuung', 'Hamburg', 2,
       CURRENT_DATE + INTERVAL '1 day',
       'Notfallbedarf Nachtschicht. Exam. Krankenpfleger erforderlich.',
       TRUE
FROM users u WHERE u.email = 'demo-hr@mustermann-gmbh.de'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Demo-Anfragen (Requests: Demand -> Supply)
--    Verbindet Mustermann-Bedarf mit TopTemp-Angebot
-- ---------------------------------------------------------------------------

-- Pending request (STATUS: SENT — zeigt "offene Anfrage" in der Demo)
INSERT INTO requests (listing_id, requester_id, receiver_id, message, priority, status, contact_email)
SELECT
  l_demand.id,
  u_company.id,
  u_agency.id,
  'Guten Tag, wir benötigen dringend 4 Lagerarbeiter mit Staplerschein für nächste Woche. Bitte melden Sie sich kurzfristig.',
  'NORMAL',
  'SENT',
  'demo-hr@mustermann-gmbh.de'
FROM
  listings l_demand
  JOIN users u_company ON u_company.email = 'demo-hr@mustermann-gmbh.de'
  JOIN users u_agency  ON u_agency.email  = 'demo-dispatch@toptemp.de'
  JOIN listings l_supply ON l_supply.owner_id = u_agency.id AND l_supply.category = 'Lager / Kommissionierung'
WHERE l_demand.owner_id = u_company.id AND l_demand.category = 'Lager / Kommissionierung'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Accepted request (STATUS: ACCEPTED — zeigt "laufender Einsatz")
INSERT INTO requests (listing_id, requester_id, receiver_id, message, priority, status, contact_email)
SELECT
  l_demand.id,
  u_company.id,
  u_agency.id,
  'Pflegekräfte für Nachtschicht dringend gesucht. Bitte sofort zurückmelden.',
  'NOTDIENST',
  'ACCEPTED',
  'demo-hr@mustermann-gmbh.de'
FROM
  listings l_demand
  JOIN users u_company ON u_company.email = 'demo-hr@mustermann-gmbh.de'
  JOIN users u_agency  ON u_agency.email  = 'demo-dispatch@toptemp.de'
WHERE l_demand.owner_id = u_company.id AND l_demand.category = 'Pflege / Betreuung'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) Aufräumhinweis
-- ---------------------------------------------------------------------------
-- Demo-Daten loeschen:
--   DELETE FROM users
--   WHERE email IN (
--     'demo-hr@mustermann-gmbh.de',
--     'demo-dispatch@toptemp.de',
--     'demo-worker@example.de'
--   );
-- (CASCADE loescht subscriptions, listings, requests automatisch)

COMMIT;
