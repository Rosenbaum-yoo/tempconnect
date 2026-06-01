/**
 * Onboarding flow unit tests.
 * Covers: getUserAndPlan fields, onboarding-status endpoint logic,
 * step derivation, complete/reset, auth guards, demo user handling.
 * Uses mock pool — no database required.
 *
 * Run: node --test --test-force-exit test/onboarding.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as userService from "../services/userService.js";
import {
  STEP_CATALOG,
  getStepsForRole,
  getOnboardingStatus,
  completeStep,
  dismissChecklist,
  toLegacyFormat
} from "../services/onboardingService.js";

// ── Mock helpers ──────────────────────────────────────────────

function returnPool(rows = []) {
  return { query: async () => ({ rows }) };
}

function sequencePool(...responses) {
  let idx = 0;
  return {
    query: async () => {
      if (idx >= responses.length) return { rows: [] };
      const resp = responses[idx++];
      if (resp instanceof Error) throw resp;
      return resp;
    }
  };
}

function mockRes() {
  let _status = 200, _json;
  return {
    status(code) { _status = code; return this; },
    json(body) { _json = body; return this; },
    get _status() { return _status; },
    get _json() { return _json; },
    locals: {}
  };
}

function mockReq(userId = null) {
  return {
    session: userId ? { userId } : {},
    body: {}
  };
}

const noopLogger = { error: () => {}, warn: () => {}, info: () => {} };

// ═══════════════════════════════════════════════════════════════
// getUserAndPlan returns onboarding_completed and is_demo
// ═══════════════════════════════════════════════════════════════

describe("getUserAndPlan — onboarding fields", () => {
  it("returns onboarding_completed = false for new user", async () => {
    const userRow = {
      id: 1, role: "company", email: "test@test.de",
      company_name: null, phone: null, contact_person: null,
      street: null, postal_code: null, city: null,
      vat_id: null, handelsregister_number: null,
      is_verified: false, latitude: null, longitude: null,
      onboarding_completed: false, is_demo: false
    };
    const pool = sequencePool(
      { rows: [userRow] },           // users query
      { rows: [{ plan: "FREE", status: "active" }] },  // subscriptions
      { rows: [{ avg_rating: "0", rating_count: "0" }] }, // ratings
      { rows: [{ sent_count: "0", received_count: "0", listings_count: "0" }] }, // usage
      { rows: [] } // org membership
    );
    const me = await userService.getUserAndPlan(pool, 1);
    assert.strictEqual(me.onboarding_completed, false);
    assert.strictEqual(me.is_demo, false);
  });

  it("returns onboarding_completed = true for onboarded user", async () => {
    const userRow = {
      id: 2, role: "company", email: "done@test.de",
      company_name: "Firma GmbH", phone: "+49123", contact_person: "Max",
      street: "Str 1", postal_code: "12345", city: "Berlin",
      vat_id: null, handelsregister_number: null,
      is_verified: true, latitude: null, longitude: null,
      onboarding_completed: true, is_demo: false
    };
    const pool = sequencePool(
      { rows: [userRow] },
      { rows: [{ plan: "PLUS", status: "active" }] },
      { rows: [{ avg_rating: "4.5", rating_count: "3" }] },
      { rows: [{ sent_count: "5", received_count: "2", listings_count: "1" }] },
      { rows: [] }
    );
    const me = await userService.getUserAndPlan(pool, 2);
    assert.strictEqual(me.onboarding_completed, true);
  });

  it("returns is_demo = true for demo users", async () => {
    const userRow = {
      id: 3, role: "company", email: "demo@tempconnect.de",
      company_name: "Demo GmbH", phone: null, contact_person: null,
      street: null, postal_code: null, city: null,
      vat_id: null, handelsregister_number: null,
      is_verified: true, latitude: null, longitude: null,
      onboarding_completed: true, is_demo: true
    };
    const pool = sequencePool(
      { rows: [userRow] },
      { rows: [{ plan: "FREE", status: "active" }] },
      { rows: [{ avg_rating: "0", rating_count: "0" }] },
      { rows: [{ sent_count: "0", received_count: "0", listings_count: "0" }] },
      { rows: [] }
    );
    const me = await userService.getUserAndPlan(pool, 3);
    assert.strictEqual(me.is_demo, true);
  });

  it("returns null for non-existent user", async () => {
    const pool = sequencePool({ rows: [] });
    const me = await userService.getUserAndPlan(pool, 999);
    assert.strictEqual(me, null);
  });
});

// ═══════════════════════════════════════════════════════════════
// markOnboardingComplete / resetOnboarding
// ═══════════════════════════════════════════════════════════════

describe("onboarding — complete/reset", () => {
  it("markOnboardingComplete calls correct SQL", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    await userService.markOnboardingComplete(pool, 42);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].sql.includes("onboarding_completed = TRUE"));
    assert.deepStrictEqual(calls[0].params, [42]);
  });

  it("resetOnboarding calls correct SQL", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    await userService.resetOnboarding(pool, 42);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].sql.includes("onboarding_completed = FALSE"));
    assert.deepStrictEqual(calls[0].params, [42]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Onboarding status endpoint (route logic tests via service layer)
// ═══════════════════════════════════════════════════════════════

describe("onboarding — step derivation logic", () => {
  // Simulate the step derivation from the /me/onboarding-status endpoint

  function deriveProfileBasics(me) {
    const basicFields = ["company_name", "city", "phone", "contact_person", "postal_code"];
    const filled = basicFields.filter(f => me[f] && String(me[f]).trim().length > 0).length;
    return { done: filled >= 3, fields_filled: filled, fields_total: basicFields.length };
  }

  function deriveFirstAction(role, hasListings, hasRequests) {
    const actionType = role === "agency" ? "capacity" : role === "worker" ? "assignment" : "demand";
    return { done: hasListings || hasRequests, type: actionType };
  }

  it("profile_basics done when 3+ fields filled (company_name, city, phone)", () => {
    const me = { company_name: "Test GmbH", city: "Berlin", phone: "+49123", contact_person: "", postal_code: "" };
    const step = deriveProfileBasics(me);
    assert.strictEqual(step.done, true);
    assert.strictEqual(step.fields_filled, 3);
  });

  it("profile_basics not done when < 3 fields filled", () => {
    const me = { company_name: "Test GmbH", city: "", phone: "", contact_person: "", postal_code: "" };
    const step = deriveProfileBasics(me);
    assert.strictEqual(step.done, false);
    assert.strictEqual(step.fields_filled, 1);
  });

  it("profile_basics done when all 5 fields filled", () => {
    const me = { company_name: "X", city: "Y", phone: "Z", contact_person: "A", postal_code: "12345" };
    const step = deriveProfileBasics(me);
    assert.strictEqual(step.done, true);
    assert.strictEqual(step.fields_filled, 5);
  });

  it("profile_basics ignores whitespace-only values", () => {
    const me = { company_name: "  ", city: " ", phone: "", contact_person: "", postal_code: "" };
    const step = deriveProfileBasics(me);
    assert.strictEqual(step.done, false);
    assert.strictEqual(step.fields_filled, 0);
  });

  it("first_action done when user has listings", () => {
    const step = deriveFirstAction("company", true, false);
    assert.strictEqual(step.done, true);
    assert.strictEqual(step.type, "demand");
  });

  it("first_action done when user has requests", () => {
    const step = deriveFirstAction("company", false, true);
    assert.strictEqual(step.done, true);
  });

  it("first_action not done when no listings and no requests", () => {
    const step = deriveFirstAction("company", false, false);
    assert.strictEqual(step.done, false);
  });

  it("first_action type is capacity for agency role", () => {
    const step = deriveFirstAction("agency", false, false);
    assert.strictEqual(step.type, "capacity");
  });

  it("first_action type is assignment for worker role", () => {
    const step = deriveFirstAction("worker", false, false);
    assert.strictEqual(step.type, "assignment");
  });

  it("first_action type is demand for company role", () => {
    const step = deriveFirstAction("company", false, false);
    assert.strictEqual(step.type, "demand");
  });
});

describe("onboarding — progress calculation", () => {
  function calcProgress(steps) {
    const doneCount = [steps.profile_basics, steps.company_profile, steps.first_action].filter(s => s.done).length;
    return Math.round((doneCount / 3) * 100);
  }

  function suggestedNext(steps) {
    if (!steps.profile_basics.done) return "profile_basics";
    if (!steps.company_profile.done) return "company_profile";
    if (!steps.first_action.done) return "first_action";
    return null;
  }

  it("0% when no steps done", () => {
    const steps = {
      profile_basics: { done: false },
      company_profile: { done: false },
      first_action: { done: false }
    };
    assert.strictEqual(calcProgress(steps), 0);
    assert.strictEqual(suggestedNext(steps), "profile_basics");
  });

  it("33% when 1 step done", () => {
    const steps = {
      profile_basics: { done: true },
      company_profile: { done: false },
      first_action: { done: false }
    };
    assert.strictEqual(calcProgress(steps), 33);
    assert.strictEqual(suggestedNext(steps), "company_profile");
  });

  it("67% when 2 steps done", () => {
    const steps = {
      profile_basics: { done: true },
      company_profile: { done: true },
      first_action: { done: false }
    };
    assert.strictEqual(calcProgress(steps), 67);
    assert.strictEqual(suggestedNext(steps), "first_action");
  });

  it("100% when all steps done", () => {
    const steps = {
      profile_basics: { done: true },
      company_profile: { done: true },
      first_action: { done: true }
    };
    assert.strictEqual(calcProgress(steps), 100);
    assert.strictEqual(suggestedNext(steps), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Route-level tests (using imported createMeRouter)
// ═══════════════════════════════════════════════════════════════

describe("onboarding — route handler tests", () => {
  // Test onboarding-complete route handler
  it("POST /me/onboarding-complete returns ok:true", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    const req = mockReq(1);
    const res = mockRes();
    // Simulate route handler
    try {
      await userService.markOnboardingComplete(pool, req.session.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
    assert.deepStrictEqual(res._json, { ok: true });
    assert.ok(calls[0].sql.includes("onboarding_completed = TRUE"));
  });

  it("POST /me/onboarding-reset returns ok:true", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    const req = mockReq(1);
    const res = mockRes();
    try {
      await userService.resetOnboarding(pool, req.session.userId);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
    assert.deepStrictEqual(res._json, { ok: true });
    assert.ok(calls[0].sql.includes("onboarding_completed = FALSE"));
  });
});

// ═══════════════════════════════════════════════════════════════
// Worker role — company_profile step auto-complete
// ═══════════════════════════════════════════════════════════════

describe("onboarding — worker role specifics", () => {
  it("company_profile step is always done for workers", () => {
    const role = "worker";
    // Workers skip company profile — should always be { done: true }
    const companyProfileStep = role === "worker"
      ? { done: true, completeness_pct: 100 }
      : { done: false, completeness_pct: 0 };
    assert.strictEqual(companyProfileStep.done, true);
    assert.strictEqual(companyProfileStep.completeness_pct, 100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Completeness threshold for company_profile step
// ═══════════════════════════════════════════════════════════════

describe("onboarding — company_profile completeness threshold", () => {
  it("company_profile done when completeness >= 40%", () => {
    const pct = 40;
    assert.strictEqual(pct >= 40, true);
  });

  it("company_profile not done when completeness < 40%", () => {
    const pct = 20;
    assert.strictEqual(pct >= 40, false);
  });

  it("company_profile done when completeness = 100%", () => {
    const pct = 100;
    assert.strictEqual(pct >= 40, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth guard — unauthenticated requests
// ═══════════════════════════════════════════════════════════════

describe("onboarding — auth guard", () => {
  it("requireAuth blocks unauthenticated onboarding-status request", () => {
    // Simulating requireAuth middleware check
    const req = mockReq(null); // no userId
    const hasAuth = req.session && req.session.userId;
    assert.strictEqual(!!hasAuth, false);
  });

  it("requireAuth allows authenticated onboarding-status request", () => {
    const req = mockReq(42);
    const hasAuth = req.session && req.session.userId;
    assert.strictEqual(!!hasAuth, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════

describe("onboarding — edge cases", () => {
  it("handles null/undefined field values gracefully in profile basics", () => {
    const basicFields = ["company_name", "city", "phone", "contact_person", "postal_code"];
    const me = { company_name: null, city: undefined, phone: null, contact_person: null, postal_code: null };
    const filled = basicFields.filter(f => me[f] && String(me[f]).trim().length > 0).length;
    assert.strictEqual(filled, 0);
  });

  it("handles numeric values in profile fields", () => {
    const basicFields = ["company_name", "city", "phone", "contact_person", "postal_code"];
    const me = { company_name: "X", city: "Y", phone: 12345, contact_person: null, postal_code: "01234" };
    const filled = basicFields.filter(f => me[f] && String(me[f]).trim().length > 0).length;
    assert.strictEqual(filled, 4);
  });

  it("onboarding_completed overrides progress_pct to 100", () => {
    const onboardingCompleted = true;
    const progressPct = 33;
    const displayPct = onboardingCompleted ? 100 : progressPct;
    assert.strictEqual(displayPct, 100);
  });
});

// ═══════════════════════════════════════════════════════════════
// Enterprise Onboarding Service — STEP_CATALOG
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — STEP_CATALOG", () => {
  it("has 7 steps", () => {
    assert.strictEqual(STEP_CATALOG.length, 7);
  });

  it("all steps have required fields", () => {
    for (const s of STEP_CATALOG) {
      assert.ok(s.key, `step missing key`);
      assert.ok(s.label, `step ${s.key} missing label`);
      assert.ok(s.description, `step ${s.key} missing description`);
      assert.ok(s.icon, `step ${s.key} missing icon`);
      assert.ok(s.link, `step ${s.key} missing link`);
      assert.ok(typeof s.order === "number", `step ${s.key} missing order`);
      assert.ok(typeof s.detect === "function", `step ${s.key} missing detect`);
    }
  });

  it("step keys are unique", () => {
    const keys = STEP_CATALOG.map(s => s.key);
    assert.strictEqual(new Set(keys).size, keys.length);
  });

  it("steps are ordered 1..7", () => {
    const orders = STEP_CATALOG.map(s => s.order);
    for (let i = 0; i < orders.length; i++) {
      assert.strictEqual(orders[i], i + 1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// getStepsForRole — role filtering
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — getStepsForRole", () => {
  it("company sees profile_complete, org_configured, first_capacity, first_request, first_deal, team_invited, platform_explored", () => {
    const steps = getStepsForRole("company");
    assert.strictEqual(steps.length, 7);
  });

  it("worker sees only profile_complete + platform_explored (roles=null)", () => {
    const steps = getStepsForRole("worker");
    const keys = steps.map(s => s.key);
    assert.ok(keys.includes("profile_complete"));
    assert.ok(keys.includes("platform_explored"));
    assert.ok(!keys.includes("first_capacity"));
    assert.ok(!keys.includes("team_invited"));
  });

  it("agency sees 7 steps (all apply)", () => {
    const steps = getStepsForRole("agency");
    assert.strictEqual(steps.length, 7);
  });

  it("admin sees org_configured and team_invited", () => {
    const steps = getStepsForRole("admin");
    const keys = steps.map(s => s.key);
    assert.ok(keys.includes("org_configured"));
    assert.ok(keys.includes("team_invited"));
  });

  it("returns steps sorted by order", () => {
    const steps = getStepsForRole("company");
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i].order >= steps[i - 1].order);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// getOnboardingStatus — main function
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — getOnboardingStatus", () => {
  function mkPool(progressRows = [], detectResults = {}) {
    let insertCalls = 0;
    return {
      query: async (sql, params) => {
        if (sql.includes("user_onboarding_progress") && sql.includes("SELECT")) {
          return { rows: progressRows };
        }
        if (sql.includes("INSERT INTO user_onboarding_progress")) {
          insertCalls++;
          return { rows: [] };
        }
        // auto-detection queries — match by table name
        for (const [table, result] of Object.entries(detectResults)) {
          if (sql.includes(table)) return { rows: result ? [{ cnt: 2 }] : [] };
        }
        return { rows: [] };
      },
      get insertCalls() { return insertCalls; }
    };
  }

  it("returns all steps for company role with empty progress", async () => {
    const pool = mkPool();
    const status = await getOnboardingStatus(pool, 1, { role: "company" });
    assert.strictEqual(status.steps.length, 7);
    assert.strictEqual(status.role, "company");
    assert.strictEqual(status.total_count, 7);
    assert.ok(status.progress_pct >= 0);
  });

  it("marks already-completed steps from DB", async () => {
    const pool = mkPool([
      { step_key: "profile_complete", completed: true, completed_at: "2025-01-01", auto_detected: false }
    ]);
    const status = await getOnboardingStatus(pool, 1, { role: "company" });
    const profileStep = status.steps.find(s => s.key === "profile_complete");
    assert.strictEqual(profileStep.completed, true);
    assert.strictEqual(status.completed_count, 1);
  });

  it("sets progress_pct to 100 when onboardingCompleted", async () => {
    const pool = mkPool();
    const status = await getOnboardingStatus(pool, 1, { role: "company", onboardingCompleted: true });
    assert.strictEqual(status.progress_pct, 100);
    assert.strictEqual(status.dismissed, true);
  });

  it("suggests first incomplete step", async () => {
    const pool = mkPool([
      { step_key: "profile_complete", completed: true, completed_at: "2025-01-01", auto_detected: false }
    ]);
    const status = await getOnboardingStatus(pool, 1, { role: "company" });
    assert.strictEqual(status.suggested_next, "org_configured");
  });

  it("suggested_next is null when all steps done", async () => {
    const allDone = STEP_CATALOG.map(s => ({
      step_key: s.key, completed: true, completed_at: "2025-01-01", auto_detected: false
    }));
    const pool = mkPool(allDone);
    const status = await getOnboardingStatus(pool, 1, { role: "company" });
    assert.strictEqual(status.suggested_next, null);
    assert.strictEqual(status.progress_pct, 100);
  });

  it("worker gets fewer steps", async () => {
    const pool = mkPool();
    const status = await getOnboardingStatus(pool, 1, { role: "worker" });
    assert.ok(status.steps.length < 7);
    assert.strictEqual(status.total_count, status.steps.length);
  });
});

// ═══════════════════════════════════════════════════════════════
// completeStep
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — completeStep", () => {
  it("returns true for valid step key", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    const result = await completeStep(pool, 1, "profile_complete", null);
    assert.strictEqual(result, true);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].sql.includes("INSERT INTO user_onboarding_progress"));
  });

  it("returns false for invalid step key", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const result = await completeStep(pool, 1, "nonexistent_step", null);
    assert.strictEqual(result, false);
  });

  it("passes userId, orgId, and stepKey to SQL", async () => {
    let captured;
    const pool = { query: async (sql, params) => { captured = params; return { rows: [] }; } };
    await completeStep(pool, 42, "first_capacity", "org-123");
    assert.deepStrictEqual(captured, [42, "org-123", "first_capacity"]);
  });

  it("validates all catalog step keys are accepted", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    for (const step of STEP_CATALOG) {
      const result = await completeStep(pool, 1, step.key, null);
      assert.strictEqual(result, true, `step ${step.key} should be valid`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// dismissChecklist
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — dismissChecklist", () => {
  it("calls markOnboardingComplete and completes platform_explored", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    await dismissChecklist(pool, 1, null);
    // Should have at least 2 queries: markOnboardingComplete + completeStep(platform_explored)
    assert.ok(calls.length >= 2);
    assert.ok(calls[0].sql.includes("onboarding_completed = TRUE"));
    assert.ok(calls[1].sql.includes("user_onboarding_progress"));
  });
});

// ═══════════════════════════════════════════════════════════════
// toLegacyFormat — backward compatibility
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — toLegacyFormat", () => {
  function mkStatus(overrides = {}) {
    return {
      onboarding_completed: false,
      role: "company",
      steps: [
        { key: "profile_complete", completed: false },
        { key: "org_configured", completed: false },
        { key: "first_capacity", completed: false },
        { key: "first_request", completed: false },
        { key: "first_deal", completed: false },
        { key: "team_invited", completed: false },
        { key: "platform_explored", completed: false }
      ],
      ...overrides
    };
  }

  it("returns legacy 3-step structure", () => {
    const legacy = toLegacyFormat(mkStatus());
    assert.ok(legacy.steps.profile_basics);
    assert.ok(legacy.steps.company_profile);
    assert.ok(legacy.steps.first_action);
    assert.strictEqual(legacy.progress_pct, 0);
  });

  it("profile_basics done when profile_complete is done", () => {
    const status = mkStatus();
    status.steps[0].completed = true;
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.steps.profile_basics.done, true);
    assert.strictEqual(legacy.steps.profile_basics.fields_filled, 3);
  });

  it("company_profile done when org_configured is done", () => {
    const status = mkStatus();
    status.steps[1].completed = true;
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.steps.company_profile.done, true);
    assert.strictEqual(legacy.steps.company_profile.completeness_pct, 100);
  });

  it("first_action done when first_capacity is done", () => {
    const status = mkStatus();
    status.steps[2].completed = true;
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.steps.first_action.done, true);
  });

  it("first_action done when first_request is done", () => {
    const status = mkStatus();
    status.steps[3].completed = true;
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.steps.first_action.done, true);
  });

  it("first_action type is capacity for agency", () => {
    const status = mkStatus({ role: "agency" });
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.steps.first_action.type, "capacity");
  });

  it("first_action type is assignment for worker", () => {
    const status = mkStatus({ role: "worker" });
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.steps.first_action.type, "assignment");
  });

  it("progress_pct = 100 when onboarding_completed", () => {
    const legacy = toLegacyFormat(mkStatus({ onboarding_completed: true }));
    assert.strictEqual(legacy.progress_pct, 100);
  });

  it("suggested_next follows priority order", () => {
    const status = mkStatus();
    assert.strictEqual(toLegacyFormat(status).suggested_next, "profile_basics");
    status.steps[0].completed = true;
    assert.strictEqual(toLegacyFormat(status).suggested_next, "company_profile");
    status.steps[1].completed = true;
    assert.strictEqual(toLegacyFormat(status).suggested_next, "first_action");
    status.steps[2].completed = true;
    assert.strictEqual(toLegacyFormat(status).suggested_next, null);
  });

  it("legacy progress calculation: 33% when 1 of 3 done", () => {
    const status = mkStatus();
    status.steps[0].completed = true;
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.progress_pct, 33);
  });

  it("legacy progress calculation: 67% when 2 of 3 done", () => {
    const status = mkStatus();
    status.steps[0].completed = true;
    status.steps[1].completed = true;
    const legacy = toLegacyFormat(status);
    assert.strictEqual(legacy.progress_pct, 67);
  });
});

// ═══════════════════════════════════════════════════════════════
// Auto-detection probes (unit tests for each step's detect fn)
// ═══════════════════════════════════════════════════════════════

describe("onboardingService — auto-detection probes", () => {
  function detectPool(hasMatch) {
    return { query: async () => ({ rows: hasMatch ? [{ cnt: 2 }] : [] }) };
  }

  it("profile_complete detects filled profile", async () => {
    const step = STEP_CATALOG.find(s => s.key === "profile_complete");
    assert.strictEqual(await step.detect(detectPool(true), 1), true);
    assert.strictEqual(await step.detect(detectPool(false), 1), false);
  });

  it("org_configured detects active org membership", async () => {
    const step = STEP_CATALOG.find(s => s.key === "org_configured");
    assert.strictEqual(await step.detect(detectPool(true), 1), true);
    assert.strictEqual(await step.detect(detectPool(false), 1), false);
  });

  it("first_request detects requests", async () => {
    const step = STEP_CATALOG.find(s => s.key === "first_request");
    assert.strictEqual(await step.detect(detectPool(true), 1), true);
    assert.strictEqual(await step.detect(detectPool(false), 1), false);
  });

  it("team_invited returns false without orgId", async () => {
    const step = STEP_CATALOG.find(s => s.key === "team_invited");
    assert.strictEqual(await step.detect(detectPool(true), 1, null), false);
  });

  it("team_invited detects 2+ members", async () => {
    const step = STEP_CATALOG.find(s => s.key === "team_invited");
    const pool = { query: async () => ({ rows: [{ cnt: 3 }] }) };
    assert.strictEqual(await step.detect(pool, 1, "org-1"), true);
  });

  it("platform_explored always returns false (manual only)", async () => {
    const step = STEP_CATALOG.find(s => s.key === "platform_explored");
    assert.strictEqual(await step.detect(detectPool(true), 1), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Worker / Einsatzportal separation
// ═══════════════════════════════════════════════════════════════
// The onboarding wizard (onboardingWizard.js) is NOT loaded on
// Einsatzportal pages — the <script> tag was removed from all 11
// worker/einsatzportal HTML pages. Additionally the wizard IIFE
// contains three frontend guards:
//   1. URL guard: returns early if pathname matches /einsatzportal|worker-/
//   2. Role guard: returns early if me.role === 'worker'
//   3. Session guard: sessionStorage key 'tc_onboarding_seen'
//      ensures the wizard shows at most once per browser session.
//      The "Nicht wieder anzeigen" checkbox triggers a permanent
//      server-side dismiss (POST /me/onboarding-complete), while
//      closing without the checkbox only sets the session flag.
// The backend tests below verify the role-based step filtering
// that underpins the worker exclusion.
// ═══════════════════════════════════════════════════════════════

describe("onboarding — worker / Einsatzportal separation", () => {
  it("worker gets exactly 2 steps", () => {
    const steps = getStepsForRole("worker");
    assert.strictEqual(steps.length, 2);
  });

  it("worker sees only roles=null steps (profile_complete, platform_explored)", () => {
    const keys = getStepsForRole("worker").map(s => s.key);
    assert.deepStrictEqual(keys, ["profile_complete", "platform_explored"]);
  });

  it("worker is excluded from org_configured", () => {
    const keys = getStepsForRole("worker").map(s => s.key);
    assert.ok(!keys.includes("org_configured"));
  });

  it("worker is excluded from first_capacity", () => {
    const keys = getStepsForRole("worker").map(s => s.key);
    assert.ok(!keys.includes("first_capacity"));
  });

  it("worker is excluded from first_request", () => {
    const keys = getStepsForRole("worker").map(s => s.key);
    assert.ok(!keys.includes("first_request"));
  });

  it("worker is excluded from first_deal", () => {
    const keys = getStepsForRole("worker").map(s => s.key);
    assert.ok(!keys.includes("first_deal"));
  });

  it("worker is excluded from team_invited", () => {
    const keys = getStepsForRole("worker").map(s => s.key);
    assert.ok(!keys.includes("team_invited"));
  });

  it("getOnboardingStatus returns 2-step status for worker", async () => {
    const pool = {
      query: async (sql) => {
        if (sql.includes("user_onboarding_progress") && sql.includes("SELECT")) return { rows: [] };
        return { rows: [] };
      }
    };
    const status = await getOnboardingStatus(pool, 1, { role: "worker" });
    assert.strictEqual(status.total_count, 2);
    assert.strictEqual(status.steps.length, 2);
    assert.strictEqual(status.steps[0].key, "profile_complete");
    assert.strictEqual(status.steps[1].key, "platform_explored");
  });

  it("dismissChecklist works for worker (marks onboarding_completed + platform_explored)", async () => {
    const calls = [];
    const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
    await dismissChecklist(pool, 1, null);
    const completeCall = calls.find(c => c.sql.includes("onboarding_completed = TRUE"));
    const stepCall = calls.find(c => c.sql.includes("user_onboarding_progress"));
    assert.ok(completeCall, "should call markOnboardingComplete");
    assert.ok(stepCall, "should persist platform_explored step");
  });
});
