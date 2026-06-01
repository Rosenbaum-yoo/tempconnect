import { Router } from "express";
import { clampInt, parseBool, safeQuery, safeScalar } from "./_helpers.js";

const AREA_PATTERNS = {
  infrastructure: "owner_control.infrastructure.%",
  decisions: "owner_control.decisions.%",
  commercial: "owner_control.commercial.%",
  support: "owner_control.support.%",
  platform: "owner_control.platform.%",
  warp: "owner_control.warp.%",
  automation: "owner_control.automation.%"
};

const VALID_RISK_LEVELS = new Set([ "critical", "high", "medium", "low" ]);

export function createOccAuditRouter(deps) {
  const { pool, logger } = deps;
  const router = Router();

  router.get("/audit/feed", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;

    const area = String(req.query.area || "").trim().toLowerCase();
    const riskLevel = String(req.query.risk_level || "").trim().toLowerCase();
    const decisionsOnly = parseBool(req.query.decisions_only, false);
    const search = String(req.query.search || "").trim();

    const where = [ "al.action LIKE 'owner_control.%'" ];
    const params = [];

    if (AREA_PATTERNS[area]) {
      params.push(AREA_PATTERNS[area]);
      where.push(`al.action LIKE $${params.length}`);
    }
    if (VALID_RISK_LEVELS.has(riskLevel)) {
      params.push(riskLevel);
      where.push(`LOWER(COALESCE(al.details->>'risk_level', '')) = $${params.length}`);
    }
    if (decisionsOnly) {
      where.push(
        "(al.action ILIKE '%decide%' OR al.action ILIKE '%approve%' OR al.action ILIKE '%reject%' OR al.action ILIKE '%triage%' OR al.action ILIKE '%close%')"
      );
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      where.push(`(al.action ILIKE $${idx} OR u.email ILIKE $${idx} OR al.entity_type ILIKE $${idx})`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    try {
      const total = Number(
        await safeScalar(
          pool,
          `SELECT COUNT(*)::int AS n
             FROM audit_log al
             LEFT JOIN users u ON u.id = al.actor_id
             ${whereClause}`,
          params,
          "n",
          0
        ) || 0
      );

      const queryParams = params.concat([perPage + 1, offset]);
      const rows = await safeQuery(
        pool,
        `SELECT al.id, al.created_at, al.actor_id, al.action, al.entity_type, al.entity_id,
                al.status, al.details, u.email AS actor_email
           FROM audit_log al
           LEFT JOIN users u ON u.id = al.actor_id
           ${whereClause}
          ORDER BY al.created_at DESC
          LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
        queryParams,
        []
      );

      const hasMore = rows.length > perPage;
      const items = hasMore ? rows.slice(0, perPage) : rows;

      return res.json({
        success: true,
        data: {
          items,
          total,
          page,
          per_page: perPage,
          has_more: hasMore
        },
        error: null
      });
    } catch (err) {
      logger?.warn?.({ err }, "OCC audit feed fallback (table/state missing)");
      return res.json({
        success: true,
        data: {
          items: [],
          total: 0,
          page,
          per_page: perPage,
          has_more: false
        },
        error: null
      });
    }
  });

  return router;
}
