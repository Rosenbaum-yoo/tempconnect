-- =============================================================================
-- 187_audit_log_mandant_an_der_quelle.sql — Bestandsreparatur zu 8.1.1
-- =============================================================================
-- KONTEXT (gemessen am 2026-08-21 gegen die laufende Datenbank):
--
--   139 Zeilen tragen eine org_id, in der der Handelnde NIE Mitglied war
--       103  notification.mark_read
--        16  auth.register
--        13  auth.login
--         4  demo.login
--         3  subscription_request.apply_approved_change
--
--   1796 von 2740 Zeilen tragen GAR KEINE org_id und sind damit in keinem
--   Org-Audit sichtbar — auch nicht fuer den Admin, der sie braucht.
--
-- Zwei Defekte in einer Tabelle, mit gegenlaeufiger Wirkung: ein Teil liegt in
-- der FALSCHEN Organisation (Leck), der groessere Teil in KEINER (Luecke).
--
-- URSACHE, an der Quelle behoben (eigener Commit):
--   `req.orgId` wird aufgeloest, BEVOR die Route laeuft. Bei `/auth/login` also,
--   bevor es den angemeldeten Nutzer ueberhaupt gibt — was dort steht, stammt aus
--   der vorherigen Sitzung desselben Browsers. `routes/demo.js` setzte
--   `req.session.userId` zudem ohne `session.regenerate()`, sodass der
--   `_orgCache` des Vorgaengers die ganze Sitzung ueberlebte.
--   Seitdem: `bestimmeAuditOrg()` in `api/services/auditLog.js`.
--
-- WAS DIESE MIGRATION TUT
--   1. Falsch gestempelte Zeilen korrigieren — auf die Org des Handelnden, wenn
--      sie eindeutig ist (135 Zeilen), sonst auf NULL (4 Zeilen).
--   2. Org-lose Zeilen nachziehen, wo der Handelnde eindeutig einer Org angehoert
--      (1305 Zeilen). Der Rest bleibt NULL — und das ist dann richtig: beim
--      Anmelden gibt es noch keine Organisation.
--   3. Die RLS-Policy `al_same_org` schliessen. Sie lautete
--          org_id = current_org_id() OR org_id IS NULL
--      und zeigte damit JEDER Organisation alle org-losen Zeilen, sobald RLS die
--      Grenze ist. Der Anwendungspfad (`queryAuditLog`, `al.org_id = $n`) filtert
--      sie korrekt heraus — die Datenbank-Policy widersprach ihm. Staff sieht
--      weiterhin alles ueber `al_staff_bypass`.
--
-- NICHT GELOESCHT WIRD NIE. Ein Audit-Eintrag, der verschwindet, ist schlimmer
-- als einer, der falsch liegt. Es wird ausschliesslich `org_id` korrigiert.
--
-- RESILIENZ: keine umschliessende Transaktion, jeder Schritt per to_regclass
-- abgesichert (Lehre aus dem 116-Vorfall — ein fehlendes Objekt riss dort die
-- gesamte Sicherungs-Migration in den Rollback, die trotzdem als applied galt).
--
-- IDEMPOTENZ: die UPDATEs konvergieren (nach dem ersten Lauf trifft ihr WHERE
-- nichts mehr); die Policy wird per DROP IF EXISTS + CREATE neu gesetzt.
--
-- ROLLBACK: Schritt 3 mit
--     DROP POLICY al_same_org ON audit_log;
--     CREATE POLICY al_same_org ON audit_log
--       USING (org_id = current_org_id() OR org_id IS NULL);
--   Schritt 1 und 2 sind Datenkorrekturen und werden nicht zurueckgedreht —
--   der vorherige Zustand war nachweislich falsch.
-- =============================================================================

-- ── 1. Falsch gestempelte Zeilen: auf die Org des Handelnden oder auf NULL ────
DO $reparatur_fremd$
DECLARE geaendert bigint;
BEGIN
  IF to_regclass('public.audit_log') IS NULL OR to_regclass('public.org_memberships') IS NULL THEN
    RAISE NOTICE '187: audit_log oder org_memberships fehlt — Schritt 1 uebersprungen.'; RETURN;
  END IF;

  WITH falsch AS (
    SELECT al.id, al.actor_id
    FROM audit_log al
    WHERE al.org_id IS NOT NULL
      AND al.actor_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM org_memberships m
        WHERE m.user_id = al.actor_id AND m.org_id = al.org_id
      )
  )
  /* Eindeutig heisst: genau EINE Mitgliedschaft. Bei mehreren laesst sich im
   * Nachhinein nicht sagen, in welcher gehandelt wurde — dann ist NULL die
   * ehrliche Antwort, nicht die wahrscheinlichste. */
  UPDATE audit_log al
     SET org_id = (
       SELECT CASE WHEN count(*) = 1 THEN min(m.org_id) ELSE NULL END
       FROM org_memberships m WHERE m.user_id = al.actor_id
     )
   FROM falsch f
  WHERE al.id = f.id;

  GET DIAGNOSTICS geaendert = ROW_COUNT;
  RAISE NOTICE '187: Schritt 1 — % falsch gestempelte Zeile(n) korrigiert.', geaendert;
END $reparatur_fremd$;

-- ── 2. Org-lose Zeilen nachziehen, wo der Handelnde eindeutig ist ─────────────
DO $reparatur_leer$
DECLARE geaendert bigint;
BEGIN
  IF to_regclass('public.audit_log') IS NULL OR to_regclass('public.org_memberships') IS NULL THEN
    RAISE NOTICE '187: audit_log oder org_memberships fehlt — Schritt 2 uebersprungen.'; RETURN;
  END IF;

  UPDATE audit_log al
     SET org_id = e.org_id
    FROM (
      SELECT m.user_id, min(m.org_id) AS org_id
      FROM org_memberships m
      GROUP BY m.user_id
      HAVING count(*) = 1
    ) e
   WHERE al.org_id IS NULL
     AND al.actor_id IS NOT NULL
     AND al.actor_id = e.user_id;

  GET DIAGNOSTICS geaendert = ROW_COUNT;
  RAISE NOTICE '187: Schritt 2 — % org-lose Zeile(n) nachgezogen.', geaendert;
END $reparatur_leer$;

-- ── 3. Die RLS-Policy schliessen: org-lose Zeilen gehoeren keinem Mandanten ───
DO $policy_dicht$
BEGIN
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE NOTICE '187: audit_log fehlt — Schritt 3 uebersprungen.'; RETURN;
  END IF;
  DROP POLICY IF EXISTS al_same_org ON audit_log;
  CREATE POLICY al_same_org ON audit_log USING (org_id = current_org_id());
  RAISE NOTICE '187: Schritt 3 — al_same_org zeigt org-lose Zeilen nicht mehr jedem Mandanten.';
END $policy_dicht$;

-- =============================================================================
-- Abnahme (nach der Migration auszufuehren; muss 0 liefern):
--
--   SELECT count(*) FROM audit_log al
--    WHERE al.org_id IS NOT NULL AND al.actor_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM org_memberships m
--                       WHERE m.user_id = al.actor_id AND m.org_id = al.org_id);
--
-- Erzwungen durch `api/test/auditMandantenGrenze.test.js` (DB-gebunden).
-- =============================================================================
