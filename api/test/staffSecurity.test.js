import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  staffApiCacheControl,
  staffSecurityHeaders,
  createStaffOriginGuard
} from "../middleware/staffSecurity.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    method: "GET",
    path: "/staff/api/some-endpoint",
    ip: "127.0.0.1",
    headers: {},
    session: {},
    ...overrides
  };
}

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    jsonBody: null,
    _headers: headers,
    setHeader(k, v) { headers[k] = v; },
    getHeader(k) { return headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.jsonBody = b; return this; }
  };
}

// ── staffApiCacheControl ──────────────────────────────────────────────────────

describe("staffApiCacheControl", () => {
  it("setzt Cache-Control: no-store auf jede Response", () => {
    const req = makeReq();
    const res = makeRes();
    let ok = false;
    staffApiCacheControl(req, res, () => { ok = true; });
    assert.equal(ok, true);
    assert.equal(res._headers["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0");
  });

  it("setzt Pragma: no-cache", () => {
    const res = makeRes();
    staffApiCacheControl(makeReq(), res, () => {});
    assert.equal(res._headers["Pragma"], "no-cache");
  });

  it("ruft next() auf", () => {
    let called = false;
    staffApiCacheControl(makeReq(), makeRes(), () => { called = true; });
    assert.equal(called, true);
  });
});

// ── staffSecurityHeaders ──────────────────────────────────────────────────────

describe("staffSecurityHeaders", () => {
  it("setzt X-Robots-Tag: noindex, nofollow", () => {
    const res = makeRes();
    staffSecurityHeaders(makeReq(), res, () => {});
    assert.equal(res._headers["X-Robots-Tag"], "noindex, nofollow");
  });

  it("setzt Referrer-Policy: no-referrer", () => {
    const res = makeRes();
    staffSecurityHeaders(makeReq(), res, () => {});
    assert.equal(res._headers["Referrer-Policy"], "no-referrer");
  });

  it("ruft next() auf", () => {
    let called = false;
    staffSecurityHeaders(makeReq(), makeRes(), () => { called = true; });
    assert.equal(called, true);
  });
});

// ── createStaffOriginGuard ────────────────────────────────────────────────────

describe("createStaffOriginGuard — GET-Requests immer durchgelassen", () => {
  const guard = createStaffOriginGuard({ baseUrl: "https://app.tempconnect.de", isLocalDev: false });

  it("GET ohne Origin wird nicht geblockt", () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("HEAD ohne Origin wird nicht geblockt", () => {
    const req = makeReq({ method: "HEAD" });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("OPTIONS ohne Origin wird nicht geblockt", () => {
    const req = makeReq({ method: "OPTIONS" });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });
});

describe("createStaffOriginGuard — Production, fehlender Origin", () => {
  const guard = createStaffOriginGuard({
    baseUrl: "https://app.tempconnect.de",
    isLocalDev: false,
    logger: { warn() {} }
  });

  it("POST ohne Origin-Header liefert 403 SCC_ORIGIN_FORBIDDEN", () => {
    const req = makeReq({ method: "POST", headers: {} });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody.error.code, "SCC_ORIGIN_FORBIDDEN");
  });

  it("PATCH ohne Referer-Header liefert 403", () => {
    const req = makeReq({ method: "PATCH", headers: {} });
    const res = makeRes();
    guard(req, res, () => {});
    assert.equal(res.statusCode, 403);
  });

  it("DELETE ohne Origin/Referer liefert 403", () => {
    const req = makeReq({ method: "DELETE", headers: {} });
    const res = makeRes();
    guard(req, res, () => {});
    assert.equal(res.statusCode, 403);
  });
});

describe("createStaffOriginGuard — Production, falscher Origin", () => {
  const guard = createStaffOriginGuard({
    baseUrl: "https://app.tempconnect.de",
    isLocalDev: false,
    logger: { warn() {} }
  });

  it("POST mit fremdem Origin liefert 403", () => {
    const req = makeReq({ method: "POST", headers: { origin: "https://evil.com" } });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody.error.code, "SCC_ORIGIN_FORBIDDEN");
  });

  it("PUT mit falschem Referer liefert 403", () => {
    const req = makeReq({ method: "PUT", headers: { referer: "https://attacker.example.com/page" } });
    const res = makeRes();
    guard(req, res, () => {});
    assert.equal(res.statusCode, 403);
  });
});

describe("createStaffOriginGuard — Production, korrekter Origin", () => {
  const guard = createStaffOriginGuard({
    baseUrl: "https://app.tempconnect.de",
    isLocalDev: false,
    logger: { warn() {} }
  });

  it("POST mit korrektem Origin-Header passiert", () => {
    const req = makeReq({ method: "POST", headers: { origin: "https://app.tempconnect.de" } });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
    assert.equal(res.statusCode, 200);
  });

  it("POST mit korrektem Referer (kein Origin) passiert", () => {
    const req = makeReq({ method: "POST", headers: { referer: "https://app.tempconnect.de/staff/" } });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("PUT mit additionalOrigin passiert", () => {
    const guard2 = createStaffOriginGuard({
      baseUrl: "https://app.tempconnect.de",
      additionalOrigins: ["https://staging.tempconnect.de"],
      isLocalDev: false
    });
    const req = makeReq({ method: "PUT", headers: { origin: "https://staging.tempconnect.de" } });
    const res = makeRes();
    let ok = false;
    guard2(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });
});

describe("createStaffOriginGuard — Development Mode", () => {
  const guard = createStaffOriginGuard({
    baseUrl: "http://localhost:8080",
    isLocalDev: true,
    logger: { warn() {} }
  });

  it("POST ohne Origin wird in Dev nicht geblockt", () => {
    const req = makeReq({ method: "POST", headers: {} });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("POST mit localhost-Origin passiert in Dev", () => {
    const req = makeReq({ method: "POST", headers: { origin: "http://localhost:5173" } });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    assert.equal(ok, true);
  });

  it("POST mit fremdem Origin: Warnung aber kein Block in Dev", () => {
    let warnCalled = false;
    const guardWithWarn = createStaffOriginGuard({
      isLocalDev: true,
      logger: { warn() { warnCalled = true; } }
    });
    const req = makeReq({ method: "POST", headers: { origin: "https://external.example.com" } });
    const res = makeRes();
    let ok = false;
    guardWithWarn(req, res, () => { ok = true; });
    assert.equal(ok, true);           // nicht geblockt
    assert.equal(warnCalled, true);   // aber Warnung ausgeloest
  });
});

describe("createStaffOriginGuard — baseUrl fehlt (kein Production-Block moglich)", () => {
  it("POST mit Origin passiert wenn keine baseUrl konfiguriert (allowed ist leer)", () => {
    // Edge case: kein baseUrl gesetzt, isLocalDev=false
    // Verhalten: allowed-Set ist leer → jeder Origin wird abgelehnt (sicher-by-default)
    const guard = createStaffOriginGuard({ isLocalDev: false, logger: { warn() {} } });
    const req = makeReq({ method: "POST", headers: { origin: "https://some-origin.com" } });
    const res = makeRes();
    let ok = false;
    guard(req, res, () => { ok = true; });
    // allowed ist leer → Origin "some-origin.com" nicht enthalten → 403
    assert.equal(ok, false);
    assert.equal(res.statusCode, 403);
  });
});
