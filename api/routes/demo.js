/**
 * Demo-Modus Routen
 * — Rollen-basierter Login (buyer / agency / admin)  ← primär
 * — Plan-basierter Login (ENTERPRISE / PLUS / …)     ← Fallback
 * — Demo-Reset (bereinigt Session-Daten)
 */
import { Router } from "express";

/* ── Rollen-basierte Demo-Accounts (primär) ───────────── */
const ROLE_ACCOUNTS = {
  buyer:  "demo-buyer@tempconnect.de",
  agency: "demo-agency@tempconnect.de",
  admin:  "demo-admin@tempconnect.de"
};
const VALID_ROLES = Object.keys(ROLE_ACCOUNTS);

/* ── Plan-basierte Demo-Accounts (Legacy-Fallback) ────── */
const PLAN_ACCOUNTS = {
  ENTERPRISE: "demo-buyer@tempconnect.de",
  PLUS:       "demo-buyer2@tempconnect.de",
  PRO:        "demo-agency2@tempconnect.de",
  BASIS:      "demo-agency3@tempconnect.de"
};
const VALID_PLANS = Object.keys(PLAN_ACCOUNTS);

/* ── Seed-ID-Prefix: Alles mit d0_______ sind Seed-Daten ─ */
const _DEMO_USER_IDS = [
  "d0a00000-0000-0000-0000-000000000001",
  "d0a00000-0000-0000-0000-000000000002",
  "d0a00000-0000-0000-0000-000000000003",
  "d0a00000-0000-0000-0000-000000000004",
  "d0a00000-0000-0000-0000-000000000005",
  "d0a00000-0000-0000-0000-000000000006"
];

/**
 * @param {{ pool, logger, getUserAndPlan, authLimiter }} deps
 */
export function createDemoRouter(deps) {
  const { pool, logger, getUserAndPlan, authLimiter } = deps;
  const router = Router();

  /* ── Shared: Lookup + Session erstellen ─────────────────── */
  async function loginDemoUser(email, meta, req, res) {
    const { rows } = await pool.query(
      "SELECT id, role FROM users WHERE email = $1 AND is_demo = TRUE",
      [email]
    );
    if (!rows[0]) {
      // Ohne Adresse: `meta` traegt bereits `{ role }` bzw. `{ plan }`, und genau das
      // ist die Diagnose — welches Demokonto in der Datenbank fehlt. Die Adresse kam
      // ohnehin aus der festen Tabelle ROLE_ACCOUNTS/PLAN_ACCOUNTS und war im Log
      // redundant (Audit-Backlog S-2).
      logger.warn({ ...meta }, "Demo-User nicht gefunden");
      return res.status(404).json({
        error: "DEMO_USER_NOT_FOUND",
        message: "Demo-Benutzer nicht verfügbar."
      });
    }
    const user = rows[0];
    req.session.userId   = user.id;
    req.session.userRole = user.role;
    req.session.isDemo   = true;

    const me = await getUserAndPlan(user.id);
    res.locals.audit = {
      action: "demo.login",
      entity_type: "user",
      entity_id: user.id,
      details: { ...meta, email }
    };
    logger.info({ ...meta, userId: user.id }, "Demo-Login erfolgreich");
    return res.json({ ...me, is_demo: true });
  }

  /* ── POST /api/auth/demo-login ─────────────────────────── */
  // Akzeptiert { role: "buyer" } ODER { plan: "ENTERPRISE" } (Legacy)
  // SEC-008: Rate-limit to prevent session exhaustion
  router.post("/auth/demo-login", authLimiter, async (req, res) => {
    try {
      res.locals.audit = {
        action: "demo.login_attempt",
        entity_type: "user",
        entity_id: req.session?.userId || null,
        details: { role: req.body?.role || null, plan: req.body?.plan || null }
      };
      /* Pfad 1 — Rollen-basiert (primär) */
      const role = String(req.body?.role || "").toLowerCase();
      if (VALID_ROLES.includes(role)) {
        return await loginDemoUser(ROLE_ACCOUNTS[role], { role }, req, res);
      }

      /* Pfad 2 — Plan-basiert (Legacy-Fallback) */
      const plan = String(req.body?.plan || "").toUpperCase();
      if (VALID_PLANS.includes(plan)) {
        return await loginDemoUser(PLAN_ACCOUNTS[plan], { plan }, req, res);
      }

      /* Weder role noch plan gültig */
      return res.status(400).json({
        error: "INVALID_DEMO_LOGIN",
        message: `Rolle (${VALID_ROLES.join(", ")}) oder Plan (${VALID_PLANS.join(", ")}) erforderlich.`
      });
    } catch (e) {
      logger.error({ err: e }, "POST /api/auth/demo-login");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── POST /api/demo/reset  (bereinigt Session-Daten) ──── */
  router.post("/demo/reset", async (req, res) => {
    if (!req.session?.isDemo) {
      return res.status(403).json({ error: "DEMO_ONLY" });
    }
    try {
      const userId = req.session.userId;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Lösche Daten, die während der Demo-Session erstellt wurden
        // (Seed-Daten haben feste d0*-IDs und werden beim nächsten Login
        //  durch ON CONFLICT DO NOTHING wieder korrekt erkannt)
        await client.query(
          `DELETE FROM requests    WHERE requester_id = $1 AND id NOT LIKE 'd0%'`,
          [userId]
        );
        await client.query(
          `DELETE FROM listings    WHERE owner_id = $1     AND id NOT LIKE 'd0%'`,
          [userId]
        );
        await client.query(
          `DELETE FROM ratings     WHERE rater_id = $1     AND id NOT LIKE 'd0%'`,
          [userId]
        );
        await client.query(
          `DELETE FROM notifications WHERE user_id = $1    AND id NOT LIKE 'd0%'`,
          [userId]
        );

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      logger.info({ userId }, "Demo-Reset durchgeführt");
      res.json({ ok: true, message: "Demo-Daten wurden zurückgesetzt." });
    } catch (e) {
      logger.error({ err: e }, "POST /api/demo/reset");
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  });

  /* ── GET /api/demo/accounts (öffentlich, für demo.html) ── */
  router.get("/demo/accounts", (_req, res) => {
    res.json({
      roles: VALID_ROLES,
      plans: VALID_PLANS,
      accounts: {
        buyer:  { label: "Einkäufer / Buyer",       company: "Nordbau Industrie GmbH",  plan: "ENTERPRISE" },
        agency: { label: "Personaldienstleister",   company: "ElektroStaff GmbH",       plan: "ENTERPRISE" },
        admin:  { label: "Administrator",            company: "Nordbau Industrie GmbH",  plan: "ENTERPRISE" }
      }
    });
  });

  return router;
}
