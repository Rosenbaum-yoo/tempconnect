import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip guard: frontend/public/js/api.js is not mounted in Docker
// Robuste ROOT-Aufloesung: cwd-Zweig deckt Docker /app, Fallback ueber Testdatei den lokalen Repo-Root
// (run-tests.js startet node --test mit cwd=api/, dort wuerde process.cwd() den Guard faelschlich kippen).
const API_CLIENT_REL = path.join("frontend", "public", "js", "api.js");
const _RD = process.cwd();
const _RL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(_RD, API_CLIENT_REL)) ? _RD : _RL;
const FRONTEND_AVAILABLE = fs.existsSync(path.join(ROOT, API_CLIENT_REL));
const frontendSuite = FRONTEND_AVAILABLE ? describe : describe.skip;

function readApiClientSource() {
  // Loader nutzt ROOT (nicht __dirname/../..): im Docker ist frontend/public/js nach
  // /app/frontend/public/js gemountet, ein Repo-Root oberhalb von /app existiert nicht.
  return fs.readFileSync(path.join(ROOT, API_CLIENT_REL), "utf8");
}

function createJsonResponse(status, data) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        if (String(name || "").toLowerCase() === "content-type") return "application/json";
        return null;
      }
    },
    async json() { return data; },
    async text() { return JSON.stringify(data); }
  };
}

function loadApiClient(fetchImpl) {
  const events = [];
  const document = {
    dispatchEvent(evt) {
      events.push(evt);
      return true;
    }
  };
  function CustomEvent(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }
  const windowObj = {
    TC: {},
    location: { href: "https://tempconnect.local/public/admin_panel.html", search: "" },
    history: { replaceState() {} }
  };
  const sandbox = {
    window: windowObj,
    TC: windowObj.TC,
    fetch: fetchImpl,
    document,
    CustomEvent,
    FormData: class FormData {},
    URL,
    URLSearchParams,
    Promise,
    setTimeout,
    clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(readApiClientSource(), sandbox, { filename: "frontend/public/js/api.js" });
  return { api: sandbox.window.TC.api, events };
}

function findEvent(events, type) {
  return events.find((evt) => evt && evt.type === type) || null;
}

frontendSuite("frontend api client — error normalization", () => {
  it("normalizes nested error envelope objects without [object Object]", async () => {
    const payload = {
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Benutzer konnten nicht geladen werden.",
        details: { root_cause: "column users.plan missing" }
      }
    };
    const { api, events } = loadApiClient(async () => createJsonResponse(500, payload));

    await assert.rejects(
      api.get("/admin/users?limit=50&offset=0"),
      function (err) {
        assert.equal(err.code, "SERVER_ERROR");
        assert.equal(err.status, 500);
        assert.equal(err.message, "Benutzer konnten nicht geladen werden.");
        assert.deepEqual(err.details, { root_cause: "column users.plan missing" });
        assert.notEqual(err.message, "[object Object]");
        return true;
      }
    );

    const serverEvent = findEvent(events, "tc:server-error");
    assert.ok(serverEvent, "tc:server-error should be emitted for 5xx");
    assert.equal(serverEvent.detail.status, 500);
  });

  it("preserves meaningful code/message for 403 nested envelopes", async () => {
    const payload = {
      success: false,
      error: {
        code: "ADMIN_REQUIRED",
        message: "Administratorrechte erforderlich."
      }
    };
    const { api } = loadApiClient(async () => createJsonResponse(403, payload));

    await assert.rejects(
      api.get("/admin/users"),
      function (err) {
        assert.equal(err.code, "ADMIN_REQUIRED");
        assert.equal(err.status, 403);
        assert.equal(err.message, "Administratorrechte erforderlich.");
        assert.notEqual(err.message, "[object Object]");
        return true;
      }
    );
  });

  it("normalizes thrown network-like objects with object messages", async () => {
    const thrown = {
      code: "NETWORK_TIMEOUT",
      status: 0,
      message: { code: "NETWORK_TIMEOUT" },
      details: { retryable: true }
    };
    const { api } = loadApiClient(async () => { throw thrown; });

    await assert.rejects(
      api.get("/admin/users"),
      function (err) {
        assert.equal(err.code, "NETWORK_TIMEOUT");
        assert.equal(err.status, 0);
        assert.equal(err.message, "NETWORK_TIMEOUT");
        assert.deepEqual(err.details, { retryable: true });
        assert.notEqual(err.message, "[object Object]");
        return true;
      }
    );
  });
});

frontendSuite("api.js — Standort-Kontext-Header", () => {
  it("sendet X-Location-Id Header wenn activeLocationId gesetzt", async () => {
    let capturedHeaders = null;
    const { api } = loadApiClient(async (_url, opts) => {
      capturedHeaders = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
      return createJsonResponse(200, { ok: true });
    });
    api.setActiveLocationId("loc-abc-123");
    await api.get("/test/path");
    assert.equal(capturedHeaders["X-Location-Id"], "loc-abc-123", "X-Location-Id muss gesendet werden");
  });

  it("sendet keinen X-Location-Id Header wenn kein activeLocationId gesetzt", async () => {
    let capturedHeaders = null;
    const { api } = loadApiClient(async (_url, opts) => {
      capturedHeaders = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
      return createJsonResponse(200, { ok: true });
    });
    await api.get("/test/path");
    assert.ok(!capturedHeaders["X-Location-Id"], "X-Location-Id darf nicht gesendet werden wenn kein Standort gesetzt");
  });

  it("opts.locationId ueberschreibt gespeicherten activeLocationId-Wert", async () => {
    let capturedHeaders = null;
    const { api } = loadApiClient(async (_url, opts) => {
      capturedHeaders = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
      return createJsonResponse(200, { ok: true });
    });
    api.setActiveLocationId("stored-loc");
    await api.get("/test/path", { locationId: "override-loc" });
    assert.equal(capturedHeaders["X-Location-Id"], "override-loc", "opts.locationId muss Vorrang vor gespeichertem Wert haben");
  });

  it("opts.locationId=null unterdrueckt X-Location-Id Header auch wenn activeLocationId gesetzt", async () => {
    let capturedHeaders = null;
    const { api } = loadApiClient(async (_url, opts) => {
      capturedHeaders = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
      return createJsonResponse(200, { ok: true });
    });
    api.setActiveLocationId("stored-loc");
    await api.get("/test/path", { locationId: null });
    assert.ok(!capturedHeaders["X-Location-Id"], "opts.locationId=null muss Header unterdruecken (explicit no-filter)");
  });

  it("setActiveOrgId loescht activeLocationId (Org-Wechsel invalidiert Standortkontext)", () => {
    const { api } = loadApiClient(async () => createJsonResponse(200, { ok: true }));
    api.setActiveLocationId("loc-123");
    assert.equal(api.getActiveLocationId(), "loc-123", "Voraussetzung: locationId ist gesetzt");
    api.setActiveOrgId("org-new-456");
    assert.equal(api.getActiveLocationId(), null, "Nach Org-Wechsel muss activeLocationId null sein");
  });
});
