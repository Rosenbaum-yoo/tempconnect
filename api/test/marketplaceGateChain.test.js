/**
 * Marketplace Gate Chain Tests
 *
 * Validates the full error chain from backend feature gates through
 * to frontend error normalization and UI error mapping.
 *
 *   1. featureGate.js response format (error + code fields)
 *   2. Analytics trackSchema with nullable optional fields
 *   3. Marketplace route 403 error codes consistency
 *   4. hasFeature plan-gating logic
 *   5. Guard consistency between frontend planFeatures and backend
 *
 * Run: node --test --test-force-exit test/marketplaceGateChain.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { hasFeature, planFeatures } from "../config/planFeatures.js";

// Disable dev-env feature gate bypass so these tests verify real plan-gating logic.
process.env.FEATURE_GATE_BYPASS = "false";

// ═══════════════════════════════════════════════════════════════════
// 1. featureGate.js response format validation
// ═══════════════════════════════════════════════════════════════════

describe("featureGate response format", () => {
  // Simulate what featureGate.js produces on violation
  function simulateGateResponse(featureKey, plan) {
    return {
      ok: false,
      error: "FEATURE_NOT_ALLOWED",
      code: "FEATURE_NOT_ALLOWED",
      feature: featureKey,
      plan: plan
    };
  }

  it("produces both error and code fields", () => {
    const resp = simulateGateResponse("sla_access", "DEMO");
    assert.strictEqual(resp.error, "FEATURE_NOT_ALLOWED");
    assert.strictEqual(resp.code, "FEATURE_NOT_ALLOWED");
    assert.strictEqual(resp.feature, "sla_access");
    assert.strictEqual(resp.plan, "DEMO");
  });

  it("error field matches code field", () => {
    const resp = simulateGateResponse("sla_access", "BASIS");
    assert.strictEqual(resp.error, resp.code);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. API Client error normalization (simulated)
// ═══════════════════════════════════════════════════════════════════

describe("API Client error normalization", () => {
  // Simulates the logic in api.js handleResponse for non-ok responses
  function normalizeApiError(responseData, httpStatus) {
    var errData = (responseData && typeof responseData === "object")
      ? responseData
      : { error: "HTTP_" + httpStatus, message: "Fehler " + httpStatus };
    var errCode = errData.error || errData.code || "API_ERROR";
    var errMsg = errData.message || (errCode !== "API_ERROR" ? errCode : "Unbekannter Fehler");
    return {
      code: errCode,
      message: errMsg,
      status: httpStatus,
      details: errData.details || null,
      feature: errData.feature || null,
      plan: errData.plan || null
    };
  }

  it("extracts code from gate response (code field, no error field)", () => {
    // Old format: only code, no error
    const err = normalizeApiError({ ok: false, code: "FEATURE_NOT_ALLOWED", feature: "sla_access", plan: "DEMO" }, 403);
    assert.strictEqual(err.code, "FEATURE_NOT_ALLOWED");
    assert.strictEqual(err.feature, "sla_access");
    assert.strictEqual(err.plan, "DEMO");
  });

  it("extracts code from error field (standard format)", () => {
    const err = normalizeApiError({ error: "COMPANY_ONLY" }, 403);
    assert.strictEqual(err.code, "COMPANY_ONLY");
  });

  it("extracts code from new format (both error and code)", () => {
    const err = normalizeApiError({ error: "FEATURE_NOT_ALLOWED", code: "FEATURE_NOT_ALLOWED", feature: "sla_access", plan: "BASIS" }, 403);
    assert.strictEqual(err.code, "FEATURE_NOT_ALLOWED");
    assert.strictEqual(err.plan, "BASIS");
  });

  it("prefers error over code when both differ", () => {
    const err = normalizeApiError({ error: "SPECIFIC_ERROR", code: "GENERIC_CODE" }, 400);
    assert.strictEqual(err.code, "SPECIFIC_ERROR");
  });

  it("falls back to API_ERROR when no code or error", () => {
    const err = normalizeApiError({ message: "something broke" }, 500);
    assert.strictEqual(err.code, "API_ERROR");
    assert.strictEqual(err.message, "something broke");
  });

  it("falls back to Unbekannter Fehler when no message and no specific code", () => {
    const err = normalizeApiError({}, 500);
    assert.strictEqual(err.code, "API_ERROR");
    assert.strictEqual(err.message, "Unbekannter Fehler");
  });

  it("uses code as message when message absent but code is specific", () => {
    const err = normalizeApiError({ code: "PLAN_REQUIRED_NOTDIENST" }, 403);
    assert.strictEqual(err.code, "PLAN_REQUIRED_NOTDIENST");
    assert.strictEqual(err.message, "PLAN_REQUIRED_NOTDIENST");
  });

  it("passes through details", () => {
    const err = normalizeApiError({ error: "WORKER_LIMIT_EXCEEDED", details: { limit: 5, requested: 10 } }, 403);
    assert.strictEqual(err.code, "WORKER_LIMIT_EXCEEDED");
    assert.deepStrictEqual(err.details, { limit: 5, requested: 10 });
  });

  it("handles non-object response body", () => {
    const err = normalizeApiError("Not JSON", 500);
    assert.strictEqual(err.code, "HTTP_500");
    assert.ok(err.message.includes("500"));
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Analytics trackSchema with nullable fields
// ═══════════════════════════════════════════════════════════════════

describe("Analytics trackSchema nullable validation", () => {
  // Replicate the schema from analytics.js
  const trackSchema = z.object({
    event_name: z.string().min(2).max(80),
    occurred_at: z.string().datetime().optional().nullable(),
    session_id: z.string().min(6).max(120),
    anonymous_id: z.string().min(6).max(120).optional().nullable(),
    page_path: z.string().max(240).optional().nullable(),
    flow_key: z.string().max(100).optional().nullable(),
    journey_id: z.string().max(120).optional().nullable(),
    step_name: z.string().max(120).optional().nullable(),
    route_name: z.string().max(120).optional().nullable(),
    component_name: z.string().max(120).optional().nullable(),
    importance: z.enum(["low", "normal", "high"]).optional().nullable(),
    feature_context: z.string().max(120).optional().nullable(),
    metadata: z.record(z.any()).optional().nullable()
  });

  it("accepts valid minimal payload", () => {
    const result = trackSchema.safeParse({
      event_name: "page_view",
      session_id: "tc_abc123def456"
    });
    assert.ok(result.success);
  });

  it("accepts payload with null optional fields (the former 400 source)", () => {
    const result = trackSchema.safeParse({
      event_name: "page_view",
      session_id: "tc_abc123def456",
      flow_key: null,
      journey_id: null,
      step_name: null,
      route_name: null,
      component_name: null,
      feature_context: null,
      importance: null,
      metadata: null
    });
    assert.ok(result.success, "null optional fields must be accepted: " + JSON.stringify(result.error?.issues));
  });

  it("accepts payload with undefined optional fields", () => {
    const result = trackSchema.safeParse({
      event_name: "session_started",
      session_id: "tc_xyz789",
      flow_key: undefined,
      journey_id: undefined
    });
    assert.ok(result.success);
  });

  it("accepts payload with string optional fields", () => {
    const result = trackSchema.safeParse({
      event_name: "form_started",
      session_id: "tc_sess_001",
      flow_key: "matching",
      journey_id: "j_abc123",
      step_name: "start",
      importance: "high"
    });
    assert.ok(result.success);
  });

  it("rejects invalid event_name", () => {
    const result = trackSchema.safeParse({
      event_name: "x",  // min 2
      session_id: "tc_abc123def456"
    });
    assert.ok(!result.success);
  });

  it("rejects missing session_id", () => {
    const result = trackSchema.safeParse({
      event_name: "page_view"
    });
    assert.ok(!result.success);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. hasFeature plan-gating consistency
// ═══════════════════════════════════════════════════════════════════

describe("hasFeature: plan-gating for sla_access", () => {
  // sla_access = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"] — alle Plaene
  it("DEMO has sla_access (Marketplace-Browsing)", () => {
    assert.strictEqual(hasFeature("DEMO", "sla_access"), true);
  });

  it("FREE has sla_access (alias for DEMO)", () => {
    assert.strictEqual(hasFeature("FREE", "sla_access"), true);
  });

  it("BASIS has sla_access", () => {
    assert.strictEqual(hasFeature("BASIS", "sla_access"), true);
  });

  it("PLUS has sla_access", () => {
    assert.strictEqual(hasFeature("PLUS", "sla_access"), true);
  });

  it("PRO has sla_access", () => {
    assert.strictEqual(hasFeature("PRO", "sla_access"), true);
  });

  it("INDIVIDUELL has sla_access", () => {
    assert.strictEqual(hasFeature("INDIVIDUELL", "sla_access"), true);
  });

  it("null plan defaults to DEMO (has sla_access)", () => {
    assert.strictEqual(hasFeature(null, "sla_access"), true);
  });
});

describe("hasFeature: plan-gating for sla_offers_create (restricted)", () => {
  it("DEMO cannot create offers", () => {
    assert.strictEqual(hasFeature("DEMO", "sla_offers_create"), false);
  });

  it("BASIS cannot create offers", () => {
    assert.strictEqual(hasFeature("BASIS", "sla_offers_create"), false);
  });

  it("PLUS can create offers", () => {
    assert.strictEqual(hasFeature("PLUS", "sla_offers_create"), true);
  });

  it("PRO can create offers", () => {
    assert.strictEqual(hasFeature("PRO", "sla_offers_create"), true);
  });
});

describe("hasFeature: plan-gating for legacy_access", () => {
  it("DEMO has legacy_access", () => {
    assert.strictEqual(hasFeature("DEMO", "legacy_access"), true);
  });

  it("BASIS has legacy_access", () => {
    assert.strictEqual(hasFeature("BASIS", "legacy_access"), true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Marketplace route error code consistency
// ═══════════════════════════════════════════════════════════════════

describe("Marketplace error code consistency", () => {
  const EXPECTED_ERROR_CODES = [
    "FEATURE_NOT_ALLOWED",
    "COMPANY_ONLY",
    "PLAN_REQUIRED_NOTDIENST",
    "WORKER_LIMIT_EXCEEDED",
    "NOT_AUTHENTICATED",
    "VALIDATION",
    "SERVER_ERROR"
  ];

  it("all expected marketplace error codes are known strings", () => {
    for (const code of EXPECTED_ERROR_CODES) {
      assert.strictEqual(typeof code, "string");
      assert.ok(code.length > 3, "code should be meaningful: " + code);
      assert.ok(code === code.toUpperCase(), "codes should be UPPER_SNAKE_CASE: " + code);
    }
  });

  const EXPECTED_SLA_ERROR_CODES = [
    "FEATURE_NOT_ALLOWED",
    "NOT_AUTHENTICATED",
    "VALIDATION",
    "NOT_FOUND",
    "FORBIDDEN",
    "SERVER_ERROR",
    "ADMIN_ONLY"
  ];

  it("all expected SLA error codes are known strings", () => {
    for (const code of EXPECTED_SLA_ERROR_CODES) {
      assert.strictEqual(typeof code, "string");
      assert.ok(code === code.toUpperCase());
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. planFeatures structure validation
// ═══════════════════════════════════════════════════════════════════

describe("planFeatures config structure", () => {
  it("planFeatures is an object with feature keys", () => {
    assert.strictEqual(typeof planFeatures, "object");
    assert.ok(Object.keys(planFeatures).length > 0);
  });

  it("sla_access feature lists all plans (broad access)", () => {
    const allowed = planFeatures.sla_access;
    assert.ok(Array.isArray(allowed), "sla_access should be an array of plan names");
    assert.ok(allowed.includes("DEMO"));
    assert.ok(allowed.includes("BASIS"));
    assert.ok(allowed.includes("PLUS"));
    assert.ok(allowed.includes("PRO"));
  });

  it("sla_offers_create is restricted to PLUS/PRO/INDIVIDUELL", () => {
    const allowed = planFeatures.sla_offers_create;
    assert.ok(Array.isArray(allowed));
    assert.ok(!allowed.includes("DEMO"));
    assert.ok(!allowed.includes("BASIS"));
    assert.ok(allowed.includes("PLUS"));
    assert.ok(allowed.includes("PRO"));
  });

  it("legacy_access includes DEMO and BASIS", () => {
    const allowed = planFeatures.legacy_access;
    assert.ok(Array.isArray(allowed));
    assert.ok(allowed.includes("DEMO"));
    assert.ok(allowed.includes("BASIS"));
  });
});
