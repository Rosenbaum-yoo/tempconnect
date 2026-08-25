-- =============================================================================
-- 198_audit_login_zeilen_zuordenbar.sql — Bestandsreparatur, zweiter Durchgang
-- =============================================================================
-- OWNER-ENTSCHEID (2026-08-24): "Login-Zeilen sollen zuordenbar sein."
--
-- WORUM ES GEHT. Migration 187 hat den Audit-Mandanten an der Quelle repariert
-- und den Bestand nachgezogen. Ihr Kopf haelt org-lose Login-Zeilen fuer
-- richtig ("beim Anmelden gibt es noch keine Organisation"), waehrend ihr
-- Schritt 2 sie ungefiltert mitgezogen hat — und die Zusicherung in
-- `api/test/auditMandantenGrenze.test.js` erzwingt seitdem genau das.
-- Zwei Wahrheiten aus derselben Welle, die sich widersprachen. Der Owner hat
-- zugunsten der Zuordenbarkeit entschieden: eine Anmeldung, die sich eindeutig
-- einer Organisation zuordnen laesst, gehoert in deren Audit.
--
-- GEMESSEN am 2026-08-24 gegen die laufende Datenbank, VOR dieser Migration:
--   9 org-lose Zeilen, deren Akteur genau EINER Organisation angehoert
--     3  demo.login                    (22.-23.08.)
--     3  offer.abuse_reported          (22.08.)
--     2  user.abuse_reported           (24.08.)
--     1  capacity_post.abuse_reported  (22.08.)
--
-- Alle neun datieren NACH Migration 187 — es sind keine Bestandszeilen, die 187
-- uebersehen haette, sondern Neuzugaenge einer Schreibseite, die die Org wegliess.
--
-- DIE QUELLE IST ZUERST BEHOBEN, in eigenen Commits:
--   - `routes/profileVisibility.js` schrieb ueber die req-lose Form
--     `writeAudit(pool, {...})`, die `bestimmeAuditOrg()` nie fragt.
--     Umgestellt auf `writeAuditEnhanced(pool, req, {...})`.
--   - `routes/demo.js` und `routes/auth.js` (Login UND Registrierung) geben die
--     Organisation jetzt ausdruecklich mit. `req.orgId` wird aufgeloest, BEVOR
--     die Route laeuft — beim Anmelden also, bevor es den Nutzer gibt; danach
--     greift zusaetzlich der Riegel `orgIdGiltFuerNutzer !== actorId`. Beides
--     ist richtig und bleibt. Neu ist `orgNachAnmeldung()` in
--     `services/auditLog.js`, das dieselbe Aufloesung benutzt wie
--     `middleware/orgContext.js` bei der naechsten Anfrage.
--
-- Ohne den Quell-Fix waere diese Migration ein Putzlappen unter einem laufenden
-- Wasserhahn: sie raeumt einmal auf, und morgen liegen die naechsten Zeilen da.
--
-- WAS DIESE MIGRATION TUT
--   Genau das, was 187 Schritt 2 tat — fuer die Zeilen, die seitdem entstanden
--   sind. Org-lose Zeilen bekommen die Organisation ihres Handelnden, WENN sie
--   eindeutig ist. Bei null oder mehreren Mitgliedschaften bleibt NULL stehen:
--   im Nachhinein laesst sich nicht sagen, in welcher gehandelt wurde, und die
--   wahrscheinlichste Antwort ist nicht die ehrliche.
--
-- NICHT GELOESCHT WIRD NIE. Wie in 187: es wird ausschliesslich `org_id`
-- gesetzt, keine Zeile verschwindet, keine wird umgeschrieben.
--
-- RESILIENZ: keine umschliessende Transaktion, der Schritt per to_regclass
-- abgesichert (Lehre aus dem 116-Vorfall).
--
-- IDEMPOTENZ: das UPDATE konvergiert — nach dem ersten Lauf trifft sein WHERE
-- nichts mehr. Mehrfach anwendbar, auch auf einer frischen Datenbank, wo es
-- schlicht 0 Zeilen trifft.
--
-- ROLLBACK: keiner. Eine Datenkorrektur zurueckzudrehen hiesse, Zeilen wieder
-- unsichtbar zu machen, die einem Mandanten nachweislich gehoeren. Der
-- vorherige Zustand war der Defekt.
--
-- ABNAHME (muss 0 liefern, erzwungen durch api/test/auditMandantenGrenze.test.js):
--   SELECT count(*) FROM audit_log al
--    WHERE al.org_id IS NULL AND al.actor_id IS NOT NULL
--      AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1;
-- =============================================================================

SET client_min_messages TO WARNING;

DO $zuordenbar$
DECLARE geaendert bigint;
BEGIN
  IF to_regclass('public.audit_log') IS NULL OR to_regclass('public.org_memberships') IS NULL THEN
    RAISE NOTICE '198: audit_log oder org_memberships fehlt — uebersprungen.'; RETURN;
  END IF;

  /* Eindeutig heisst: genau EINE Mitgliedschaft. Dieselbe Regel und dieselbe
   * Formulierung wie in 187 Schritt 2 — bewusst keine zweite Fassung derselben
   * Logik. `(array_agg(...))[1]` statt `min()`, weil es fuer uuid kein min()
   * gibt (beim ersten Lauf von 187 aufgeschlagen). */
  UPDATE audit_log al
     SET org_id = e.org_id
    FROM (
      SELECT m.user_id, (array_agg(m.org_id))[1] AS org_id
      FROM org_memberships m
      GROUP BY m.user_id
      HAVING count(*) = 1
    ) e
   WHERE al.org_id IS NULL
     AND al.actor_id IS NOT NULL
     AND al.actor_id = e.user_id;

  GET DIAGNOSTICS geaendert = ROW_COUNT;
  RAISE NOTICE '198: % org-lose Zeile(n) nachgezogen (erwartet am 2026-08-24: 9).', geaendert;
END $zuordenbar$;
