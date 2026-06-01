import { Router } from "express";
import { clampInt, columnExists, maskEmail, safeQuery, safeScalar, toIsoOrNull } from "./_helpers.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function likeTerm(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return value ? `%${value}%` : null;
}

export function createOccDataExplorerRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/data-explorer/users", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;
    const searchTerm = likeTerm(req.query.search);
    const hasLastLoginAt = await columnExists(pool, "users", "last_login_at");

    const whereParts = [];
    const params = [];
    if (searchTerm) {
      params.push(searchTerm);
      whereParts.push(`(LOWER(u.email) LIKE $${params.length} OR LOWER(COALESCE(u.company_name, '')) LIKE $${params.length})`);
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const selectLastLogin = hasLastLoginAt ? "u.last_login_at" : "NULL::timestamptz AS last_login_at";

    const total = toInt(
      await safeScalar(pool, `SELECT COUNT(*)::int AS n FROM users u ${whereClause}`, params, "n", 0),
      0
    );

    params.push(perPage);
    params.push(offset);
    const rows = await safeQuery(
      pool,
      `SELECT u.id, u.email, u.company_name, u.created_at, ${selectLastLogin}, u.is_verified,
              COALESCE(sub.plan, 'FREE') AS plan,
              COALESCE(orgs.org_count, 0)::int AS org_count
         FROM users u
         LEFT JOIN LATERAL (
           SELECT s.plan
             FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.status = 'active'
            ORDER BY COALESCE(s.updated_at, s.created_at) DESC
            LIMIT 1
         ) sub ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS org_count
             FROM org_memberships om
            WHERE om.user_id = u.id
              AND om.is_active = TRUE
         ) orgs ON TRUE
         ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
      []
    );

    return res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          email: maskEmail(row.email),
          company_name: row.company_name || null,
          created_at: toIsoOrNull(row.created_at),
          last_login_at: toIsoOrNull(row.last_login_at),
          status: row.is_verified === false ? "pending_verification" : "active",
          plan: row.plan || "FREE",
          org_count: toInt(row.org_count, 0)
        })),
        total,
        page,
        per_page: perPage,
        has_more: offset + rows.length < total
      },
      error: null
    });
  });

  router.get("/data-explorer/organizations", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;
    const searchTerm = likeTerm(req.query.search);

    const whereParts = [];
    const params = [];
    if (searchTerm) {
      params.push(searchTerm);
      whereParts.push(`(LOWER(o.name) LIKE $${params.length} OR LOWER(o.slug) LIKE $${params.length})`);
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const total = toInt(
      await safeScalar(pool, `SELECT COUNT(*)::int AS n FROM organizations o ${whereClause}`, params, "n", 0),
      0
    );

    params.push(perPage);
    params.push(offset);
    const rows = await safeQuery(
      pool,
      `SELECT o.id, o.name, o.slug, o.type, o.plan, o.is_active, o.created_at, o.updated_at,
              COALESCE(m.members, 0)::int AS member_count,
              COALESCE(s.active_subscriptions, 0)::int AS active_subscriptions
         FROM organizations o
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS members
             FROM org_memberships om
            WHERE om.org_id = o.id
              AND om.is_active = TRUE
         ) m ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS active_subscriptions
             FROM users u
             JOIN subscriptions sb
               ON sb.user_id = u.id
              AND sb.status = 'active'
            WHERE u.org_id = o.id
         ) s ON TRUE
         ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
      []
    );

    return res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug || null,
          type: row.type || null,
          plan: row.plan || null,
          is_active: row.is_active !== false,
          created_at: toIsoOrNull(row.created_at),
          updated_at: toIsoOrNull(row.updated_at),
          member_count: toInt(row.member_count, 0),
          active_subscriptions: toInt(row.active_subscriptions, 0)
        })),
        total,
        page,
        per_page: perPage,
        has_more: offset + rows.length < total
      },
      error: null
    });
  });

  router.get("/data-explorer/subscriptions", async (req, res) => {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const perPage = clampInt(req.query.per_page, 1, 200, 30);
    const offset = (page - 1) * perPage;
    const searchTerm = likeTerm(req.query.search);

    const whereParts = [];
    const params = [];
    if (searchTerm) {
      params.push(searchTerm);
      const i = params.length;
      whereParts.push(
        `(LOWER(COALESCE(u.email, '')) LIKE $${i} OR LOWER(COALESCE(o.name, '')) LIKE $${i} OR LOWER(COALESCE(s.plan, '')) LIKE $${i} OR LOWER(COALESCE(s.status, '')) LIKE $${i})`
      );
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const total = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM subscriptions s
           LEFT JOIN users u ON u.id = s.user_id
           LEFT JOIN organizations o ON o.id = u.org_id
           ${whereClause}`,
        params,
        "n",
        0
      ),
      0
    );

    params.push(perPage);
    params.push(offset);
    const rows = await safeQuery(
      pool,
      `SELECT s.id, s.user_id, s.plan, s.status, s.current_period_start, s.current_period_end,
              s.cancel_at, s.canceled_at, s.created_at, s.updated_at,
              u.email AS user_email, o.id AS organization_id, o.name AS organization_name
         FROM subscriptions s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN organizations o ON o.id = u.org_id
         ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
      []
    );

    return res.json({
      success: true,
      data: {
        items: rows.map((row) => ({
          id: row.id,
          user_id: row.user_id || null,
          user_email: maskEmail(row.user_email),
          organization_id: row.organization_id || null,
          organization_name: row.organization_name || null,
          plan: row.plan || null,
          status: row.status || null,
          current_period_start: toIsoOrNull(row.current_period_start),
          current_period_end: toIsoOrNull(row.current_period_end),
          cancel_at: toIsoOrNull(row.cancel_at),
          canceled_at: toIsoOrNull(row.canceled_at),
          created_at: toIsoOrNull(row.created_at),
          updated_at: toIsoOrNull(row.updated_at)
        })),
        total,
        page,
        per_page: perPage,
        has_more: offset + rows.length < total
      },
      error: null
    });
  });

  router.get("/data-explorer/integrity-checks", async (_req, res) => {
    const orgsWithoutActiveSubscription = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM organizations o
          WHERE NOT EXISTS (
            SELECT 1
              FROM users u
              JOIN subscriptions s
                ON s.user_id = u.id
               AND s.status = 'active'
             WHERE u.org_id = o.id
          )`,
        [],
        "n",
        0
      ),
      0
    );
    const usersWithoutOrgMembership = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM users u
          WHERE NOT EXISTS (
            SELECT 1
              FROM org_memberships om
             WHERE om.user_id = u.id
               AND om.is_active = TRUE
          )`,
        [],
        "n",
        0
      ),
      0
    );
    const subscriptionsWithoutPayment = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM subscriptions s
          WHERE NOT EXISTS (
            SELECT 1
              FROM payment_sessions ps
             WHERE ps.user_id = s.user_id
               AND ps.status = 'completed'
          )`,
        [],
        "n",
        0
      ),
      0
    );
    const customOffersWithoutCommercialDecision = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM commercial_offers co
           LEFT JOIN occ_decisions od ON od.id = co.occ_decision_id
          WHERE co.occ_decision_id IS NULL
             OR od.id IS NULL`,
        [],
        "n",
        0
      ),
      0
    );
    const occDecisionsWithoutAudit = toInt(
      await safeScalar(
        pool,
        `SELECT COUNT(*)::int AS n
           FROM occ_decisions od
          WHERE NOT EXISTS (
            SELECT 1
              FROM audit_log al
             WHERE al.entity_type = 'occ_decision'
               AND al.entity_id = od.id::text
               AND al.action LIKE 'owner_control.%'
          )`,
        [],
        "n",
        0
      ),
      0
    );

    return res.json({
      success: true,
      data: {
        items: [
          { id: "integrity-1", name: "Orgs ohne aktive Subscription", count: orgsWithoutActiveSubscription },
          { id: "integrity-2", name: "User ohne Org-Mitgliedschaft", count: usersWithoutOrgMembership },
          { id: "integrity-3", name: "Subscriptions ohne zugehörige Payment", count: subscriptionsWithoutPayment },
          { id: "integrity-4", name: "Custom Offers ohne Commercial-Entscheidung", count: customOffersWithoutCommercialDecision },
          { id: "integrity-5", name: "OCC-Decisions ohne Audit-Eintrag", count: occDecisionsWithoutAudit }
        ]
      },
      error: null
    });
  });

  return router;
}
