-- Migration 205: Die Rechnung braucht eine Telefonnummer (BT-42)
--
-- BEFUND (gemessen am 2026-08-29 mit dem KoSIT-Validator 1.6.3 gegen die
-- XRechnung-3.0.2-Konfiguration):
--
--   [BR-DE-6] Das Element "Seller contact telephone number" (BT-42)
--             muss uebermittelt werden.
--
-- Das war der EINZIGE verbleibende Fehler der XRechnung-Pruefung, nachdem die
-- Profil-Kennung korrigiert und der Rechnungskontakt gepflegt war. Die
-- EN-16931-Kernregeln waren schon vorher erfuellt; BT-42 verlangt allein die
-- deutsche Auspraegung (CIUS XRechnung), und dort ist es Pflicht.
--
-- WARUM EINE EIGENE SPALTE:
-- `organizations` fuehrte bisher keine Telefonnummer. `users.phone` gibt es,
-- aber das ist die Nummer eines MENSCHEN, nicht die Kontaktstelle der
-- Rechnungsstellerin — und genau die verlangt die Norm. Wer hier auf die
-- Nutzertabelle ausweicht, schreibt die private Nummer eines Disponenten auf
-- jede Rechnung, die das Haus verlaesst.
--
-- Add-only und ohne NOT NULL: eine Pflicht auf Datenbankebene braeche jede
-- Bestandszeile, ohne irgendjemandem zu sagen, was fehlt. Die Bereitschafts-
-- pruefung meldet die Luecke stattdessen im Klartext, und die Pflegemaske auf
-- `integrations.html` schliesst sie.

-- ROLLBACK:
--   ALTER TABLE organizations DROP COLUMN IF EXISTS billing_phone;
--
-- Gefahrlos: die Spalte ist add-only, nullable, ohne Index und ohne Fremd-
-- schluessel. Nichts liest sie ausser dem Rechnungsgenerator, und der behandelt
-- sie als optional (BT-42 ist nur fuer XRechnung Pflicht). Nach dem Rollback
-- meldet `npm run test:schematron` fuer die XRechnung wieder BR-DE-6 — das ist
-- dann kein Defekt, sondern die richtige Auskunft.

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_phone TEXT;

COMMENT ON COLUMN organizations.billing_phone IS
  'Telefonnummer der Rechnungs-Kontaktstelle (BT-42). Pflicht fuer XRechnung '
  '(BR-DE-6), optional fuer reines EN 16931. NICHT die Nummer eines Nutzers: '
  'die Norm meint die Kontaktstelle der Firma.';

COMMIT;
