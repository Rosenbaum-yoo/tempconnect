/**
 * Produktmitteilungen ("Was ist neu") pflegt nur TempConnect — im Staff Control
 * Center, nicht in der Welt eines Kunden.
 *
 * GESCHICHTE
 * 2026-10-01, am laufenden System belegt: angemeldet als Owner eines Unternehmens
 * kam `POST /admin/product-releases` mit 201 durch. Fix 9c4af72 hat die Pflege auf
 * `platform_admin` beschraenkt. Mit W-E10 (am selben Tag) ist sie ganz aus der
 * Kundenwelt verschwunden und liegt unter `/staff/api/produkt-updates` — hinter
 * der eigenen Staff-Sitzung, Step-up und, wo es alle trifft, Bestaetigung mit Grund.
 *
 * Diese Datei haelt fest:
 *   1. Auf dem Kunden-Router gibt es KEINEN Pflegeweg mehr — fuer keine Rolle.
 *   2. Die Staff-Wege tragen die gestufte Kette (Entwurf leicht, Veroeffentlichen
 *      und Mailen schwer), und Speichern kann nichts veroeffentlichen.
 *   3. Eine veroeffentlichte Mitteilung aendert sich nur mit Grund.
 *   4. Der Mailversand geht nicht zweimal an dieselben Menschen und sagt, wenn kein
 *      Versandweg verbunden ist.
 *   5. Kunden im Tarif INDIVIDUELL sehen Mitteilungen "ab PLUS" (vorher Rang 0).
 *
 * Run: node --test --test-force-exit test/produktUpdatesNurPlattform.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createProductReleasesRouter } from "../routes/productReleases.js";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";
import { planTier, entryVisibleForUser } from "../services/productReleaseService.js";
import { darfStaffBereich } from "../config/staffRollen.js";

const ID = "11111111-1111-4111-a111-111111111111";
const leise = { info() {}, warn() {}, error() {}, debug() {} };

const ALTE_PFLEGEWEGE = [
  ["GET", "/admin/product-releases"],
  ["POST", "/admin/product-releases"],
  ["PATCH", `/admin/product-releases/${ID}`],
  ["POST", `/admin/product-releases/${ID}/publish`],
  ["POST", `/admin/product-releases/${ID}/send-email`],
  ["DELETE", `/admin/product-releases/${ID}`]
];

function kundenRouter(abfragen = []) {
  const pool = { query: async (sql, params) => { abfragen.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
  return createProductReleasesRouter({
    pool, requireAuth: (_req, _res, next) => next(), getUserAndPlan: async () => null, logger: leise
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

function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    for (const r of routes) {
      if (String(sql).includes(r.match)) {
        const rows = typeof r.rows === "function" ? r.rows({ sql, params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

function staffRouter(pool, extra = {}) {
  return createStaffControlCenterRouter({ pool, logger: leise, sendMail: async () => true, ...extra });
}

function kette(router, methode, pfad) {
  const s = router.stack.find((l) => l.route && l.route.path === pfad && l.route.methods[methode]);
  assert.ok(s, `Route ${methode.toUpperCase()} ${pfad} fehlt`);
  return s.route.stack;
}
const namen = (router, m, p) => kette(router, m, p).map((s) => s.handle.name);
const handler = (router, m, p) => { const k = kette(router, m, p); return k[k.length - 1].handle; };

function mockRes() {
  const res = { _status: 200, _json: null };
  res.status = (c) => { res._status = c; return res; };
  res.json = (b) => { res._json = b; return res; };
  return res;
}
const req = (extra = {}) => ({
  body: {}, query: {}, params: {}, headers: {}, ip: "127.0.0.1",
  sccActorId: "33333333-3333-4333-8333-333333333333", sccReason: "Neue Funktion für alle Kunden", ...extra
});

const ENTWURF = {
  id: ID, title: "Neu: Verwaltung", summary: "Kurz", body: null, feature_key: null, audiences: [],
  min_plan: null, required_feature_key: null, visibility: "public", status: "draft", published_at: null,
  show_in_app: true, send_email_on_publish: false, email_sent_at: null, priority: 0, show_as_modal: false,
  created_at: "2026-10-01", updated_at: "2026-10-01"
};

/* ── 1. Kein Pflegeweg mehr in der Kundenwelt ──────────────────────────── */

describe("Produktmitteilungen: kein Pflegeweg auf dem Kunden-Router", () => {
  for (const rolle of ["owner", "admin", "platform_admin"]) {
    for (const [method, url] of ALTE_PFLEGEWEGE) {
      it(`${rolle}: ${method} ${url.replace(ID, ":id")} -> nicht vorhanden`, async () => {
        const abfragen = [];
        const res = await schicke(kundenRouter(abfragen), { method, url, orgRole: rolle });
        assert.equal(res.statusCode, 404);
        assert.deepEqual(abfragen, [], "kein Weg, keine Abfrage");
      });
    }
  }

  it("der Router kennt keinen Pfad unter /admin/ mehr", () => {
    const pfade = kundenRouter().stack.filter((l) => l.route).map((l) => l.route.path);
    assert.ok(pfade.length >= 4, "die vier Lesewege der Nutzer muessen bleiben");
    for (const p of pfade) assert.ok(!p.startsWith("/admin/"), p);
  });
});

/* ── 2. Die Staff-Wege und ihre Ketten ─────────────────────────────────── */

describe("Produktmitteilungen im Staff Control Center: gestufte Wachen", () => {
  const r = staffRouter(trackingPool());

  it("Veroeffentlichen und Mailen: Step-up HOCH plus Bestaetigung mit Grund", () => {
    for (const p of ["/produkt-updates/:id/veroeffentlichen", "/produkt-updates/:id/mailen"]) {
      const n = namen(r, "post", p);
      assert.ok(n.includes("requireConfirmAndReason"), `${p}: ${n.join(" > ")}`);
      assert.ok(n.length >= 5, `${p}: ${n.join(" > ")}`);
    }
  });

  it("Loeschen verlangt Bestaetigung mit Grund", () => {
    assert.ok(namen(r, "post", "/produkt-updates/:id/loeschen").includes("requireConfirmAndReason"));
  });

  it("Versand anhalten verlangt Bestaetigung mit Grund — Paket von Hand nur Step-up", () => {
    const halt = namen(r, "post", "/produkt-updates/:id/versand-anhalten");
    assert.ok(halt.includes("requireConfirmAndReason"), halt.join(" > "));
    assert.ok(halt.length >= 5, halt.join(" > "));
    const paket = namen(r, "post", "/produkt-updates/:id/paket");
    assert.ok(paket.length >= 4, `Staff, MFA, Step-up, Handler: ${paket.join(" > ")}`);
    assert.ok(!paket.includes("requireConfirmAndReason"), "die Entscheidung fiel mit Grund beim Start");
  });

  it("Entwurf anlegen/aendern: Staff + Step-up, ohne Grund", () => {
    for (const [m, p] of [["post", "/produkt-updates"], ["patch", "/produkt-updates/:id"]]) {
      const n = namen(r, m, p);
      assert.ok(n.length >= 3, `${m} ${p}: ${n.join(" > ")}`);
      assert.ok(!n.includes("requireConfirmAndReason"), `${m} ${p}: ein Entwurf sieht niemand`);
    }
  });

  it("der Pfad gehoert dem Bereich platform", () => {
    assert.equal(darfStaffBereich("staff_ops", "/produkt-updates", "POST").erlaubt, true);
    assert.equal(darfStaffBereich("staff_support", "/produkt-updates", "POST").erlaubt, false);
  });
});

/* ── 3. Speichern veroeffentlicht nie ──────────────────────────────────── */

describe("Produktmitteilungen: Speichern kann nichts veroeffentlichen", () => {
  it("POST legt immer einen Entwurf an — status im Rumpf wird abgelehnt", async () => {
    const pool = trackingPool();
    const res = mockRes();
    await handler(staffRouter(pool), "post", "/produkt-updates")(
      req({ body: { title: "X", visibility: "public", status: "published" } }), res);
    assert.equal(res._status, 400);
    assert.equal(pool.calls.length, 0);
  });

  it("POST: Entwurf und Protokoll in derselben Transaktion; der Staff ist Urheber", async () => {
    const pool = trackingPool([
      { match: "INSERT INTO product_release_entries", rows: ({ params }) => [{ ...ENTWURF, title: params[0], status: params[8] }] },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "a1" }] }
    ]);
    const res = mockRes();
    await handler(staffRouter(pool), "post", "/produkt-updates")(
      req({ body: { title: "Neu: Verwaltung", visibility: "public", audiences: ["agency", "company"] } }), res);
    assert.equal(res._status, 201, JSON.stringify(res._json));
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO product_release_entries"));
    assert.equal(insert.params[8], "draft");
    assert.equal(insert.params[9], null, "kein Veroeffentlichungsdatum");
    assert.equal(insert.params[14], "33333333-3333-4333-8333-333333333333");
    const folge = pool.calls.map((c) => c.sql.trim().split(/\s+/)[0]);
    assert.ok(folge.indexOf("BEGIN") < folge.lastIndexOf("COMMIT"));
    assert.equal(pool.calls.find((c) => c.sql.includes("staff_control_audit_log")).params[2], "staff.produkt_update.angelegt");
  });

  it("PATCH kann nicht veroeffentlichen", async () => {
    const res = mockRes();
    await handler(staffRouter(trackingPool()), "patch", "/produkt-updates/:id")(
      req({ params: { id: ID }, body: { status: "published" } }), res);
    assert.equal(res._status, 400);
  });

  it("PATCH an einer veroeffentlichten Mitteilung braucht Bestaetigung und Grund", async () => {
    const pool = trackingPool([{ match: "SELECT * FROM product_release_entries WHERE id", rows: [{ ...ENTWURF, status: "published", published_at: "2026-09-30" }] }]);
    const res = mockRes();
    await handler(staffRouter(pool), "patch", "/produkt-updates/:id")(req({ params: { id: ID }, body: { title: "Tippfehler" } }), res);
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "GRUND_PFLICHT");
    assert.equal(pool.calls.find((c) => c.sql.includes("UPDATE product_release_entries")), undefined);

    const ok = mockRes();
    const pool2 = trackingPool([
      { match: "SELECT * FROM product_release_entries WHERE id", rows: [{ ...ENTWURF, status: "published", published_at: "2026-09-30" }] },
      { match: "UPDATE product_release_entries", rows: [{ ...ENTWURF, status: "draft" }] },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "a2" }] }
    ]);
    await handler(staffRouter(pool2), "patch", "/produkt-updates/:id")(
      req({ params: { id: ID }, body: { status: "draft", confirmed: true, reason: "Falsche Zielgruppe erwischt" } }), ok);
    assert.equal(ok._status, 200, JSON.stringify(ok._json));
    const audit = pool2.calls.find((c) => c.sql.includes("staff_control_audit_log"));
    assert.equal(audit.params[2], "staff.produkt_update.zurueckgezogen");
    assert.equal(audit.params[6], "Falsche Zielgruppe erwischt");
  });
});

/* ── 4. Veroeffentlichen und Mailen ────────────────────────────────────── */

describe("Produktmitteilungen: Veroeffentlichen und Mailen", () => {
  it("zweimal veroeffentlichen → 409, ohne Schreiben", async () => {
    const pool = trackingPool([{ match: "SELECT * FROM product_release_entries WHERE id", rows: [{ ...ENTWURF, status: "published" }] }]);
    const res = mockRes();
    await handler(staffRouter(pool), "post", "/produkt-updates/:id/veroeffentlichen")(req({ params: { id: ID } }), res);
    assert.equal(res._status, 409);
    assert.equal(pool.calls.find((c) => c.sql.includes("UPDATE product_release_entries")), undefined);
  });

  it("veroeffentlichen protokolliert mit Grund; eine oeffentliche Mitteilung ist HOHES Risiko", async () => {
    const pool = trackingPool([
      { match: "SELECT * FROM product_release_entries WHERE id", rows: [ENTWURF] },
      { match: "UPDATE product_release_entries", rows: [{ ...ENTWURF, status: "published", published_at: "2026-10-01" }] },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "a3" }] }
    ]);
    const res = mockRes();
    await handler(staffRouter(pool), "post", "/produkt-updates/:id/veroeffentlichen")(req({ params: { id: ID } }), res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    const audit = pool.calls.find((c) => c.sql.includes("staff_control_audit_log"));
    assert.equal(audit.params[2], "staff.produkt_update.veroeffentlicht");
    assert.equal(audit.params[6], "Neue Funktion für alle Kunden");
    assert.equal(audit.params[8], "high");
    assert.equal(res._json.data.mail, null, "ohne send_email_on_publish wird nicht gemailt");
  });

  it("mailen: nur Veroeffentlichtes, nie zweimal", async () => {
    const a = mockRes();
    await handler(staffRouter(trackingPool([{ match: "SELECT * FROM product_release_entries WHERE id", rows: [ENTWURF] }])),
      "post", "/produkt-updates/:id/mailen")(req({ params: { id: ID } }), a);
    assert.equal(a._json.error.code, "NICHT_VEROEFFENTLICHT");

    const b = mockRes();
    await handler(staffRouter(trackingPool([{ match: "SELECT * FROM product_release_entries WHERE id", rows: [{ ...ENTWURF, status: "published", email_sent_at: "2026-10-01" }] }])),
      "post", "/produkt-updates/:id/mailen")(req({ params: { id: ID } }), b);
    assert.equal(b._status, 409);
    assert.equal(b._json.error.code, "SCHON_GEMAILT");
  });

  it("ohne Versandweg wird nichts eingefroren — und das steht in der Antwort", async () => {
    const pool = trackingPool([
      { match: "SELECT * FROM product_release_entries WHERE id", rows: [{ ...ENTWURF, status: "published" }] }
    ]);
    const res = mockRes();
    await handler(staffRouter(pool, { sendMail: undefined }), "post", "/produkt-updates/:id/mailen")(req({ params: { id: ID } }), res);
    assert.equal(res._status, 200);
    assert.equal(res._json.data.gestartet, false);
    assert.equal(res._json.data.eingereiht, 0);
    assert.match(res._json.data.hinweis, /Kein Versandweg/);
    assert.equal(pool.calls.find((c) => /UPDATE product_release_entries|INSERT INTO product_release_mail_empfaenger/.test(c.sql)), undefined);
  });

  it("die Liste sagt, ob ein Versandweg verbunden ist, und nennt die Paketgroesse statt einer Obergrenze", async () => {
    const mit = mockRes();
    await handler(staffRouter(trackingPool()), "get", "/produkt-updates")(req(), mit);
    assert.equal(mit._json.data.mail_versand_bereit, true);
    assert.equal(mit._json.data.paket_groesse, 20);
    assert.equal("mail_obergrenze" in mit._json.data, false, "es gibt keine Obergrenze mehr");
    const ohne = mockRes();
    await handler(staffRouter(trackingPool(), { sendMail: undefined }), "get", "/produkt-updates")(req(), ohne);
    assert.equal(ohne._json.data.mail_versand_bereit, false);
  });
});

/* ── 5. Tarif-Rang ─────────────────────────────────────────────────────── */

describe("Produktmitteilungen: der hoechste Tarif sieht, was 'ab PLUS' gilt", () => {
  it("INDIVIDUELL ist die oberste Stufe; ENTERPRISE und FREE werden normalisiert", () => {
    assert.equal(planTier("INDIVIDUELL"), 4);
    assert.equal(planTier("ENTERPRISE"), 4);
    assert.equal(planTier("individuell"), 4);
    assert.equal(planTier("FREE"), 0);
    assert.equal(planTier("unbekannt"), 0);
  });

  it("eine Mitteilung ab PLUS erreicht INDIVIDUELL, aber nicht BASIS", () => {
    const zeile = { ...ENTWURF, status: "published", published_at: "2026-01-01", min_plan: "PLUS" };
    const ctx = (plan) => ({ userRole: "company", orgRole: "owner", plan, isInternalViewer: false });
    assert.equal(entryVisibleForUser(zeile, ctx("INDIVIDUELL")), true, "bis 2026-10-01 war das false");
    assert.equal(entryVisibleForUser(zeile, ctx("BASIS")), false);
  });
});
