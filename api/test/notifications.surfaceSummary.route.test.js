/**
 * GET /api/notifications/surface-summary — Route-Wiring + Fold-Verhalten.
 *
 * Verifiziert, dass der Endpoint ungelesene Notifications nach type gruppiert
 * laedt, ueber notificationSurfaceMap auf Hub-Surfaces faltet und user-scoped
 * bleibt (kein Org-/Fremduser-Leak).
 *
 * Run: node --test --test-force-exit test/notifications.surfaceSummary.route.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createNotificationsRouter } from "../routes/notifications.js";

const requireAuth = (_req, _res, next) => next();

function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; }
  };
  return res;
}

/** Letzter Handler einer exakten Route (ueberspringt Middleware). */
function findHandler(router, method, path) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path === path && layer.route.methods[method]) {
      const stack = layer.route.stack;
      return stack[stack.length - 1].handle;
    }
  }
  throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
}

describe("GET /notifications/surface-summary", () => {
  it("faltet ungelesene-nach-Typ in Per-Surface-Counts (bell-only im total)", async () => {
    const pool = { query: async () => ({ rows: [
      { type: "requisition_approval", n: 2 },
      { type: "offer_received", n: 1 },
      { type: "general", n: 5 }
    ] }) };
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = findHandler(router, "get", "/notifications/surface-summary");
    const res = mockRes();
    await handler({ session: { userId: "u1" }, query: {} }, res);

    assert.equal(res._status, 200);
    assert.equal(res._json.surfaces.requisitions, 2);
    assert.equal(res._json.surfaces.deals, 1);
    assert.equal(res._json.surfaces.general, undefined);
    assert.equal(res._json.total, 8); // inkl. general (Glocken-konsistent)
    assert.equal(typeof res._json.generated_at, "string");
  });

  it("leere surfaces + total 0, wenn nichts ungelesen", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = findHandler(router, "get", "/notifications/surface-summary");
    const res = mockRes();
    await handler({ session: { userId: "u1" }, query: {} }, res);

    assert.deepEqual(res._json.surfaces, {});
    assert.equal(res._json.total, 0);
  });

  it("scopet die Query auf den Session-User", async () => {
    let capturedSql = null;
    let capturedParams = null;
    const pool = { query: async (sql, params) => { capturedSql = String(sql); capturedParams = params; return { rows: [] }; } };
    const router = createNotificationsRouter({ pool, requireAuth });
    const handler = findHandler(router, "get", "/notifications/surface-summary");
    await handler({ session: { userId: "user-xyz" }, query: {} }, mockRes());

    assert.deepEqual(capturedParams, ["user-xyz"]);
    assert.match(capturedSql, /user_id = \$1/);
    assert.match(capturedSql, /is_read = FALSE/);
    assert.match(capturedSql, /GROUP BY type/);
  });

  it("Route ist registriert (requireAuth + Handler)", () => {
    const router = createNotificationsRouter({ pool: { query: async () => ({ rows: [] }) }, requireAuth });
    const layer = router.stack.find(
      (l) => l.route && l.route.path === "/notifications/surface-summary" && l.route.methods.get
    );
    assert.ok(layer, "surface-summary Route muss existieren");
    assert.equal(layer.route.stack.length, 2, "requireAuth + Handler");
  });
});
