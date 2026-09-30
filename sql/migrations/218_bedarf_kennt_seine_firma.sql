-- Migration 218: Ein Bedarf kennt die Firma, fuer die er angelegt wurde
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WARUM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `demand_requests` speicherte nur den anlegenden NUTZER (`requester_company_id`),
-- nicht die Firma, fuer die er gehandelt hat. Die Kundensperre (Welle N4) haengt
-- aber an der FIRMA (`company_worker_blocklist.company_org_id`). Beim Anlegen
-- stimmte sie noch — die Route kennt `req.orgId`. Jede spaetere Stelle musste die
-- Firma RATEN und nahm `users.org_id`:
--
--   Match-Trigger, Notdienst-Eskalation, Vorschlaege in der Bedarfsansicht,
--   Gegenrichtung bei neuen Angeboten
--
-- `users.org_id` ist die persoenliche START-Firma: jede Registrierung legt eine
-- eigene an, und wer danach eine Einladung annimmt, bekommt nur eine zusaetzliche
-- Mitgliedschaft (authService.createOrgWithMembership / orgInviteService.acceptInvite).
-- Ein eingeladenes Teammitglied von Firma A pruefte an diesen vier Stellen gegen
-- die LEERE Sperrliste seiner Start-Firma — die bei A gesperrte Kraft wurde A doch
-- vorgeschlagen, und ihre Zeitarbeitsfirma wurde angeschrieben. Gefunden von der
-- adversarischen Pruefung vom 2026-09-15 (Blickwinkel Mandantengrenze).
--
-- Owner-Entscheid 2026-09-15: die Firma am Bedarf speichern. Das ist zugleich die
-- Grundlage, Bedarfe kuenftig an der Mandantengrenze statt am Nutzer zu binden.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DER ALTBESTAND
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fuer bestehende Bedarfe weiss niemand mehr sicher, fuer welche Firma sie
-- angelegt wurden. Die beste belastbare Antwort:
--
--   genau EINE aktive Mitgliedschaft in einer Unternehmens-Firma  -> diese Firma
--   sonst                                                         -> users.org_id
--
-- Der Rueckfall ist exakt das bisherige Verhalten — fuer keinen Bedarf wird es
-- schlechter, fuer die eindeutigen wird es richtig. Der Code liest die Spalte mit
-- demselben Rueckfall (companyBlocklistService.kundenOrgEinesBedarfs), damit ein
-- Bedarf, den ein alter Pfad ohne Firma anlegt, nie ohne Sperre bleibt.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
--
--   Zuerst den Code zuruecksetzen, DANN:
--   DROP INDEX IF EXISTS demand_requests_requester_org_idx;
--   ALTER TABLE demand_requests DROP COLUMN IF EXISTS requester_org_id;
--
-- Die Reihenfolge ist Pflicht: der neue Code liest die Spalte. Die Spalte selbst
-- stehen zu lassen ist gefahrlos — alter Code waehlt sie nicht aus. Im Zweifel
-- also nur den Code zuruecknehmen.

SET client_min_messages TO WARNING;

BEGIN;

ALTER TABLE demand_requests
  ADD COLUMN IF NOT EXISTS requester_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

WITH eindeutige_firma AS (
  SELECT om.user_id, MIN(om.org_id::text)::uuid AS org_id
    FROM org_memberships om
    JOIN organizations o ON o.id = om.org_id
   WHERE om.is_active = TRUE
     AND o.type = 'company'
   GROUP BY om.user_id
  HAVING COUNT(DISTINCT om.org_id) = 1
)
UPDATE demand_requests dr
   SET requester_org_id = COALESCE(e.org_id, u.org_id)
  FROM users u
  LEFT JOIN eindeutige_firma e ON e.user_id = u.id
 WHERE u.id = dr.requester_company_id
   AND dr.requester_org_id IS NULL;

-- Bedarfe einer Firma werden kuenftig an ihr gelesen; der Index kostet beim
-- Anlegen fast nichts und haelt das Lesen bei 300 Kunden guenstig.
CREATE INDEX IF NOT EXISTS demand_requests_requester_org_idx
  ON demand_requests(requester_org_id)
  WHERE requester_org_id IS NOT NULL;

COMMENT ON COLUMN demand_requests.requester_org_id IS
  'Die Firma, fuer die der Bedarf angelegt wurde (aus der aktiven Firma der Sitzung). '
  'Traeger der Kundensperre. Altbestand: einzige aktive Unternehmens-Mitgliedschaft des '
  'Anlegers, sonst users.org_id. Welle N2.11, Owner-Entscheid 2026-09-15.';

COMMIT;
