-- =============================================================================
-- 192_ansprechperson_auf_beiden_seiten.sql — wer ruft wen an (Plan I, 10b)
-- =============================================================================
-- BEFUND, der diese Migration ausgeloest hat — und er ist ein Fehler in der
-- eigenen Arbeit von heute:
--
--   Am 2026-08-23 wurde die Ansprechperson in der Live-Belegschaft angezeigt,
--   gelesen aus `offers.contact_name`. Beim Nachpruefen der RICHTUNG fiel auf:
--   `offers.contact_name` ist die Ansprechperson des ANBIETERS — und die
--   Live-Belegschaft ist die Flaeche des Anbieters. Die Agentur bekam ihre
--   EIGENE Kontaktperson angezeigt.
--
--   Belegt an der laufenden Datenbank:
--     assignments.supplier_org_id = die Agentur (deren Tafel das ist)
--     offers.supplier_company_id  = ein Mitglied ebendieser Agentur
--
--   Owner-Vorgabe war: "Ansprechperson mit Telefonnummer ... fuer BEIDE Seiten
--   sichtbar ... an der Besetzung und in der Live-Belegschaft". Besetzung und
--   Live-Belegschaft sind ANBIETER-Flaechen — dort gehoert die Nummer des
--   KUNDEN hin. Die Gegenrichtung (der Kunde sieht die Agentur) traegt
--   `offers` bereits.
--
--   Es fehlte also nicht die Anzeige, sondern die Haelfte der Daten.
--
-- WARUM AUF `demand_requests` UND NICHT AUF `assignments`
--   Der Bedarf ist die Stelle, an der das Einsatzunternehmen ohnehin spricht —
--   dort steht schon Ort, Zeitraum, Rolle. Eine Kontaktperson daneben ist eine
--   Angabe mehr im selben Formular, kein neuer Vorgang. Auf `assignments` waere
--   sie eine Spalte, die jemand nachtragen muesste, nachdem der Einsatz schon
--   laeuft — also genau dann, wenn niemand mehr Zeit dafuer hat.
--
--   `requests` traegt bereits `contact_email` und `contact_phone`; diese
--   Migration zieht `demand_requests` auf denselben Stand und ergaenzt den
--   Namen, denn eine Nummer ohne Namen ist bei einem Anruf um sechs Uhr morgens
--   die Haelfte der Auskunft.
--
-- DIE GRENZE DIESER MIGRATION, ehrlich benannt:
--   Gemessen am 2026-08-23 haben 61 von 68 Einsaetzen WEDER Bedarf noch Deal
--   noch Angebot noch Anforderung — sie stehen fuer sich. Fuer die traegt auch
--   diese Migration nichts bei. Das ist keine Luecke der Spalten, sondern eine
--   der Herkunft: ein Einsatz ohne Vorgang hat keine Gegenseite, die man
--   anrufen koennte. Wer das aendern will, aendert, wie Einsaetze entstehen —
--   eine eigene Entscheidung, keine Nebenwirkung dieser hier.
--
-- RESILIENZ: kein umschliessendes BEGIN; to_regclass vor jedem Schritt.
-- IDEMPOTENZ: ADD COLUMN IF NOT EXISTS.
-- ROLLBACK:
--   ALTER TABLE demand_requests DROP COLUMN contact_name, DROP COLUMN contact_phone;
--   Datenverlust beschraenkt sich auf Angaben, die es vorher nicht gab.
-- =============================================================================

SET client_min_messages TO WARNING;

DO $ansprechperson$
BEGIN
  IF to_regclass('public.demand_requests') IS NULL THEN
    RAISE NOTICE '192: demand_requests fehlt — uebersprungen.'; RETURN;
  END IF;

  ALTER TABLE demand_requests
    ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(200),
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);

  COMMENT ON COLUMN demand_requests.contact_name IS
    'Ansprechperson des EINSATZUNTERNEHMENS fuer diesen Bedarf. Sie ist die Nummer, die die '
    'Agentur in Besetzung und Live-Belegschaft sieht — die Gegenrichtung (Kunde sieht Agentur) '
    'traegt offers.contact_name. Pflicht mit Rueckfall auf das Profil, durchgesetzt in der Route '
    '(marketplace.js), nicht im Schema: eine Pflicht im Schema wuerde den Rueckfall unmoeglich '
    'machen.';
  COMMENT ON COLUMN demand_requests.contact_phone IS
    'Telefonnummer der Ansprechperson des Einsatzunternehmens. Der Grund fuer die ganze '
    'Entscheidung steht im Plan: "Wer morgens um sechs vor einer leeren Schicht steht, schreibt '
    'keine Nachricht."';

  RAISE NOTICE '192: contact_name/contact_phone auf demand_requests angelegt.';
END $ansprechperson$;
