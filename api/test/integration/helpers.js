/**
 * Integration test helpers.
 *
 * All integration tests require a live PostgreSQL database.
 * Set DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD) to enable them.
 * Without DB they skip automatically.
 */

import supertest from "supertest";
import { Pool } from "pg";
import { createApp } from "../../app.js";

// ─── Guard ────────────────────────────────────────────────────────────────────
export const hasDb = !!(
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.POSTGRES_PASSWORD)
);

/**
 * Skips the current test if no DB is configured.
 * Call inside `before()` or at the top of a test.
 * @param {import('node:test').TestContext} t
 */
export function skipIfNoDb(t) {
  if (!hasDb) {
    t.skip("No database — set DATABASE_URL to run integration tests");
  }
}

// ─── App / agent factory ──────────────────────────────────────────────────────

/** Build the Express app once and cache it per process. */
let _app = null;
export async function getApp() {
  if (!_app) _app = await createApp();
  return _app;
}

/**
 * Returns a Supertest agent that retains cookies across requests.
 * Each call produces a NEW agent (fresh session).
 */
export async function makeAgent() {
  const app = await getApp();
  return supertest.agent(app);
}

// ─── CSRF ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the CSRF token for the given agent's session.
 * Must be called after any state-changing request sequence.
 * @param {import('supertest').SuperAgentTest} agent
 * @returns {Promise<string>} token
 */
export async function getCsrf(agent) {
  const res = await agent.get("/api/csrf").expect(200);
  return res.body.token;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** Generates a unique test email that won't clash with real data. */
export function uniqueEmail() {
  return `integration-${Date.now()}-${Math.random().toString(36).slice(2)}@test.tempconnect.invalid`;
}

/**
 * Registers a new user and returns { agent, csrfToken, email, password, user }.
 * The agent is already authenticated (session cookie set).
 * @param {{ role?: string, company_name?: string }} [overrides]
 */
export async function registerUser(overrides = {}) {
  const agent = await makeAgent();
  const csrfToken = await getCsrf(agent);
  const email = uniqueEmail();
  const password = "IntegrationTest123!";

  const res = await agent
    .post("/api/auth/register")
    .set("x-csrf-token", csrfToken)
    .send({
      role: "company",
      email,
      password,
      company_name: overrides.company_name || "Test Company GmbH",
      ...overrides
    });

  return { agent, csrfToken, email, password, user: res.body, statusCode: res.status };
}

/**
 * Registers AND logs in a user (guarantees a fresh authenticated session).
 * Handles the case where the register response doesn't contain user data by
 * doing a subsequent login.
 */
export async function registerAndLogin(overrides = {}) {
  const { agent, email, password } = await registerUser(overrides);

  // Refresh CSRF token post-registration
  const csrfToken = await getCsrf(agent);

  // Re-login to guarantee a clean auth state
  const loginRes = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", csrfToken)
    .send({ email, password })
    .expect(200);

  const freshCsrf = await getCsrf(agent);
  return { agent, csrfToken: freshCsrf, email, password, user: loginRes.body };
}

// ─── Direct DB pool (for cleanup) ────────────────────────────────────────────

/**
 * Creates a raw pg.Pool for test data cleanup.
 * Caller is responsible for calling pool.end() in after().
 */
export function createPool() {
  const ssl = (process.env.PGSSLMODE || "").toLowerCase() === "require"
    ? { ssl: { rejectUnauthorized: false } }
    : {};

  return new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ...ssl }
      : {
          host: process.env.DB_HOST || "localhost",
          port: Number(process.env.DB_PORT) || 5432,
          database: process.env.POSTGRES_DB || "tempconnect",
          user: process.env.POSTGRES_USER || "tempconnect",
          password: process.env.POSTGRES_PASSWORD,
          ...ssl
        }
  );
}

/**
 * Deletes a test user and ALL related data by email.
 * Cascade covers the full schema — safe to call even if tables/rows don't exist.
 */
export async function cleanupUser(pool, email) {
  if (!pool || !email) return;
  try {
    const res = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (res.rows.length === 0) return;
    const userId = res.rows[0].id;
    // Clean in dependency order — each table tolerates non-existence
    const tables = [
      "DELETE FROM audit_log WHERE actor_id = $1",
      "DELETE FROM capacity_reservations WHERE id IN (SELECT id FROM capacity_reservations cr JOIN capacity_posts cp ON cr.capacity_id = cp.id WHERE cp.supplier_company_id IN (SELECT id FROM users WHERE id = $1))",
      "DELETE FROM capacity_posts WHERE supplier_company_id = $1",
      "DELETE FROM requisitions WHERE created_by = $1",
      "DELETE FROM requests WHERE requester_id = $1 OR receiver_id = $1",
      "DELETE FROM listings WHERE owner_id = $1",
      "DELETE FROM payment_sessions WHERE user_id = $1",
      "DELETE FROM invoices WHERE user_id = $1",
      "DELETE FROM subscriptions WHERE user_id = $1",
      "DELETE FROM org_memberships WHERE user_id = $1",
      "DELETE FROM notifications WHERE user_id = $1",
      "DELETE FROM session WHERE sess::text LIKE $1"
    ];
    for (const sql of tables) {
      // session cleanup uses LIKE pattern, all others use UUID
      const param = sql.includes("LIKE") ? `%${userId}%` : userId;
      await pool.query(sql, [param]).catch(() => {});
    }
    await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => {});
  } catch {
    // Non-critical — test data cleanup is best-effort
  }
}

/**
 * Ensures a user has a specific subscription plan.
 * Upserts into subscriptions table. Useful for feature-gate tests.
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {string} plan - e.g. 'FREE', 'BASIS', 'PLUS', 'PRO'
 */
export async function ensureSubscription(pool, userId, plan) {
  // Kanonisierung: subscriptions_plan_check/organizations kennen kein FREE — Alias auf DEMO
  // (gleiche Semantik wie normalizePlanKey; Downgrade-Tests meinen den Einstiegsplan).
  const p = plan === "FREE" ? "DEMO" : plan;

  // 1) User-Subscription: UPDATE→INSERT statt ON CONFLICT — subscriptions hat KEINEN
  //    Unique-Constraint auf user_id (nur btree-Index), ON CONFLICT (user_id) wirft daher
  //    immer und wurde frueher still verschluckt (Plan blieb DEMO).
  const upd = await pool.query(
    "UPDATE subscriptions SET plan = $1, status = 'active', updated_at = NOW() WHERE user_id = $2",
    [p, userId]
  ).catch(() => ({ rowCount: 0 }));
  if (!upd.rowCount) {
    await pool.query(
      "INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, $2, 'active')",
      [userId, p]
    ).catch(() => {});
  }

  // 2) Org-Plan: der EFFEKTIVE Plan ist org-first (userService: basePlan = org_plan || dbPlan)
  //    — die Registrierung legt die Org mit plan=DEMO an; ohne diesen Schritt sieht die App
  //    weiterhin DEMO, egal was in subscriptions steht (CAN-1-Root-Cause).
  await pool.query(
    `UPDATE organizations SET plan = $1
      WHERE id IN (
        SELECT org_id FROM org_memberships WHERE user_id = $2 AND is_active = TRUE
        UNION
        SELECT org_id FROM users WHERE id = $2 AND org_id IS NOT NULL
      )`,
    [p, userId]
  ).catch(() => {});
}

/**
 * Registers AND logs in an agency user (role: 'agency').
 * Needed for tests that require agency-specific behavior (e.g. supply listings, capacities).
 */
export async function registerAndLoginAgency(overrides = {}) {
  return registerAndLogin({ role: "agency", company_name: "Test Agency GmbH", ...overrides });
}

/**
 * Registers AND logs in a user with a specific plan.
 * Registration defaults to FREE, so we upsert the plan via ensureSubscription.
 * @param {import('pg').Pool} pool
 * @param {string} plan - e.g. 'PLUS', 'PRO', 'INDIVIDUELL'
 * @param {object} [overrides]
 */
export async function registerAndLoginWithPlan(pool, plan, overrides = {}) {
  const result = await registerAndLogin(overrides);
  if (plan && plan !== "FREE") {
    await ensureSubscription(pool, result.user.id, plan);
  }
  return result;
}

/**
 * Creates a standalone supplier organization and returns its id.
 * Used when contract / timesheet tests need a buyer_org_id ≠ supplier_org_id.
 * The org is created directly via SQL (no user registration needed).
 * @param {import('pg').Pool} pool
 * @param {string} [name]
 * @returns {Promise<string>} org id
 */
export async function createSupplierOrg(pool, name) {
  const slug = `test-supplier-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { rows } = await pool.query(
    `INSERT INTO organizations (name, slug, type, plan)
     VALUES ($1, $2, 'agency', 'INDIVIDUELL')
     RETURNING id`,
    [name || "Test Supplier GmbH", slug]
  );
  return rows[0].id;
}

/**
 * Resolves the org_id for a given user from the users table.
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getUserOrgId(pool, userId) {
  const { rows } = await pool.query("SELECT org_id FROM users WHERE id = $1", [userId]);
  return rows[0]?.org_id || null;
}
