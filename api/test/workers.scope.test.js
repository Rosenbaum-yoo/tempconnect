/**
 * API-Key SCOPE-ENFORCEMENT boundary coverage for routes/workers.js
 * (createWorkersRouter).
 *
 * Security gap closed: every auth-protected workers route now carries a
 * requireScope("read:workers" | "write:workers") guard, inserted directly
 * after the auth middleware (...base = [requireAuth, gate]) and before the
 * rperm/feature gates. requireScope (middleware/apiKeyAuth.js):
 *   - PASSES THROUGH for session auth (req.isApiKeyAuth falsy)
 *   - For API-key auth: 403 { success:false, error:{ code:"SCOPE_INSUFFICIENT" } }
 *     when req.apiKeyScopes lacks the required scope; next() otherwise.
 *
 * Strategy (mirrors test/requests.route.coverage.test.js harness): build the
 * real router with mock deps, locate the route layer, then run the FULL
 * middleware chain (iterate route.stack, call each handle(req,res,next) in
 * order) with a mock req simulating an API-key request. We assert:
 *   1. API-key request LACKING the scope  -> 403 SCOPE_INSUFFICIENT
 *   2. API-key request WITH the scope      -> chain proceeds PAST requireScope
 *      (no SCOPE_INSUFFICIENT 403 emitted at that layer)
 *   3. Session auth (isApiKeyAuth falsy)   -> NOT blocked by requireScope
 *
 * Run: node --test --test-force-exit test/workers.scope.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWorkersRouter } from "../routes/workers.js";

/* ── Mocks ─────────────────────────────────────────────────────────────── */

function mockLogger() {
  return { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {} };
}

/*
 * Pool whose queries all resolve empty — MIT EINER AUSNAHME (2026-09-04, M3.7).
 *
 * Seit M3.7 traegt `...base` zusaetzlich `requireAgencyOrg`: das Modul gehoert
 * der Zeitarbeitsfirma, nicht dem Unternehmen. Dieser Riegel fragt die ART DER
 * ORGANISATION — bewusst die Org und nicht die Mitgliedschaft, weil hinter
 * einem API-Schluessel kein Mensch steht und `apiKeyAuth` deshalb nie
 * `req.orgMembership` setzt.
 *
 * Ein Pool, der auf ALLES leer antwortet, laesst die Org damit nicht
 * existieren, und der Riegel schliesst (fail-closed, richtig so). Die Proben
 * hier haetten dann ein 403 gesehen und es fuer ihr eigenes gehalten — genau
 * die Sorte gruener Test, der seinen Gegenstand nicht mehr beruehrt.
 *
 * Geaendert wurde deshalb NUR die Vorrichtung: die Org existiert und ist eine
 * Agentur. Keine einzige Zusicherung dieser Datei ist angefasst.
 */
function noopPool() {
  const query = async (sql) => {
    if (/FROM\s+organizations/i.test(String(sql))) {
      return { rows: [{ org_type: "agency" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  return { query, connect: async () => ({ query, release() {} }) };
}

function makeDeps() {
  return {
    pool: noopPool(),
    logger: mockLogger(),
    requireAuth: (_req, _res, next) => next(),
    // PRO plan grants worker_module so the feature gate (...base) passes and the
    // chain advances to requireScope.
    getUserAndPlan: async () => ({ id: "u1", plan: "PRO", org_id: "org-1" }),
    requestLimiter: (_req, _res, next) => next(),
    sendMail: async () => true,
    config: { BASE_URL: "http://localhost:8080" }
  };
}

function mockReq(overrides = {}) {
  return {
    session: { userId: "u1" },
    user: { id: "u1" },
    orgId: "org-1",
    params: {},
    query: {},
    body: {},
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
    ...overrides
  };
}

function mockRes() {
  const headers = {};
  const res = {
    _status: 200,
    _json: null,
    _send: null,
    _ended: false,
    _headers: headers,
    locals: {},
    status(code) { res._status = code; return res; },
    json(payload) { res._json = payload; res._ended = true; return res; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return res; },
    set() { return res; },
    type() { return res; },
    send(payload) { res._send = payload; res._ended = true; return res; },
    end() { res._ended = true; return res; }
  };
  return res;
}

/** Return the ordered list of middleware/handlers for METHOD PATH. */
function getLayerStack(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack.map((l) => l.handle);
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

/**
 * Run the chain in order. Stops when a layer responds (res._ended) or calls
 * next(err). Returns { res, stoppedLayer, err }. We cap iterations defensively;
 * for our purposes the chain is short-circuited well before any real handler.
 */
async function runChain(stack, req, res, { maxLayers = 5 } = {}) {
  /* 4 -> 5 (M3.7): der gemeinsame Stapel traegt eine Schicht mehr
     (requireAgencyOrg). Ohne diese Anhebung endete der Lauf VOR requireScope,
     und die Proben unten wuerden nichts mehr pruefen. */
  let idx = 0;
  let err = null;
  const limit = Math.min(stack.length, maxLayers);
  while (idx < limit && !res._ended && !err) {
    const handle = stack[idx];
    let advanced = false;
    await new Promise((resolve) => {
      let settled = false;
      const next = (e) => {
        if (settled) return;
        settled = true;
        if (e) err = e;
        else advanced = true;
        resolve();
      };
      try {
        const ret = handle(req, res, next);
        if (ret && typeof ret.then === "function") {
          ret.then(() => { if (!settled) { settled = true; resolve(); } },
                   (e) => { if (!settled) { settled = true; err = e; resolve(); } });
        } else if (res._ended) {
          if (!settled) { settled = true; resolve(); }
        }
      } catch (e) {
        if (!settled) { settled = true; err = e; resolve(); }
      }
    });
    if (res._ended || err) break;
    if (!advanced) break; // layer neither responded nor called next within sync/await window
    idx += 1;
  }
  return { res, err, stoppedAt: idx };
}

/* ── Registration sanity: every auth route carries a requireScope guard ──── */

describe("workers router — scope guard registration", () => {
  it("every auth-protected route has a requireScope layer named requireScope-ish", () => {
    const router = createWorkersRouter(makeDeps());
    // The public profile route has NO auth and MUST NOT carry requireScope.
    const PUBLIC_NO_AUTH = new Set(["/public/worker-profiles/:slug"]);
    let authRoutes = 0;
    let guarded = 0;
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const path = layer.route.path;
      const handles = layer.route.stack.map((l) => l.handle.toString());
      // A scope guard's source contains the SCOPE_INSUFFICIENT marker (from requireScope closure).
      const hasScopeGuard = handles.some((src) => src.includes("SCOPE_INSUFFICIENT"));
      if (PUBLIC_NO_AUTH.has(path)) {
        assert.ok(!hasScopeGuard, `public no-auth route must NOT have requireScope: ${path}`);
        continue;
      }
      authRoutes += 1;
      if (hasScopeGuard) guarded += 1;
      assert.ok(hasScopeGuard, `auth route missing requireScope: ${Object.keys(layer.route.methods)[0]} ${path}`);
    }
    assert.ok(authRoutes >= 40, `expected many auth routes, saw ${authRoutes}`);
    assert.strictEqual(guarded, authRoutes, "all auth routes must be guarded");
  });
});

/* ── Representative GET (read:workers) ─────────────────────────────────── */

describe("GET /workers — requireScope('read:workers')", () => {
  it("403 SCOPE_INSUFFICIENT for API-key auth lacking the scope", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "get", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [], apiKeyId: "k1" });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json?.success, false);
    assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("does NOT 403 at requireScope when the correct scope is present", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "get", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["read:workers"], apiKeyId: "k1" });
    const res = mockRes();
    await runChain(stack, req, res);
    // requireScope must have passed; no SCOPE_INSUFFICIENT was emitted.
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
    assert.ok(!(res._status === 403 && res._json?.error?.code === "SCOPE_INSUFFICIENT"));
  });

  it("write:workers implies read:workers (no SCOPE_INSUFFICIENT)", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "get", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["write:workers"], apiKeyId: "k1" });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("session auth (no API key) is NOT blocked by requireScope", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "get", "/workers");
    const req = mockReq({ isApiKeyAuth: false, apiKeyScopes: [] });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });
});

/* ── Representative mutation (write:workers) ───────────────────────────── */

describe("POST /workers — requireScope('write:workers')", () => {
  it("403 SCOPE_INSUFFICIENT for API-key auth lacking the scope", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "post", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: [], apiKeyId: "k1", body: {} });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json?.success, false);
    assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("read:workers does NOT satisfy write:workers -> 403 SCOPE_INSUFFICIENT", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "post", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["read:workers"], apiKeyId: "k1", body: {} });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.strictEqual(res._status, 403);
    assert.strictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("does NOT 403 at requireScope when write:workers is present", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "post", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["write:workers"], apiKeyId: "k1", body: {} });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("session auth (no API key) is NOT blocked by requireScope", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "post", "/workers");
    const req = mockReq({ isApiKeyAuth: false, apiKeyScopes: [], body: {} });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });

  it("admin scope grants write access (no SCOPE_INSUFFICIENT)", async () => {
    const router = createWorkersRouter(makeDeps());
    const stack = getLayerStack(router, "post", "/workers");
    const req = mockReq({ isApiKeyAuth: true, apiKeyScopes: ["admin"], apiKeyId: "k1", body: {} });
    const res = mockRes();
    await runChain(stack, req, res);
    assert.notStrictEqual(res._json?.error?.code, "SCOPE_INSUFFICIENT");
  });
});

describe("M3.7 · der Agentur-Riegel haengt an JEDEM Weg dieses Moduls", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * DIESE PROBE FEHLTE, UND EINE RUECKMUTATION HAT ES GEZEIGT
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Nach dem Bau von M3.7 wurde `requireAgencyOrg` aus `base` ENTFERNT — und
   * keine einzige Probe wurde rot. Der Riegel war vollstaendig geprueft (was er
   * tut, wen er sperrt, wie er bei Fehlern faellt) und trotzdem haette ihn
   * niemand vermisst, waere er nicht montiert gewesen.
   *
   * Dieselbe Luecke wie bei der Position des Arbeiterriegels in M2.6: eine
   * Wache zu pruefen ist nicht dasselbe wie zu pruefen, dass sie STEHT.
   *
   * Geprueft wird deshalb der echte Stapel jedes Weges — nicht der Quelltext.
   * Deshalb traegt die Middleware einen Namen: eine anonyme waere hier
   * unsichtbar, und die Probe koennte nur Schichten ZAEHLEN, wobei ein Weg
   * ohne Riegel aussieht wie einer mit.
   */

  /*
   * Die einzige Ausnahme, benannt statt gezaehlt: das oeffentliche
   * Arbeitskraft-Profil. Es wird ueber einen geteilten Link geoeffnet, von
   * jemandem ohne Konto und ohne Organisation — ein Org-Typ-Riegel davor waere
   * kein Schutz, sondern die Abschaffung der Funktion.
   */
  const OHNE_RIEGEL = new Map([
    ["GET /public/worker-profiles/:slug",
     "Oeffentliches Profil ueber geteilten Link. Der Aufrufer hat weder Konto noch Org."]
  ]);

  it("jeder Weg traegt den Riegel — bis auf die benannten Ausnahmen", () => {
    const router = createWorkersRouter(makeDeps());
    const ohne = [];
    let mit = 0;
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const methode = Object.keys(layer.route.methods)[0].toUpperCase();
      const name = `${methode} ${layer.route.path}`;
      const traegt = layer.route.stack.some((l) => l.handle.name === "requireAgencyOrgMiddleware");
      if (traegt) { mit++; continue; }
      if (OHNE_RIEGEL.has(name)) continue;
      ohne.push(name);
    }

    assert.ok(mit >= 60,
      `nur ${mit} Wege tragen den Riegel — entweder ist er aus dem gemeinsamen Stapel `
      + "gefallen, oder diese Probe findet ihn nicht mehr (Middleware umbenannt?)");
    assert.deepStrictEqual(ohne, [],
      "Diese Wege des Arbeitskraefte-Moduls tragen den Agentur-Riegel nicht. Ein "
      + "Unternehmenskonto erreicht sie damit weiterhin — und das Modul schreibt "
      + "`supplier_org_id` aus `req.orgId`:\n  " + ohne.join("\n  "));
  });

  it("die benannten Ausnahmen existieren noch", () => {
    /* Sonst warnt die Liste vor einem Weg, den es nicht mehr gibt — und
       verliert die Glaubwuerdigkeit, die sie tragen soll. */
    const router = createWorkersRouter(makeDeps());
    const vorhanden = new Set();
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const m of Object.keys(layer.route.methods)) {
        vorhanden.add(`${m.toUpperCase()} ${layer.route.path}`);
      }
    }
    const verwaist = [...OHNE_RIEGEL.keys()].filter((n) => !vorhanden.has(n));
    assert.deepStrictEqual(verwaist, [],
      "Diese Ausnahmen zeigen auf Wege, die es nicht mehr gibt:\n  " + verwaist.join("\n  "));
  });
});
