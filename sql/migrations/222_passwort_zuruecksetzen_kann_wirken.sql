-- Migration 222: Passwort zuruecksetzen kann wirken (Welle Z, Z1)
-- =============================================================================
-- WER SEIN PASSWORT VERGISST, KOMMT NICHT ZURUECK.
--
-- `authService` setzt, prueft und loescht ein Reset-Token:
--
--   setResetToken       UPDATE users SET reset_token=$1, reset_token_expires=$2
--   validateResetToken  SELECT ... WHERE reset_token=$1 AND reset_token_expires > NOW()
--   resetPassword       UPDATE users SET password_hash=$1, reset_token=NULL, ...
--
-- Beide Spalten existieren in der Datenbank nicht (gemessen am 2026-09-27: 0
-- Treffer in information_schema). Der KOMPLETTE Ablauf wirft — von der Mail, die
-- korrekt verschickt wird, bis zum Klick, der in einer 500 endet. Der Mensch
-- meldet das nicht, er geht. Fuer einen Piloten im Dezember ist das der
-- schwerste der sechzehn Schema-Befunde.
--
-- `test/sqlSchemaWaechter.test.js` fuehrt beide Spalten in seiner Bestandsliste
-- mit dem Vermerk "Der komplette Ablauf wirft". Es fehlte nicht die Erkennung,
-- es fehlte die Behebung.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM SPALTEN AN `users` UND KEINE EIGENE TOKEN-TABELLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Der erste Gedanke war eine Tabelle nach dem Muster von
-- `email_verification_tokens` (token_hash, expires_at, consumed_at) — gehashtes
-- Token, ausdruecklich einmalig. Die Messung hat dagegen entschieden:
--
--   `email_verification_tokens` ist eine WAISE. Sie kommt im ganzen Code nur in
--   einem Kommentar vor; die echte E-Mail-Bestaetigung laeuft ueber
--   `users.verification_token`, und `verifyEmail` setzt ihn auf NULL — also
--   wirklich einmalig (belegt in docs/features/I_AUDIT_ZUWEISUNG_SUPPORT.md,
--   Zeile 1462).
--
-- Das geltende Muster dieses Projekts ist also: EIN Token-Feld an `users`, beim
-- Gebrauch genullt. Der Reset-Code folgt ihm bereits genau. Eine zweite,
-- abweichende Bauart fuer denselben Zweck einzufuehren, waere kein Fortschritt,
-- sondern eine dritte Wahrheit neben einer Waise und einem funktionierenden Weg.
--
-- OB DAS TOKEN GEHASHT GEHOERT, IST EINE SICHERHEITSFRAGE UND WIRD HIER NICHT
-- ENTSCHIEDEN. Sie betrifft `verification_token` genauso und gehoert dem Owner
-- vorgelegt, nicht nebenbei auf einem Auth-Pfad geaendert. Diese Migration
-- behebt den Bruch und aendert das Verfahren nicht.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- EINE ABWEICHUNG VON DER VORLAGE, MIT GRUND: DER INDEX
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `users.verification_token` hat KEINEN Index (gemessen). `validateResetToken`
-- sucht aber AM TOKEN — ohne Index ist jeder Reset-Versuch ein vollstaendiger
-- Durchlauf der Nutzertabelle. Das ist genau das Muster "laeuft bei 10, bricht
-- bei 300", das die Projektregeln beim Wachstum mitdenken lassen.
--
-- TEILWEISER Index: nur Zeilen mit offenem Reset stehen darin. Bei 3000 Nutzern
-- und einer Handvoll offener Vorgaenge bleibt er winzig, und der Schreibpfad
-- (jede Passwortaenderung nullt das Feld) zahlt fast nichts dafuer.
--
-- ROLLBACK / RUECKNAHME:
--   DROP INDEX IF EXISTS users_reset_token_idx;
--   ALTER TABLE users DROP COLUMN IF EXISTS reset_token;
--   ALTER TABLE users DROP COLUMN IF EXISTS reset_token_expires;
--   -- Offene Reset-Vorgaenge verfallen damit; die Nutzer koennen ihn neu anstossen.
-- =============================================================================

SET client_min_messages TO WARNING;

BEGIN;

-- Typ und Nullbarkeit wie bei `verification_token` (text, NULL erlaubt): ein
-- Konto ohne offenen Reset hat hier nichts stehen.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token         TEXT,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_reset_token_idx
  ON users(reset_token)
  WHERE reset_token IS NOT NULL;

COMMENT ON COLUMN users.reset_token IS
  'Z1: Einmal-Token fuer das Zuruecksetzen des Passworts. Wird von resetPassword auf NULL gesetzt.';
COMMENT ON COLUMN users.reset_token_expires IS
  'Z1: Verfall des Reset-Tokens (authService setzt eine Stunde). Abgelaufen = ungueltig.';

COMMIT;
