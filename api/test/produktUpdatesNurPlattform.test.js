/**
 * Die Pflege der Produktmitteilungen gehoert der Plattformverwaltung — nicht
 * einem Kunden-Admin.
 *
 * BEFUND 2026-10-01, am laufenden System belegt: angemeldet als Owner eines
 * Unternehmens kam `POST /admin/product-releases` mit 201 durch. Die Wache liess
 * jede Org-Rolle `owner`/`admin` passieren; der Pfad `/admin/` und der Name
 * `requireAdmin` haben das wie eine Plattformpruefung aussehen lassen. Eine
 * veroeffentlichte Mitteilung erscheint bei JEDEM Nutzer, auf Wunsch als Modal
 * und per E-Mail — ein Kunde konnte damit alle anderen Kunden im Namen von
 * TempConnect anschreiben.
 *
 * Diese Probe haelt fest, dass jeder Pflegeweg die Kunden-Rollen abweist, auch
 * mit dem lokalen Oeffnungsschalter `ADMIN_PANEL_OPEN`, und dass die Wache
 * benannt in der Kette steht (ein Waechter kann nur sehen, was einen Namen hat).
 *
 * Run: node --test --test-force-exit test/produktUpdatesNurPlattform.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createProductReleasesRouter } from "../routes/productReleases.js";

const ID = "11111111-1111-4111-a111-111111111111";
const leise = { info() {}, warn() {}, error() {}, debug() {} };

const PFLEGEWEGE = [
  ["GET", "/admin/product-releases"],
  ["POST", "/admin/product-releases"],
  ["PATCH", `/admin/product-releases/${ID}`],
  ["POST", `/admin/product-releases/${ID}/publish`],
  ["POST", `/admin/product-releases/${ID}/send-email`],
  ["DELETE", `/admin/product-releases/${ID}`]
];

function router({ config = {}, abfragen = [] } = {}) {
  const pool = {
    query: async (sql, params) => {
      abfragen.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }
  };
  return createProductReleasesRouter({
    pool,
    requireAuth: (_req, _res, next) => next(),
    getUserAndPlan: async () => null,
    sendMail: async () => ({}),
    logger: leise,
    config
  });
}

function schicke(r, { method, url, orgRole = null, userRole = null }) {
  return new Promise((resolve) => {
    const req = {
      method, url, path: url, originalUrl: url,
      session: { userId: "22222222-2222-4222-a222-222222222222", userRole },
      orgRole, body: { title: "Probe", visibility: "public", status: "draft", confirm: true },
      query: {}, params: {}, headers: {}, ip: "127.0.0.1"
    };
    const res = {
      statusCode: 200, body: null, locals: {},
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; resolve(this); return this; },
      send(b) { this.body = b; resolve(this); return this; },
      setHeader() { return this; }
    };
    r.handle(req, res, (err) => resolve({ statusCode: err ? 500 : 404, body: null }));
  });
}

describe("Produktmitteilungen: Pflege nur durch die Plattformverwaltung", () => {
  for (const rolle of ["owner", "admin"]) {
    for (const [method, url] of PFLEGEWEGE) {
      it(`Kunden-${rolle}: ${method} ${url.replace(ID, ":id")} -> 403`, async () => {
        const abfragen = [];
        const res = await schicke(router({ abfragen }), { method, url, orgRole: rolle });
        assert.equal(res.statusCode, 403);
        assert.equal(res.body?.error?.code, "NUR_PLATTFORMVERWALTUNG");
        assert.deepEqual(abfragen, [], "vor der Abweisung darf keine Abfrage laufen");
      });
    }
  }

  it("der lokale Oeffnungsschalter oeffnet diesen Weg nicht", async () => {
    for (const [method, url] of PFLEGEWEGE) {
      const res = await schicke(router({ config: { ADMIN_PANEL_OPEN: true } }), { method, url, orgRole: "owner" });
      assert.equal(res.statusCode, 403, `${method} ${url}`);
    }
  });

  it("die frueher durchgelassene Alt-Rolle users.role = admin kommt nicht mehr durch", async () => {
    const res = await schicke(router(), { method: "POST", url: "/admin/product-releases", userRole: "admin" });
    assert.equal(res.statusCode, 403);
  });

  it("platform_admin kommt durch — als Org-Rolle und als Nutzerrolle", async () => {
    const a = await schicke(router(), { method: "GET", url: "/admin/product-releases", orgRole: "platform_admin" });
    assert.equal(a.statusCode, 200);
    const b = await schicke(router(), { method: "GET", url: "/admin/product-releases", userRole: "platform_admin" });
    assert.equal(b.statusCode, 200);
  });

  it("die Wache steht benannt in jeder Pflege-Kette", () => {
    const r = router();
    const pflege = r.stack.filter((l) => l.route && l.route.path.startsWith("/admin/product-releases"));
    assert.equal(pflege.length, PFLEGEWEGE.length);
    for (const layer of pflege) {
      const namen = layer.route.stack.map((s) => s.handle.name);
      assert.ok(namen.includes("nurPlattformverwaltung"),
        `${Object.keys(layer.route.methods)[0]} ${layer.route.path}: ${namen.join(" > ")}`);
    }
  });

  it("die Lesewege der Nutzer bleiben offen (nur angemeldet)", () => {
    const r = router();
    const lesen = r.stack.filter((l) => l.route && !l.route.path.startsWith("/admin/"));
    assert.ok(lesen.length >= 4);
    for (const layer of lesen) {
      const namen = layer.route.stack.map((s) => s.handle.name);
      assert.ok(!namen.includes("nurPlattformverwaltung"), layer.route.path);
    }
  });
});
