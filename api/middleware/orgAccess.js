import { getMembership } from "../services/rbacService.js";

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
