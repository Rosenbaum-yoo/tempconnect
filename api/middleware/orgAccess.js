import { getMembership } from "../services/rbacService.js";
import { isOrgAccessSuspended } from "../services/orgAccessSuspensionService.js";

export function requireCompanyOrg(deps, options = {}) {
  const { pool, logger } = deps;
  const errorCode = options.errorCode || "BUYER_ORG_REQUIRED";
  const errorMessage = options.errorMessage || "Dieser Bereich steht nur fuer Unternehmensorganisationen zur Verfuegung.";

  return async (req, res, next) => {
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
      if (orgType && orgType !== "company") {
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

  return async (req, res, next) => {
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
    const rolle = String(req.orgMembership?.role_key || req.orgRole || "").trim().toLowerCase();
    const sitzungsRolle = String(req.session?.userRole || "").trim().toLowerCase();
    if (rolle === "worker" || sitzungsRolle === "worker") {
      logger?.warn?.(
        { orgId: req.orgId || null, userId: req.session?.userId || null, rolle, sitzungsRolle },
        "Worker guard denied access"
      );
      return res.status(403).json({ error: errorCode, message: errorMessage });
    }
    return next();
  };
}
