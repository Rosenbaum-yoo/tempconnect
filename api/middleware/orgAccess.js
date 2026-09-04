import { getMembership } from "../services/rbacService.js";
import { isOrgAccessSuspended } from "../services/orgAccessSuspensionService.js";

export function requireCompanyOrg(deps, options = {}) {
  const { pool, logger } = deps;
  const errorCode = options.errorCode || "BUYER_ORG_REQUIRED";
  const errorMessage = options.errorMessage || "Dieser Bereich steht nur fuer Unternehmensorganisationen zur Verfuegung.";

  /*
   * BENANNT statt anonym — dieselbe Lehre wie bei `requirePermissionMiddleware`
   * in middleware/rbac.js, die dort seit einem Befund im Kommentar steht und hier
   * nie angewandt wurde (bis M2.7). Eine anonyme Middleware ist in Stapelspuren
   * unsichtbar, und kein Waechter kann fragen "traegt DIESE Route die
   * Unternehmens-Pruefung?" — er kann nur Middleware ZAEHLEN, und dabei sieht
   * eine Route ohne Pruefung aus wie eine mit.
   */
  return async function requireCompanyOrgMiddleware(req, res, next) {
    try {
      if (!req.orgId) {
        return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      }

      let membership = req.orgMembership || null;
      if (!membership && req.session?.userId) {
        membership = await getMembership(pool, req.session.userId, req.orgId);
        if (membership) req.orgMembership = membership;
      }

      if (!membership) {
        return res.status(403).json({
          error: "NO_ORG_MEMBERSHIP",
          message: "Organisations-Mitgliedschaft erforderlich."
        });
      }

      const orgType = String(membership.org_type || "").trim().toLowerCase();
      /*
       * M2.7 — bis hierher stand hier `if (orgType && orgType !== "company")`.
       * Eine Mitgliedschaft OHNE Org-Typ kam damit durch: fail-OPEN an der Wache,
       * die entscheidet, wer Unternehmensflaechen sieht.
       *
       * Erreichbar war das heute nicht — `organizations.type` ist NOT NULL (an der
       * laufenden Datenbank nachgesehen, null leere Werte), und jede Stelle, die
       * `req.orgMembership` setzt, holt die Zeile ueber `getMembership` bzw.
       * `getPrimaryOrg` — beide lesen `o.type AS org_type` mit. Der
       * Zwischenspeicher-Pfad in `orgContext` setzt das Feld ausdruecklich NICHT
       * ("avoid stale data"), dort schlaegt diese Wache selbst nach. Der Zweig hing
       * also an einer Datenbankbedingung und an gleichlautenden SELECT-Listen.
       * Faellt eine davon, geht die Tuer auf, ohne dass jemand hier etwas aendert.
       *
       * Deshalb fail-closed: was kein `company` ist, kommt nicht durch — auch
       * nicht, wenn es gar nichts ist.
       */
      if (orgType !== "company") {
        logger.warn(
          { orgId: req.orgId, orgType, userId: req.session?.userId || null },
          "Company-org guard denied access"
        );
        return res.status(403).json({
          error: errorCode,
          message: errorMessage
        });
      }

      next();
    } catch (err) {
      logger.error({ err }, "Company-org guard failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAS SPIEGELBILD: NUR DIE ZEITARBEITSFIRMA (M3.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Das Arbeitskraefte-Modul (`routes/workers.js`) hing bis heute an einem
 * TARIF-Tor, nicht an einem Org-Typ-Tor: `requireWorkerFeature` prueft
 * `hasFeature(plan, "worker_module")`, und dieses Merkmal tragen PLUS, PRO,
 * INDIVIDUELL und ENTERPRISE — unabhaengig davon, ob die Organisation eine
 * Zeitarbeitsfirma oder ein Unternehmen ist.
 *
 * GEMESSEN AM 2026-09-04, und die Zahl entscheidet die Frage:
 * von 65 Wegen mit diesem Wachstapel sind **36 belegbar agenturseitig**
 * (`supplierOrgId`/`supplier_org_id` im Rumpf) und **null** kundenseitig. Kein
 * einziger Weg dieses Moduls bedient die Unternehmensseite. `workerService`
 * schreibt 87-mal `supplier_org_id` und einmal `client_org_id`.
 *
 * Ein Unternehmen, das hier importiert, erzeugt also nicht bloss Daten, die es
 * nicht sehen sollte — es erzeugt Arbeitskraefte, deren LIEFERANT ein
 * Unternehmen ist. Das ist ein Widerspruch im Datenmodell, nicht nur eine
 * Rechtefrage.
 *
 * Das Einsatzportal ist NICHT betroffen: es liegt in `routes/workerPortal.js`
 * mit eigenem Wachstapel, und ein Arbeiter sitzt ohnehin in einer Agentur-Org
 * (`acceptInvite` setzt die Mitgliedschaft auf die `supplier_org_id`), kommt
 * hier also durch.
 *
 * Fail-closed wie das Gegenstueck oben: was kein `agency` ist, kommt nicht
 * durch — auch nicht, wenn es gar nichts ist.
 */
export function requireAgencyOrg(deps, options = {}) {
  const { pool, logger } = deps;
  const errorCode = options.errorCode || "AGENCY_ORG_REQUIRED";
  const errorMessage = options.errorMessage
    || "Dieser Bereich gehoert zur Zeitarbeitsfirma. Ein Unternehmenskonto verwaltet "
     + "keine eigenen Arbeitskraefte.";

  return async function requireAgencyOrgMiddleware(req, res, next) {
    try {
      if (!req.orgId) {
        return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      }

      /*
       * DIE ART DER ORGANISATION HAENGT AN DER ORGANISATION, NICHT AM MENSCHEN.
       *
       * Die erste Fassung dieses Riegels holte den Typ ueber `getMembership` —
       * und haette damit JEDEN Maschinenschluessel gesperrt: `apiKeyAuth`
       * setzt `req.orgId` (Zeile 50 und 79) und NIE `req.orgMembership`. Ein
       * Schluessel hat keine Mitgliedschaft, weil hinter ihm kein Mensch steht.
       * Gefunden hat es `workers.scope.test.js`, und zwar nicht an meinem
       * Riegel, sondern daran, dass eine Nachbarzusicherung ploetzlich einen
       * anderen Fehlercode bekam.
       *
       * Gefragt wird deshalb die Org selbst. Die Mitgliedschaft dient nur noch
       * als Abkuerzung, wenn sie ohnehin schon geladen ist — sie traegt
       * `org_type` aus derselben Zeile.
       */
      let orgType = String(req.orgMembership?.org_type || "").trim().toLowerCase();

      if (!orgType) {
        const { rows } = await pool.query(
          "SELECT type AS org_type FROM organizations WHERE id = $1", [req.orgId]);
        orgType = String(rows[0]?.org_type || "").trim().toLowerCase();
      }

      if (orgType !== "agency") {
        logger.warn(
          { orgId: req.orgId, orgType, userId: req.session?.userId || null },
          "Agency-org guard denied access"
        );
        return res.status(403).json({ error: errorCode, message: errorMessage });
      }

      next();
    } catch (err) {
      logger.error({ err }, "Agency-org guard failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  };
}

/**
 * Blockiert mutierende Self-Service-/Org-Boundary-Routen, wenn der Betreiber den
 * Zugang der Org gesperrt hat (Kill-Switch, organizations.access_suspended_at).
 * Bewusst NICHT requireActiveSubscription — das wuerde Erstkaeufer OHNE Abo blocken;
 * hier wird gezielt NUR die Sperre geprueft. Fail-safe: Lese-/DB-Fehler → 500 (blockt).
 */
export function requireOrgNotSuspended(deps, options = {}) {
  const { pool, logger } = deps;
  const errorCode = options.errorCode || "ACCESS_SUSPENDED";
  const errorMessage = options.errorMessage ||
    "Der Zugang dieser Organisation wurde vom Betreiber gesperrt. Bitte den Support kontaktieren.";

  /* Benannt, siehe requireCompanyOrg oben. */
  return async function requireOrgNotSuspendedMiddleware(req, res, next) {
    try {
      if (!req.orgId) {
        return res.status(400).json({ error: "ORG_CONTEXT_REQUIRED" });
      }
      if (await isOrgAccessSuspended(pool, req.orgId)) {
        logger.warn(
          { orgId: req.orgId, userId: req.session?.userId || null },
          "Org access suspended — request blocked"
        );
        return res.status(403).json({ error: errorCode, message: errorMessage });
      }
      next();
    } catch (err) {
      logger.error({ err }, "Org-suspension guard failed");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  };
}

/**
 * IST DAS EINE ARBEITERSITZUNG? — EINE Wahrheit fuer beide Riegel.
 *
 * `verweigereArbeiter` (einzelne Wege) und `arbeiterRiegel` (der ganze
 * v1-Router, M2.6) muessen sich EXAKT gleich entscheiden. Zwei Kopien dieser
 * drei Zeilen waeren ein Riegel, der an einer Stelle greift und an der anderen
 * nicht — und man saehe es nicht, weil beide fuer sich richtig aussehen.
 *
 * Gelesen werden ZWEI Quellen, und beide zaehlen:
 *   `orgMembership.role_key` / `orgRole`  die Rolle IN DER ORG. Der Normalfall:
 *       `acceptInvite` setzt `role_key='worker'` auf die Org der Zeitarbeitsfirma.
 *   `session.userRole`                    die Rolle des KONTOS. Sie greift auch
 *       dort, wo noch keine Mitgliedschaft aufgeloest ist.
 *
 * Ein `||` und kein `&&`: wer nach EINER der beiden Quellen Arbeiter ist, ist
 * Arbeiter. Die andere Richtung waere ein Riegel, den ein fehlendes Feld oeffnet.
 */
export function arbeiterSitzung(req) {
  const rolle = String(req?.orgMembership?.role_key || req?.orgRole || "").trim().toLowerCase();
  const sitzungsRolle = String(req?.session?.userRole || "").trim().toLowerCase();
  return { rolle, sitzungsRolle, istArbeiter: rolle === "worker" || sitzungsRolle === "worker" };
}

/**
 * Verweigert eine Sitzung, die als ARBEITER in der Org sitzt.
 *
 * Ein Arbeiter entsteht in `workerService.acceptInvite` als Mitglied in der Org
 * SEINER ZEITARBEITSFIRMA (`INSERT INTO org_memberships … role_key='worker'` mit
 * der `supplier_org_id` der Einladung). Er bekommt keine eigene Org — seine
 * Sitzung traegt `req.orgId` = die Kennung der Firma. Gemessen in der Datenbank
 * am 2026-09-02: 31 Menschen in einer Agentur-Org, 3 in einer Unternehmens-Org.
 *
 * Fuer jede Route, die den ORG-Kontext verwaltet, heisst das: der Arbeiter steht
 * ohne weiteres Zutun im Kontext seines Arbeitgebers. Wo eine Route nur `requireAuth`
 * und ein PLAN-Tor traegt — und das Tor prueft den Plan der FIRMA, nicht den
 * Menschen —, wirkt er auf die Firma.
 *
 * Bewusst nicht `requirePermission(...)`: das verlangte owner/admin und naehme den
 * Zugang auch program_manager, recruiter und dispatcher weg. Welche Rollen die
 * oeffentliche Darstellung fuehren duerfen, ist eine Produktfrage und gehoert dem
 * Owner (M2.6 in docs/features/M_MARKTPLATZ_FLOW.md). Dieser Riegel schliesst
 * genau das Gemessene und sonst nichts.
 *
 * Fail-closed nach beiden Seiten: keine Mitgliedschaft = kein Org-Kontext = 403.
 */
export function verweigereArbeiter(deps = {}, options = {}) {
  const { logger } = deps;
  const errorCode = options.errorCode || "WORKER_NOT_ALLOWED";
  const errorMessage = options.errorMessage
    || "Dieser Bereich gehoert zur Verwaltung der Organisation und steht Arbeitskraeften nicht offen.";

  return function verweigereArbeiterMiddleware(req, res, next) {
    const { rolle, sitzungsRolle, istArbeiter } = arbeiterSitzung(req);
    if (istArbeiter) {
      logger?.warn?.(
        { orgId: req.orgId || null, userId: req.session?.userId || null, rolle, sitzungsRolle },
        "Worker guard denied access"
      );
      return res.status(403).json({ error: errorCode, message: errorMessage });
    }
    return next();
  };
}
