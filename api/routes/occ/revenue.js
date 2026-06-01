import { Router } from "express";
import { getPlanByKey, normalizePlanKey } from "../../config/planCatalog.js";

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function safeRows(pool, sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows || [];
  } catch {
    return [];
  }
}

async function safeScalar(pool, sql, params, key, fallback) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows?.[0]?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function createOccRevenueRouter(deps) {
  const { pool } = deps;
  const router = Router();

  router.get("/revenue/summary", async (_req, res) => {
    const subscriptionRows = await safeRows(
      pool,
      `SELECT COALESCE(plan, 'DEMO') AS plan, COUNT(*)::int AS count
         FROM subscriptions
        WHERE status = 'active'
        GROUP BY COALESCE(plan, 'DEMO')
        ORDER BY count DESC, plan ASC`
    );

    const completedPayments30dEur = toInt(await safeScalar(
      pool,
      `SELECT COALESCE(ROUND(SUM(amount)::numeric, 0), 0)::int AS amount_eur
         FROM payment_sessions
        WHERE status = 'completed'
          AND created_at > NOW() - INTERVAL '30 days'`,
      [],
      "amount_eur",
      0
    ), 0);

    const planBreakdown = subscriptionRows.map((row) => {
      const planKey = normalizePlanKey(row.plan, { fallback: "DEMO" });
      const plan = getPlanByKey(planKey);
      const count = toInt(row.count, 0);
      const monthlyPriceCents = plan?.monthly_price_cents ?? 0;
      const mrrContribution = Math.round((count * monthlyPriceCents) / 100);
      return {
        plan: planKey,
        count,
        mrr_contribution: mrrContribution
      };
    });

    const activeSubscriptions = planBreakdown.reduce((sum, row) => sum + row.count, 0);
    const mrrEur = planBreakdown.reduce((sum, row) => sum + row.mrr_contribution, 0);
    const offersPendingApproval = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM commercial_offers
        WHERE status = 'pending'`,
      [],
      "n",
      0
    ), 0);
    const customOffersActive = toInt(await safeScalar(
      pool,
      `SELECT COUNT(*)::int AS n
         FROM commercial_offers
        WHERE status IN ('approved', 'active')`,
      [],
      "n",
      0
    ), 0);

    return res.json({
      success: true,
      data: {
        kpis: {
          mrr_eur: mrrEur,
          arr_eur: mrrEur * 12,
          active_subscriptions: activeSubscriptions,
          completed_payments_30d_eur: completedPayments30dEur
        },
        plan_breakdown: planBreakdown,
        offers_pending_approval: offersPendingApproval,
        custom_offers_active: customOffersActive
      },
      error: null
    });
  });

  return router;
}
