import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveCustomerSegment,
  sanitizeMetadata,
  normalizeTrackPayload,
  resolveLifecycleSegment,
  getFunnel,
  getDashboardPresets,
  startFunnel,
  trackFunnelStep,
  completeFunnel,
  abandonFunnel,
  getSessionToCompletionTime,
  getRoleConversionComparison,
  runDailyAnalyticsRollup,
  cleanupAnalyticsRetention
} from "../services/productAnalyticsService.js";

describe("productAnalyticsService deriveCustomerSegment", () => {
  it("classifies demo by plan", () => {
    assert.equal(deriveCustomerSegment({ plan: "DEMO", isDemo: false, orgName: "" }), "demo");
  });

  it("classifies pilot by org name", () => {
    assert.equal(deriveCustomerSegment({ plan: "PRO", isDemo: false, orgName: "Pilotkunde Alpha" }), "pilot");
  });

  it("classifies live by default", () => {
    assert.equal(deriveCustomerSegment({ plan: "ENTERPRISE", isDemo: false, orgName: "Acme GmbH" }), "live");
  });

  it("prefers explicit stage over heuristic", () => {
    assert.equal(deriveCustomerSegment({ plan: "DEMO", isDemo: true, orgName: "Pilotkunde", explicitStage: "live" }), "live");
  });
});

describe("productAnalyticsService sanitizeMetadata", () => {
  it("drops sensitive keys", () => {
    const cleaned = sanitizeMetadata({ email: "a@b.de", password: "x", duration_ms: 1200, nested: { a: 1 } });
    assert.equal(cleaned.email, undefined);
    assert.equal(cleaned.password, undefined);
    assert.equal(cleaned.duration_ms, 1200);
    assert.equal(cleaned.nested, undefined);
  });
});

describe("productAnalyticsService normalizeTrackPayload", () => {
  it("normalizes and categorizes payload", () => {
    const out = normalizeTrackPayload({
      event_name: "page_view",
      session_id: "sess_123456",
      metadata: { duration_ms: 100, token: "secret", random: "drop" }
    });
    assert.equal(out.event_name, "page_view");
    assert.equal(out.event_category, "page");
    assert.equal(out.metadata.duration_ms, 100);
    assert.equal(out.metadata.token, undefined);
    assert.equal(out.metadata.random, undefined);
  });
});

describe("productAnalyticsService resolveLifecycleSegment", () => {
  it("resolves explicit stage first", () => {
    assert.equal(resolveLifecycleSegment({ explicitStage: "pilot", plan: "DEMO" }), "pilot");
  });
});

describe("productAnalyticsService getFunnel", () => {
  it("returns step counts for known funnel", async () => {
    const pool = {
      query: async (_sql, params) => {
        const event = params[params.length - 1];
        const map = {
          signup_started: 10,
          signup_completed: 6,
          login_success: 5
        };
        return { rows: [{ sessions: map[event] || 0 }] };
      }
    };
    const items = await getFunnel(pool, "registration_to_usage", 30, null);
    assert.equal(items.length, 3);
    assert.equal(items[0].sessions, 10);
    assert.equal(items[2].sessions, 5);
  });

  it("throws for unknown funnel", async () => {
    await assert.rejects(() => getFunnel({ query: async () => ({ rows: [] }) }, "foo", 30, null));
  });
});

describe("productAnalyticsService dashboard presets", () => {
  it("returns preset list", () => {
    const presets = getDashboardPresets();
    assert.ok(Array.isArray(presets));
    assert.ok(presets.length >= 3);
    assert.ok(presets.some((p) => p.key === "demo_usage"));
  });
});

describe("productAnalyticsService funnel wrappers", () => {
  function mockReq() {
    return { sessionID: "sess_srv_1", path: "/api/demo", originalUrl: "/api/demo", session: { userId: "u1" }, orgId: null };
  }

  it("start/step/complete/abandon call through tracking", async () => {
    const sqls = [];
    const pool = {
      query: async (sql) => {
        sqls.push(sql);
        if (sql.includes("FROM users")) return { rows: [{ id: "u1", role: "admin", plan: "DEMO", is_demo: true, org_id: null }] };
        return { rows: [{ id: "x", sessions: 1 }] };
      }
    };
    const req = mockReq();
    const started = await startFunnel(pool, req, "onboarding", {});
    await trackFunnelStep(pool, req, "onboarding", "profile", { journey_id: started.journey_id });
    await completeFunnel(pool, req, "onboarding", { journey_id: started.journey_id });
    await abandonFunnel(pool, req, "onboarding", { journey_id: started.journey_id, reason: "test" });
    assert.ok(sqls.some((s) => s.includes("INSERT INTO product_analytics_events")));
  });
});

describe("productAnalyticsService additional analytics reads", () => {
  it("returns session-to-completion rows", async () => {
    const pool = {
      query: async () => ({ rows: [{ flow_name: "onboarding", journeys: 10, avg_completion_ms: 120000, p50_completion_ms: 90000 }] })
    };
    const rows = await getSessionToCompletionTime(pool, { days: 30 });
    assert.equal(rows[0].flow_name, "onboarding");
  });

  it("returns role conversion with percentage", async () => {
    const pool = {
      query: async () => ({ rows: [{ user_role: "company_admin", flow_key: "onboarding", started_sessions: 10, completed_sessions: 7 }] })
    };
    const rows = await getRoleConversionComparison(pool, { days: 30 });
    assert.equal(rows[0].conversion_pct, 70);
  });
});

describe("productAnalyticsService retention/rollups", () => {
  it("runs rollup query", async () => {
    const pool = { query: async () => ({ rowCount: 5 }) };
    const out = await runDailyAnalyticsRollup(pool, { days_back: 2 });
    assert.equal(out.upserted, 5);
  });

  it("runs retention cleanup queries", async () => {
    let call = 0;
    const pool = {
      query: async () => {
        call += 1;
        return { rowCount: call };
      }
    };
    const out = await cleanupAnalyticsRetention(pool, { retention_days: 180, rollup_retention_days: 540 });
    assert.equal(out.deleted_events, 1);
    assert.equal(out.deleted_rollups, 4);
  });
});
