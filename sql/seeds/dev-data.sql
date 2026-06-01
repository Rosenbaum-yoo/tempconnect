-- =============================================================================
-- TempConnect – Entwicklungs-Seed-Daten (NUR LOKALE ENTWICKLUNG)
-- =============================================================================
-- Diese Datei wird AUSSCHLIESSLICH via docker-compose.override.yml geladen
-- (Automatisch bei lokaler Entwicklung: docker compose up).
-- In Produktion (docker compose -f docker-compose.prod.yml up) wird diese
-- Datei NICHT gemountet und NICHT ausgefuehrt.
--
-- Passwort beider Demo-Accounts: password123
-- =============================================================================

-- Demo-Unternehmen (company, PLUS-Plan)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'company',
  'demo@firma.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  'Demo GmbH',
  '+49 40 000000',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO subscriptions (user_id, plan, status)
SELECT u.id, 'PLUS', 'active'
FROM users u
WHERE u.email = 'demo@firma.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- Test-Zeitarbeitsfirma (agency, PLUS-Plan)
INSERT INTO users (role, email, password_hash, company_name, phone, is_verified)
VALUES (
  'agency',
  'test@agentur.de',
  '$2b$10$UeHLVjBbRRQeGx03tWS73O6X4MZ4pWk0zBP4PtPrdHk2Jc.OTsKpK',
  'Test Zeitarbeit GmbH',
  '+49 30 123456',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO subscriptions (user_id, plan, status)
SELECT u.id, 'PLUS', 'active'
FROM users u
WHERE u.email = 'test@agentur.de'
  AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id);

-- Demo-Listings fuer Test-Agentur
INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Pflege / Betreuung', 'Hamburg', 3, CURRENT_DATE + INTERVAL '2 days', 'Erfahrene Pflegekraefte sofort verfuegbar', TRUE
FROM users u
WHERE u.email = 'test@agentur.de'
  AND NOT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.owner_id = u.id AND l.category = 'Pflege / Betreuung' AND l.region = 'Hamburg'
  );

INSERT INTO listings (owner_id, type, category, region, qty, start_date, note, notdienst)
SELECT u.id, 'supply', 'Lager / Kommissionierung', 'Berlin', 5, CURRENT_DATE + INTERVAL '1 day', 'Lagerarbeiter mit Staplerschein', FALSE
FROM users u
WHERE u.email = 'test@agentur.de'
  AND NOT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.owner_id = u.id AND l.category = 'Lager / Kommissionierung' AND l.region = 'Berlin'
  );

-- OCC Owner Control Center (NUR DEV, NIE automatisch in Production):
-- INSERT INTO occ_owner_access (user_id, occ_role, notes)
-- VALUES ('<deine-dev-user-id>', 'owner', 'dev seed - nur lokal');
