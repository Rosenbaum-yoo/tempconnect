-- =============================================================================
-- Migration 233: die Audit-Zeile bekommt die Org ihres Akteurs (Owner-Entscheid)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DER BEFUND, UND WARUM ER EINE ENTSCHEIDUNG BRAUCHTE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `api/test/auditMandantenGrenze.test.js` war in JEDEM Lauf mit Datenbank rot:
-- 9 Zeilen ohne `org_id`, deren Akteur genau EINER Organisation angehoert. Sie
-- waeren eindeutig zuordenbar und sind in keinem Org-Audit sichtbar. CLAUDE.md
-- fuehrt den Befund seit dem 2026-10-01.
--
-- Die Leckstelle war die req-lose Form `writeAudit(pool, {...})`, die
-- `bestimmeAuditOrg()` nie fragt. Entscheidbar war der Fall aber nicht ohne den
-- Owner: gemessen tragen die 9 Zeilen ZWEI Akteure aus ZWEI Organisationen, auf
-- denselben Angeboten — der Kaeufer erstellt, der Lieferant bestaetigt. Es gab
-- also keine strikt bessere Wahl, sondern zwei Audit-Modelle:
--
--   Ressourcen-Org   die Geschaeftshistorie ist an EINER Stelle vollstaendig,
--                    aber die Handlung des Lieferanten erscheint im Mandanten
--                    des Kaeufers
--   Akteurs-Org      jeder Mandant sieht, was SEINE Leute getan haben, aber
--                    kein Mandant hat die vollstaendige Historie
--
-- `audit_log` hat EINE `org_id` — eine Zeile gehoert genau einer Seite.
-- OWNER-ENTSCHEID 2026-10-02: **Akteurs-Org.**
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WAS DIESE MIGRATION TUT
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sie traegt den Bestand nach. Die SCHREIBSEITE ist in
-- `api/services/auditLog.js` geloest, an der Quelle der Wahrheit: `writeAudit()`
-- setzt den Rueckfall inline im INSERT, fuer alle 78 Aufrufstellen gleichzeitig.
-- Diese Datei ist die EINMALIGE Reparatur davor, wie 187 (Schritt 2) und 198.
--
-- DIESELBE BEDINGUNG, BUCHSTABENGENAU wie im Test und im Code:
--   * genau eine Organisation -> diese
--   * null, zwei oder mehr    -> NULL bleibt NULL (eine Org zu RATEN waere
--                               schlimmer als keine)
--   * kein Akteur             -> NULL
--   * `is_active` wird NICHT gefiltert. Der Test filtert auch nicht; wer hier
--     enger prueft als die Spezifikation, laesst sie rot. (`org_memberships`
--     traegt `UNIQUE (user_id, org_id)` — `count(*) = 1` im Test und
--     `count(DISTINCT org_id) = 1` hier sind damit per Schema identisch, nicht
--     nur nach heutiger Datenlage.)
--
-- UND NICHT `max(uuid)`, sondern `(array_agg(...))[1]`. Weil es `max(uuid)` in
-- PostgreSQL nicht gibt:
--     SELECT max(org_id) FROM org_memberships;
--     ERROR:  function max(uuid) does not exist
-- Der erste Entwurf stand mit `max()` da und haette geworfen. Migration 202 hat
-- denselben Fehler schon einmal kassiert und fuehrt ihn dort als Lehre.
--
-- GEMESSEN am 2026-10-02, vor dem Lauf:
--   audit_log gesamt                      3995
--   mit Org                               2428
--   ohne Org                              1567
--     davon ohne Akteur                   1316   <- bleibt NULL, richtig
--     davon Akteur in 0 Organisationen     242   <- bleibt NULL, richtig
--     davon Akteur in genau 1              9     <- DIESE
--   Nutzer mit mehr als einer Org            0   (der mehrdeutige Fall ist heute
--                                               leer; kuenstlich belegt: NULL)
--
-- Die 9 verteilen sich auf zwei Organisationen (7 + 2) und fuenf Aktionen:
-- state_machine.transition, deal.agreement_created/confirmed/activated,
-- assignment.created.
--
-- WAS SIE BEWUSST NICHT TUT: die 1558 uebrigen org-losen Zeilen anfassen. Ohne
-- Akteur oder mit mehrdeutigem Akteur gibt es keine zuordenbare Organisation —
-- der Test nennt genau das als erlaubt, und eine geratene Org waere eine falsche
-- Behauptung in einem Pruefpfad.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK-STRATEGIE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Der Rueckweg ist genau benannt und braucht keine Liste: die betroffenen Zeilen
-- sind die, deren `org_id` der einzigen Organisation ihres Akteurs entspricht UND
-- die diese Migration gesetzt hat. Da die Zuordnung aus dem Akteur ableitbar ist,
-- genuegt dieselbe Bedingung rueckwaerts:
--
--   UPDATE audit_log al SET org_id = NULL
--    WHERE al.org_id = (SELECT (array_agg(m.org_id))[1] FROM org_memberships m
--                        WHERE m.user_id = al.actor_id
--                       HAVING count(DISTINCT m.org_id) = 1)
--      AND al.created_at < '2026-10-02'::date;
--
-- Die Datumsgrenze ist noetig und gehoert benannt: ohne sie nimmt der Rueckweg
-- auch Zeilen die Org, die die Anwendung seit der Umstellung RICHTIG gesetzt hat.
-- Ein Rollback, der mehr aufraeumt als die Migration angelegt hat, ist keiner.
--
-- Owner-Entscheid 2026-10-02
-- =============================================================================

BEGIN;

SET client_min_messages TO WARNING;

DO $akteurs_org$
DECLARE
  vorher int;
  betroffen int;
  rest int;
  gesamt int;
BEGIN
  /* Erst zaehlen, dann handeln — und die Zahl gehoert in die Meldung, nicht nur
     in den Lauf. Sie ist der einzige Beleg dafuer, dass hier etwas passiert ist. */
  SELECT count(*) INTO vorher
    FROM audit_log al
   WHERE al.org_id IS NULL
     AND al.actor_id IS NOT NULL
     AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1;

  UPDATE audit_log al
     SET org_id = (
           SELECT (array_agg(m.org_id))[1]
             FROM org_memberships m
            WHERE m.user_id = al.actor_id
           HAVING count(DISTINCT m.org_id) = 1
         )
   WHERE al.org_id IS NULL
     AND al.actor_id IS NOT NULL
     AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1;
  GET DIAGNOSTICS betroffen = ROW_COUNT;

  /* RAISE WARNING, nicht NOTICE: oben steht `SET client_min_messages TO WARNING`,
     und ein NOTICE verschwindet darin. Das hat Migration 232 am selben Tag
     gekostet — sie raeumte eine Zeile auf und gab NICHTS aus. */
  IF betroffen > 0 THEN
    RAISE WARNING '233: % von % zuordenbaren Audit-Zeilen haben die Org ihres Akteurs bekommen (Akteurs-Org, Owner-Entscheid 2026-10-02).', betroffen, vorher;
  ELSE
    RAISE NOTICE '233: keine zuordenbare org-lose Audit-Zeile gefunden - nichts zu tun (No-Op).';
  END IF;

  /* NOTBREMSE 1 · die Wirkung, nicht die Absicht. Bleibt eine Zeile uebrig, hat
     die Bedingung sie nicht erfasst — und der rote Test bleibt rot. */
  SELECT count(*) INTO rest
    FROM audit_log al
   WHERE al.org_id IS NULL
     AND al.actor_id IS NOT NULL
     AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1;
  IF rest <> 0 THEN
    RAISE EXCEPTION '233: % zuordenbare Zeile(n) haben weiter keine Org. Die Bedingung hat sie nicht erfasst.', rest;
  END IF;

  /* NOTBREMSE 2 · und sie hat nicht ZU VIEL getan. Keine Zeile darf eine Org
     tragen, die nicht die einzige ihres Akteurs ist — sonst haette der Lauf eine
     Org geraten, und eine falsche Behauptung in einem Pruefpfad ist schlimmer als
     eine fehlende. Geprueft wird nur, was diese Migration angefasst haben KANN:
     Zeilen mit Akteur in genau einer Organisation. */
  SELECT count(*) INTO rest
    FROM audit_log al
   WHERE al.actor_id IS NOT NULL
     AND al.org_id IS NOT NULL
     AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1
     AND al.org_id <> (SELECT (array_agg(m.org_id))[1] FROM org_memberships m
                        WHERE m.user_id = al.actor_id
                       HAVING count(DISTINCT m.org_id) = 1);
  IF rest <> 0 THEN
    RAISE WARNING '233: % Zeile(n) tragen eine andere Org als die einzige ihres Akteurs. Das ist NICHT zwangslaeufig falsch - eine Handlung kann fuer einen fremden Mandanten geschehen und dessen Org ausdruecklich mitgegeben worden sein (Regel 1 von bestimmeAuditOrg). Diese Migration hat sie nicht angefasst; die Zahl steht hier, damit sie nicht unbemerkt waechst.', rest;
  END IF;

  /* NOTBREMSE 3 · die Pruefung hat ueberhaupt etwas geprueft. Ist audit_log leer
     (Frischinstall), sind Notbremse 1 und 2 LEER erfuellt und beweisen nichts —
     das gehoert gesagt, nicht verschwiegen. Die Lehre aus Migration 230. */
  SELECT count(*) INTO gesamt FROM audit_log;
  IF gesamt = 0 THEN
    RAISE WARNING '233: audit_log ist leer (Frischinstall) - die Notbremsen sind leer erfuellt und haben NICHTS nachgewiesen. Die Schreibseite in api/services/auditLog.js sorgt ab der ersten Zeile fuer die Akteurs-Org; api/test/auditMandantenGrenze.test.js prueft sie am Bestand.';
  END IF;
END $akteurs_org$;

COMMIT;
