/**
 * Auth Intent Routing Tests
 *
 * Validates the resolveRedirect logic that determines where users go
 * after login/register based on their intent (selected plan, role, next URL).
 *
 * These are pure-logic tests that replicate the authIntent.js resolveRedirect
 * function without DOM/sessionStorage dependencies.
 *
 * Run: node --test --test-force-exit test/authIntentRouting.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Replicate the resolveRedirect logic from authIntent.js (pure function)
function resolveRedirect(intent, me) {
  if (intent.next) return intent.next;
  var plan = (intent.plan || "").toUpperCase();
  if (plan === "INDIVIDUELL" || plan === "INDIVIDUELL_PILOT" || plan === "INDIVIDUELL_DIRECT"
      || plan === "INDIVIDUAL" || plan === "ENTERPRISE") {
    return "/public/enterprise_anfrage.html";
  }
  if (plan === "BASIS" || plan === "PLUS" || plan === "PRO") {
    return "/public/sla_abo.html?plan=" + encodeURIComponent(plan);
  }
  return "/public/enterprise.html";
}

// ═══════════════════════════════════════════════════════════════════
// 1. Standard plan routing
// ═══════════════════════════════════════════════════════════════════

describe("resolveRedirect: standard plans", () => {
  it("BASIS → sla_abo with plan param", () => {
    assert.strictEqual(resolveRedirect({ plan: "BASIS" }), "/public/sla_abo.html?plan=BASIS");
  });

  it("PLUS → sla_abo with plan param", () => {
    assert.strictEqual(resolveRedirect({ plan: "PLUS" }), "/public/sla_abo.html?plan=PLUS");
  });

  it("PRO → sla_abo with plan param", () => {
    assert.strictEqual(resolveRedirect({ plan: "PRO" }), "/public/sla_abo.html?plan=PRO");
  });

  it("DEMO → default dashboard", () => {
    assert.strictEqual(resolveRedirect({ plan: "DEMO" }), "/public/enterprise.html");
  });

  it("empty plan → default dashboard", () => {
    assert.strictEqual(resolveRedirect({}), "/public/enterprise.html");
  });

  it("null plan → default dashboard", () => {
    assert.strictEqual(resolveRedirect({ plan: null }), "/public/enterprise.html");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Individual plan routing (all aliases)
// ═══════════════════════════════════════════════════════════════════

describe("resolveRedirect: individual tariff variants", () => {
  it("INDIVIDUELL → enterprise_anfrage", () => {
    assert.strictEqual(resolveRedirect({ plan: "INDIVIDUELL" }), "/public/enterprise_anfrage.html");
  });

  it("INDIVIDUELL_PILOT → enterprise_anfrage", () => {
    assert.strictEqual(resolveRedirect({ plan: "INDIVIDUELL_PILOT" }), "/public/enterprise_anfrage.html");
  });

  it("INDIVIDUELL_DIRECT → enterprise_anfrage", () => {
    assert.strictEqual(resolveRedirect({ plan: "INDIVIDUELL_DIRECT" }), "/public/enterprise_anfrage.html");
  });

  it("INDIVIDUAL (legacy alias) → enterprise_anfrage", () => {
    assert.strictEqual(resolveRedirect({ plan: "INDIVIDUAL" }), "/public/enterprise_anfrage.html");
  });

  it("ENTERPRISE (legacy alias) → enterprise_anfrage", () => {
    assert.strictEqual(resolveRedirect({ plan: "ENTERPRISE" }), "/public/enterprise_anfrage.html");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Explicit next URL takes priority
// ═══════════════════════════════════════════════════════════════════

describe("resolveRedirect: explicit next URL", () => {
  it("next overrides plan routing", () => {
    assert.strictEqual(
      resolveRedirect({ plan: "PLUS", next: "/public/custom-page.html" }),
      "/public/custom-page.html"
    );
  });

  it("next overrides individual routing", () => {
    assert.strictEqual(
      resolveRedirect({ plan: "INDIVIDUELL", next: "/public/bounties.html" }),
      "/public/bounties.html"
    );
  });

  it("next with no plan", () => {
    assert.strictEqual(
      resolveRedirect({ next: "/public/some-page.html" }),
      "/public/some-page.html"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Case insensitivity
// ═══════════════════════════════════════════════════════════════════

describe("resolveRedirect: case handling", () => {
  it("lowercase plus → sla_abo", () => {
    assert.strictEqual(resolveRedirect({ plan: "plus" }), "/public/sla_abo.html?plan=PLUS");
  });

  it("mixed case Individuell → enterprise_anfrage", () => {
    assert.strictEqual(resolveRedirect({ plan: "individuell" }), "/public/enterprise_anfrage.html");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Intent structure validation
// ═══════════════════════════════════════════════════════════════════

describe("Intent structure", () => {
  it("intent with all fields is valid", () => {
    const intent = { plan: "PLUS", role: "company", next: null, flow: "plan_select", _ts: Date.now() };
    assert.strictEqual(typeof intent.plan, "string");
    assert.strictEqual(typeof intent.role, "string");
    assert.ok(intent._ts > 0);
  });

  it("intent expiration: >30min is expired", () => {
    const intent = { plan: "PLUS", _ts: Date.now() - (31 * 60 * 1000) };
    const isExpired = intent._ts && (Date.now() - intent._ts > 30 * 60 * 1000);
    assert.ok(isExpired);
  });

  it("intent within 30min is valid", () => {
    const intent = { plan: "PLUS", _ts: Date.now() - (10 * 60 * 1000) };
    const isExpired = intent._ts && (Date.now() - intent._ts > 30 * 60 * 1000);
    assert.ok(!isExpired);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. URL parameter generation for auth redirect
// ═══════════════════════════════════════════════════════════════════

describe("Auth redirect URL generation", () => {
  function buildAuthRedirect(pane, plan, role) {
    var params = "?auth=" + encodeURIComponent(pane);
    if (plan) params += "&plan=" + encodeURIComponent(plan);
    if (role) params += "&role=" + encodeURIComponent(role);
    return "/" + params;
  }

  it("register with PLUS plan", () => {
    assert.strictEqual(buildAuthRedirect("register", "PLUS"), "/?auth=register&plan=PLUS");
  });

  it("register with INDIVIDUELL and company role", () => {
    assert.strictEqual(
      buildAuthRedirect("register", "INDIVIDUELL", "company"),
      "/?auth=register&plan=INDIVIDUELL&role=company"
    );
  });

  it("login without plan context", () => {
    assert.strictEqual(buildAuthRedirect("login"), "/?auth=login");
  });
});
