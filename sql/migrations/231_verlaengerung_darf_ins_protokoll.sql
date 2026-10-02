-- =============================================================================
-- Migration 231: die Verlaengerung darf ins Protokoll (Owner-Punkt 17)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WIE DIESER BEFUND ENTSTANDEN IST — und das ist der lehrreichere Teil
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Punkt 17 verlangt eine AUDITIERTE Verlaengerung. Der neue Befehl
-- `owner-access-cli.js extend` ruft `writeAudit({ action: "extend", ... })`
-- korrekt auf — und trotzdem stand hinterher KEINE Zeile im Protokoll.
--
-- Der CHECK auf `owner_control_access_audit.action` kannte vier Werte:
--
--     'grant', 'revoke', 'list', 'access_denied'
--
-- `extend` verstoesst dagegen. Der Einfuegeversuch wirft — und `writeAudit`
-- faengt das in einem leeren `catch {}` ab, ausdruecklich damit die CLI auch ohne
-- Protokolltabelle arbeitet. Die Anforderung "auditiert" war damit STILL NICHT
-- ERFUELLT: der Befehl meldete Erfolg, die Spur fehlte.
--
-- Gemessen am 2026-10-02 nach der ersten Erprobung:
--
--     extend-Zeilen im Protokoll     0
--     action-Werte im Bestand        access_denied 23 · grant 5 · list 3 · revoke 1
--
-- Ein tolerantes `catch` erfindet keine Befunde — es verdeckt sie. Deshalb
-- protokolliert `writeAudit` den Fehlschlag jetzt auf stderr (nicht fatal, die
-- Begruendung bleibt gueltig), und der CHECK kennt den neuen Wert.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK-STRATEGIE
-- ─────────────────────────────────────────────────────────────────────────────
--
--   DELETE FROM owner_control_access_audit WHERE action = 'extend';
--   ALTER TABLE owner_control_access_audit
--     DROP CONSTRAINT owner_control_access_audit_action_check,
--     ADD  CONSTRAINT owner_control_access_audit_action_check
--          CHECK (action IN ('grant','revoke','list','access_denied'));
--
-- Der DELETE ist noetig und gehoert benannt: der engere CHECK laesst sich nicht
-- setzen, solange Zeilen mit 'extend' existieren — und ein Rollback, der an
-- Bestandsdaten scheitert, ist keiner. Dass er Protokollzeilen loescht, ist der
-- Preis; wer ihn zieht, nimmt die Verlaengerungs-Spur in Kauf.
--
-- Owner-Punkt 17 — 2026-10-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

ALTER TABLE owner_control_access_audit
  DROP CONSTRAINT IF EXISTS owner_control_access_audit_action_check;

ALTER TABLE owner_control_access_audit
  ADD CONSTRAINT owner_control_access_audit_action_check
  CHECK (action IN ('grant', 'revoke', 'extend', 'list', 'access_denied'));

COMMENT ON CONSTRAINT owner_control_access_audit_action_check ON owner_control_access_audit IS
  'Erlaubte Protokoll-Handlungen der Owner-Zugangsverwaltung. `extend` kam mit '
  'Owner-Punkt 17 dazu (auditierte Verlaengerung) — ohne den Wert warf das '
  'Einfuegen, und writeAudit verschluckte es in einem leeren catch: der Befehl '
  'meldete Erfolg, die Spur fehlte.';

DO $nachweis$
DECLARE
  n int;
BEGIN
  /* Die Probe, die den Befund nachstellt: 'extend' muss sich einfuegen lassen.
     Geprueft wird in einem Unterblock, der die Probezeile wieder entfernt -
     eine Migration soll keine Protokollzeile hinterlassen, die nichts bedeutet. */
  BEGIN
    INSERT INTO owner_control_access_audit (user_id, action, note, metadata)
    VALUES (NULL, 'extend', 'Migration 231: Probe, wird wieder entfernt', '{}'::jsonb);
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION '231: der CHECK erlaubt kein extend - die auditierte Verlaengerung waere weiter still wirkungslos.';
  END;
  DELETE FROM owner_control_access_audit
   WHERE action = 'extend' AND note = 'Migration 231: Probe, wird wieder entfernt';

  /* Und die Gegenrichtung: der CHECK darf nicht einfach weg sein. Ein Protokoll,
     das jeden Text annimmt, kann keine Handlung mehr von einem Tippfehler
     unterscheiden. */
  BEGIN
    INSERT INTO owner_control_access_audit (user_id, action, metadata)
    VALUES (NULL, 'erfundene_handlung', '{}'::jsonb);
    RAISE EXCEPTION '231: der CHECK nimmt beliebige Handlungen an - dann unterscheidet das Protokoll eine Handlung nicht von einem Tippfehler.';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- so soll es sein
  END;

  SELECT count(*) INTO n FROM owner_control_access_audit WHERE action = 'extend';
  IF n <> 0 THEN
    RAISE EXCEPTION '231: % Probezeile(n) uebrig - die Migration hinterlaesst Protokollzeilen, die nichts bedeuten.', n;
  END IF;

  RAISE NOTICE '231: owner_control_access_audit kennt extend - die Verlaengerung hinterlaesst jetzt eine Spur.';
END $nachweis$;

COMMIT;
