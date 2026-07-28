/**
 * Subscription / Feature-Gating Flow Integration Tests
 *
 * Covers:
 *  - FREE user → 403 on SLA-only endpoints (capacities)
 *  - FREE user → can access legacy_access endpoints (listings)
 *  - Plan upgrade to PLUS → SLA endpoints become accessible
 *  - Plan upgrade persists in DB (subscriptions table verified)
 *  - Downgrade to FREE → SLA access revoked again
 *
 * Requires: DATABASE_URL (or DB_HOST + POSTGRES_PASSWORD)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  hasDb,
  registerAndLogin,
  registerAndLoginAgency,
  createPool,
  cleanupUser,
  ensureSubscription
} from "./helpers.js";

// C-01: FEATURE_GATE_BYPASS=true (Docker-Dev) macht Feature-Gates BEWUSST durchlaessig
// (dokumentiertes Verhalten, vgl. CLAUDE.md P1-B). Die Gating-Assertions sind env-aware:
// im Bypass-Env wird der Bypass-Kontrakt (200) exakt geprueft, in strikten Envs (CI)
// bleibt das harte 403-Denial inkl. Fehler-Shape erzwungen. KEIN Abschwaechen —
// beide Zweige asserten praezise. (Naiver Env-Flip wurde 2026-06-07 als nicht
// tragfaehig verifiziert: Router-Build-Zeit-Gates lesen das Flag nicht zur Request-Zeit.)
const GATE_BYPASS = String(process.env.FEATURE_GATE_BYPASS || "").trim().toLowerCase() === "true";

describe("Subscription Feature-Gating Flow", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
  });

  after(async () => {
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool?.end();
  });

  // ── FREE plan: legacy access allowed, SLA blocked ───────────────────────

  it("FREE user can access GET /api/listings (legacy_access)", async () => {
    const { agent, email } = await registerAndLogin();
    createdEmails.push(email);

    const res = await agent.get("/api/listings");
    assert.strictEqual(res.status, 200, "FREE plan should grant legacy_access");
    assert.ok(Array.isArray(res.body));
  });

  it("DEMO darf den SLA-Marktplatz ansehen — die Schranke liegt beim Einstellen", async () => {
    const { agent, email } = await registerAndLogin();
    createdEmails.push(email);

    // `sla_access` gilt laut Plan-Matrix fuer JEDEN Plan, inklusive DEMO
    // ("Marketplace browsing (DEMO can view/browse but not create)"). Wer nicht
    // sehen darf, was es zu kaufen gaebe, wird auch nichts kaufen. Die
    // Bezahlschranke sitzt eine Stufe weiter: `sla_offers_create` (PLUS+),
    // geprueft im Test darunter und in den Upgrade-/Downgrade-Tests.
    const res = await agent.get("/api/capacities");
    assert.strictEqual(res.status, 200, `DEMO soll browsen duerfen, bekam ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body) || Array.isArray(res.body?.items), "Erwartet eine Liste");
  });

  it("FREE agency user gets 403 on POST /api/capacities", async () => {
    const { agent, csrfToken, email } = await registerAndLoginAgency();
    createdEmails.push(email);

    const res = await agent
      .post("/api/capacities")
      .set("x-csrf-token", csrfToken)
      .send({
        role: "Fachkraft Lager",
        region: "Berlin",
        available_from: "2026-04-01",
        available_workers: 5
      });

    if (GATE_BYPASS) {
      // Bypass-Env: das Feature-Gate ist bewusst offen — dahinter greift deterministisch
      // das Org-Limit (DEMO-Org: listings-Kontingent 0) mit 429 PLAN_LIMIT_REACHED.
      assert.strictEqual(res.status, 429, "Bypass-Env: Org-Limit statt Feature-Gate erwartet");
      assert.strictEqual(res.body.error?.code, "PLAN_LIMIT_REACHED");
      assert.strictEqual(res.body.error?.metric, "listings");
    } else {
      assert.strictEqual(res.status, 403, "FREE agency should not create capacities");
      assert.strictEqual(res.body.code, "FEATURE_NOT_ALLOWED");
    }
  });

  // ── Upgrade to PLUS: SLA access granted ─────────────────────────────────

  it("Upgrade auf PLUS schaltet das Veroeffentlichen frei", async () => {
    const { agent, csrfToken, email, user } = await registerAndLoginAgency();
    createdEmails.push(email);
    const payload = {
      role: "Fachkraft Lager", region: "Berlin",
      available_from: "2026-04-01", available_workers: 5
    };

    // Vorher gesperrt — im Bypass-Env greift stattdessen deterministisch das
    // Org-Limit (DEMO: listings-Kontingent 0).
    const before = await agent.post("/api/capacities").set("x-csrf-token", csrfToken).send(payload);
    if (GATE_BYPASS) {
      assert.strictEqual(before.status, 429, "Bypass-Env: Org-Limit statt Feature-Gate erwartet");
    } else {
      assert.strictEqual(before.status, 403, "DEMO darf nicht einstellen");
      assert.strictEqual(before.body.code, "FEATURE_NOT_ALLOWED");
    }

    await ensureSubscription(pool, user.id, "PLUS");

    // Nachher offen: PLUS bringt `sla_offers_create` UND ein Kontingent (20).
    const after = await agent.post("/api/capacities").set("x-csrf-token", csrfToken).send(payload);
    assert.ok([200, 201].includes(after.status),
      `PLUS muss veroeffentlichen duerfen, bekam ${after.status}: ${JSON.stringify(after.body)}`);
  });

  it("PLUS agency user can POST /api/capacities", async () => {
    const { agent, csrfToken, email, user } = await registerAndLoginAgency();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PLUS");

    const res = await agent
      .post("/api/capacities")
      .set("x-csrf-token", csrfToken)
      .send({
        role: "Fachkraft Lager",
        region: "Berlin",
        available_from: "2026-04-01",
        available_workers: 5
      });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, "Created capacity should have an ID");
    assert.strictEqual(res.body.role, "Fachkraft Lager");
    assert.strictEqual(res.body.region, "Berlin");
  });

  // ── DB persistence check ────────────────────────────────────────────────

  it("subscription upgrade persists in DB", async () => {
    const { email, user } = await registerAndLogin();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PRO");

    const result = await pool.query(
      "SELECT plan, status FROM subscriptions WHERE user_id = $1",
      [user.id]
    );

    assert.ok(result.rows.length > 0, "Subscription row must exist");
    assert.strictEqual(result.rows[0].plan, "PRO");
    assert.strictEqual(result.rows[0].status, "active");
  });

  // ── Downgrade: access revoked ───────────────────────────────────────────

  it("Downgrade auf DEMO nimmt das Veroeffentlichen wieder weg", async () => {
    const { agent, csrfToken, email, user } = await registerAndLoginAgency();
    createdEmails.push(email);
    const payload = {
      role: "Helfer Montage", region: "Hamburg",
      available_from: "2026-04-01", available_workers: 3
    };

    await ensureSubscription(pool, user.id, "PLUS");
    const granted = await agent.post("/api/capacities").set("x-csrf-token", csrfToken).send(payload);
    assert.ok([200, 201].includes(granted.status),
      `PLUS muss veroeffentlichen duerfen, bekam ${granted.status}: ${JSON.stringify(granted.body)}`);

    await ensureSubscription(pool, user.id, "FREE");
    const revoked = await agent.post("/api/capacities").set("x-csrf-token", csrfToken).send(payload);
    if (GATE_BYPASS) {
      // Bypass-Env: Feature-Gate offen, aber DEMO hat Kontingent 0 — der Entzug
      // ist trotzdem wirksam, nur mit anderem Fehlercode.
      assert.strictEqual(revoked.status, 429, "Bypass-Env: Org-Limit muss weiterhin greifen");
    } else {
      assert.strictEqual(revoked.status, 403, "DEMO darf nach dem Downgrade nicht mehr einstellen");
      assert.strictEqual(revoked.body.code, "FEATURE_NOT_ALLOWED");
    }
  });

  // ── PLUS user still has legacy_access ───────────────────────────────────

  it("PLUS user loses legacy_access (PLUS not in legacy_access plans)", async () => {
    const { agent, email, user } = await registerAndLogin();
    createdEmails.push(email);

    await ensureSubscription(pool, user.id, "PLUS");

    // PLUS is NOT in the legacy_access plan list [FREE, BASIS]
    // So listings should be blocked for PLUS users (im Bypass-Env bewusst offen)
    const res = await agent.get("/api/listings");
    assert.strictEqual(res.status, GATE_BYPASS ? 200 : 403,
      "PLUS plan is not in legacy_access — listings should be blocked (ausser Bypass-Env)");
  });
});
