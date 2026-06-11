/**
 * Frontend entitlement marker coverage + DOM lock regression tests.
 *
 * Run: node --test --test-force-exit api/test/frontendEntitlementsCoverage.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { planFeatures } from "../config/planFeatures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Robuste Projekt-Root-Aufloesung: cwd-Zweig deckt Docker (/app) ab, in dem der
// offizielle Runner "node --test" mit cwd=api startet; sonst Fallback ueber die
// Testdatei nach api/test/ -> <repo>. Marker = eine real gelesene frontend-Datei.
const _MARKER_REL = "frontend/public/js/entitlements.js";
const _ROOT_CWD = process.cwd();
const _ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(_ROOT_CWD, _MARKER_REL)) ? _ROOT_CWD : _ROOT_LOCAL;
const knownFeatureKeys = new Set(Object.keys(planFeatures));

// Skip guard: diese Suite liest js UND HTML-Seiten — im Docker ist nur
// frontend/public/js gemountet, daher muessen BEIDE Ressourcen-Klassen existieren
// (sonst laeuft die Suite an und faellt mit ENOENT auf den HTML-Reads).
const FRONTEND_AVAILABLE = fs.existsSync(path.join(ROOT, _MARKER_REL))
  && fs.existsSync(path.join(ROOT, "frontend", "public", "vendor_pool.html"));
const frontendSuite = FRONTEND_AVAILABLE ? describe : describe.skip;

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function combinedSource(target) {
  return [target.html, ...(target.js || [])]
    .map((file) => readProjectFile(file))
    .join("\n");
}

function extractFeatureKeys(source) {
  const keys = new Set();
  const re = /data-feature-key\s*=\s*\\?["']([a-z0-9_:-]+)\\?["']/gi;
  let match;
  while ((match = re.exec(source)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

const TARGETS = [
  {
    name: "vendor_pool",
    html: "frontend/public/vendor_pool.html",
    js: ["frontend/public/js/pages/vendorPool.js"],
    applyFn: "applyVendorPoolDomLocks",
    keys: ["supplier_management", "rate_card_management", "spend_analytics", "supplier_ratings"]
  },
  {
    name: "rate-cards",
    html: "frontend/public/rate-cards.html",
    applyFn: "applyRateCardDomLocks",
    keys: ["rate_card_management", "supplier_management", "spend_analytics", "supplier_ratings"]
  },
  {
    name: "spend-analytics",
    html: "frontend/public/spend-analytics.html",
    applyFn: "applySpendDomLocks",
    keys: ["spend_analytics", "enterprise_analytics", "rate_card_management", "supplier_management"]
  },
  {
    name: "integrations",
    html: "frontend/public/integrations.html",
    applyFn: "applyIntegrationDomLocks",
    keys: ["integrations"]
  },
  {
    name: "organization",
    html: "frontend/public/organization.html",
    applyFn: "applyOrgDomLocks",
    keys: ["integrations", "org_settings", "basic_analytics"]
  },
  {
    name: "executive_dashboard",
    html: "frontend/public/executive_dashboard.html",
    js: ["frontend/public/js/pages/executiveDashboard.js"],
    applyFn: "applyExecutiveDomLocks",
    keys: [
      "enterprise_analytics",
      "supplier_management",
      "supplier_ratings",
      "rate_card_management",
      "spend_analytics",
      "data_governance",
      "basic_analytics"
    ]
  },
  {
    name: "sla_abo",
    html: "frontend/public/sla_abo.html",
    js: ["frontend/public/js/pages/accountSubscription.js"],
    applyFn: "applyAccountDomLocks",
    keys: []
  }
];

frontendSuite("frontend entitlement marker sweep", () => {
  it("alle Zielseiten laden entitlements.js vor ihrer Page-Logik", () => {
    for (const target of TARGETS) {
      const html = readProjectFile(target.html);
      const entIdx = html.indexOf("/public/js/entitlements.js");
      assert.ok(entIdx > 0, `${target.name} laedt entitlements.js nicht`);
      if (target.html.endsWith("sla_abo.html")) {
        assert.ok(
          entIdx < html.indexOf("/public/js/pages/accountSubscription.js"),
          "sla_abo muss entitlements.js vor accountSubscription.js laden"
        );
      }
    }
  });

  it("alle Zielseiten rufen TC.entitlements.applyDomLocks ueber page-lokale Helper auf", () => {
    for (const target of TARGETS) {
      const source = combinedSource(target);
      assert.match(source, new RegExp(target.applyFn), `${target.name}: Helper ${target.applyFn} fehlt`);
      assert.match(source, /applyDomLocks/, `${target.name}: applyDomLocks-Aufruf fehlt`);
    }
  });

  it("wichtige Zielseiten tragen die erwarteten Feature-Marker", () => {
    for (const target of TARGETS) {
      const source = combinedSource(target);
      const keys = extractFeatureKeys(source);
      if (target.keys.length) {
        for (const key of target.keys) {
          assert.ok(keys.has(key), `${target.name}: data-feature-key="${key}" fehlt`);
        }
      } else {
        assert.match(source, /data-feature-key/, `${target.name}: dynamische data-feature-key-Marker fehlen`);
      }
    }
  });

  it("alle data-feature-key Marker verweisen auf bekannte planFeatures Keys", () => {
    for (const target of TARGETS) {
      const keys = extractFeatureKeys(combinedSource(target));
      for (const key of keys) {
        assert.ok(knownFeatureKeys.has(key), `${target.name}: unbekannter data-feature-key="${key}"`);
      }
    }
  });
});

function createClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function createElement(tagName, attrs = {}) {
  const attributes = { ...attrs };
  const element = {
    tagName,
    disabled: false,
    dataset: {},
    classList: createClassList(),
    getAttribute(name) { return attributes[name] ?? null; },
    setAttribute(name, value) {
      attributes[name] = String(value);
      if (name === "data-entitlement-locked") this.dataset.entitlementLocked = String(value);
      if (name === "href") this.href = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
      if (name === "data-entitlement-locked") delete this.dataset.entitlementLocked;
    }
  };
  if (attrs.href) element.href = attrs.href;
  return element;
}

function loadEntitlementsClient(snapshots) {
  let requestCount = 0;
  const storage = new Map();
  const windowObj = {
    TC: {},
    sessionStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); }
    },
    fetch: async () => {
      const snapshot = snapshots[Math.min(requestCount, snapshots.length - 1)];
      requestCount += 1;
      return { ok: true, json: async () => snapshot };
    }
  };
  const sandbox = {
    window: windowObj,
    sessionStorage: windowObj.sessionStorage,
    fetch: windowObj.fetch,
    Promise,
    Error,
    Date,
    JSON,
    encodeURIComponent
  };
  vm.createContext(sandbox);
  vm.runInContext(
    readProjectFile("frontend/public/js/entitlements.js"),
    sandbox,
    { filename: "frontend/public/js/entitlements.js" }
  );
  return windowObj.TC.entitlements;
}

frontendSuite("entitlements.js DOM-Lock", () => {
  it("locked Features deaktivieren Buttons und leiten Links auf sla_abo Upgrade um", async () => {
    const entitlements = loadEntitlementsClient([{
      subscription: { active: true },
      features: { spend_analytics: { allowed: false } },
      pending_requests: []
    }]);
    const button = createElement("BUTTON", { "data-feature-key": "spend_analytics" });
    const link = createElement("A", { "data-feature-key": "spend_analytics", href: "/public/spend-analytics.html" });
    const root = { querySelectorAll: () => [button, link] };

    const locked = await entitlements.applyDomLocks(root);

    assert.equal(locked, 2);
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute("data-entitlement-locked"), "true");
    assert.equal(link.getAttribute("href"), "/public/sla_abo.html?upgrade_for=spend_analytics");
    assert.equal(link.dataset.tcOriginalHref, "/public/spend-analytics.html");
    assert.equal(link.classList.contains("is-locked"), true);
  });

  it("refresh + erlaubtes Feature stellt Buttons und Original-Links wieder her", async () => {
    const entitlements = loadEntitlementsClient([
      {
        subscription: { active: true },
        features: { integrations: { allowed: false } },
        pending_requests: []
      },
      {
        subscription: { active: true },
        features: { integrations: { allowed: true } },
        pending_requests: []
      }
    ]);
    const button = createElement("BUTTON", { "data-feature-key": "integrations" });
    const link = createElement("A", { "data-feature-key": "integrations", href: "/public/integrations.html" });
    const root = { querySelectorAll: () => [button, link] };

    await entitlements.applyDomLocks(root);
    await entitlements.refresh();
    const locked = await entitlements.applyDomLocks(root);

    assert.equal(locked, 0);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("data-entitlement-locked"), null);
    assert.equal(link.getAttribute("href"), "/public/integrations.html");
    assert.equal(link.dataset.tcOriginalHref, undefined);
    assert.equal(link.classList.contains("is-locked"), false);
  });

  it("inaktive Subscription sperrt auch grundsaetzlich erlaubte Features", async () => {
    const entitlements = loadEntitlementsClient([{
      subscription: { active: false, status: "past_due" },
      features: { rate_card_management: { allowed: true } },
      pending_requests: []
    }]);
    const button = createElement("BUTTON", { "data-feature-key": "rate_card_management" });
    const root = { querySelectorAll: () => [button] };

    const locked = await entitlements.applyDomLocks(root);

    assert.equal(locked, 1);
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute("data-entitlement-locked"), "true");
  });
});
