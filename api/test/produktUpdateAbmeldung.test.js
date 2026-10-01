/**
 * Produkt-Mails: Abmeldelink in jeder Mail und die Empfaengerzahl vor dem Klick
 * (Owner-Entscheid 2026-10-01).
 *
 * WARUM DAS ABGESICHERT WIRD
 * Produktneuheiten per E-Mail sind Werbung (§ 7 UWG). Bestandskunden duerfen sie
 * bekommen, wenn JEDE Mail sagt, wie man widerspricht, und der Widerspruch wirkt.
 * Drei Dinge muessen halten, und keines faellt auf, wenn es bricht:
 *   1. Der Link laesst sich nicht faelschen (Signatur je Nutzer, zweckgebunden,
 *      zeitkonstant geprueft) und bewirkt genau eine Sache.
 *   2. Wer abbestellt hat, bekommt keine Mail mehr — Versand und Vorschau
 *      ermitteln die Empfaenger mit DERSELBEN Funktion.
 *   3. Ohne Schluessel wird nicht gemailt (fail closed).
 *
 * Run: node --test --test-force-exit test/produktUpdateAbmeldung.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as svc from "../services/productReleaseService.js";
import * as versand from "../services/produktUpdateVersandService.js";
import { createProductReleasesRouter } from "../routes/productReleases.js";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const REL = "44444444-4444-4444-8444-444444444444";
const KEY = "test-schluessel-nur-fuer-proben";
const leise = { info() {}, warn() {}, error() {}, debug() {} };

function pool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    for (const r of routes) {
      if (r.match instanceof RegExp ? r.match.test(String(sql)) : String(sql).includes(r.match)) {
        const rows = typeof r.rows === "function" ? r.rows({ sql, params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}

const MITTEILUNG = {
  id: REL, title: "Neu: <Verwaltung> & mehr", summary: "Kurz\nund gut", body: null, feature_key: null,
  audiences: [], min_plan: null, required_feature_key: null, visibility: "public", status: "published",
  published_at: "2026-09-30T10:00:00Z", show_in_app: true, send_email_on_publish: true, email_sent_at: null,
  priority: 0, show_as_modal: false, created_at: "2026-09-30", updated_at: "2026-09-30"
};

/** Eine Zeile, wie `EMPFAENGER_SQL` sie liefert: ein Kunde im Tarif PLUS. */
const fakten = (id, extra = {}) => ({
  id, role: "company", is_demo: false, org_role: "owner", org_plan: "PLUS", pilot_status: null,
  abo_plan: "PLUS", abo_status: "active", abo_cancel_at: null, intern: false, abgemeldet: false, ...extra
});
const ADRESSE = { [A]: "a@kunde.de", [B]: "b@kunde.de", [C]: "c@kunde.de" };

/**
 * Drei Kunden, B hat abbestellt. Seit dem Versand in Paketen liest EINE Abfrage
 * die Fakten aller Nutzer (`EMPFAENGER_SQL`), und der Versand arbeitet eine
 * eingefrorene Liste ab — die Welt beantwortet beide Wege.
 */
function welt({ eintrag = MITTEILUNG } = {}) {
  return pool([
    { match: "SELECT * FROM product_release_entries WHERE id", rows: [eintrag] },
    { match: "SELECT id, title, summary, status FROM product_release_entries", rows: [eintrag] },
    { match: "LEFT JOIN LATERAL", rows: ({ params }) => (params[2] ? [] : [fakten(A), fakten(B, { abgemeldet: true }), fakten(C)]) },
    { match: "SELECT user_id FROM product_release_mail_empfaenger", rows: [{ user_id: A }, { user_id: B }, { user_id: C }] },
    { match: "SET status = 'in_arbeit'", rows: ({ params }) => [{ email: ADRESSE[params[1]], role: "company", versuche: 1, abgemeldet: params[1] === B }] },
    { match: "UPDATE product_release_mail_empfaenger", rowCount: 1 },
    { match: "UPDATE product_release_entries", rowCount: 1 }
  ]);
}
const getUserAndPlan = async () => ({ plan: "PLUS", org_role: "owner" });

/* ── 1. Der Link ─────────────────────────────────────────────────────────── */

describe("Abmeldelink: Signatur", () => {
  it("ist je Nutzer und je Schluessel verschieden und stabil", () => {
    const a1 = svc.abmeldeSignatur(A, KEY);
    assert.equal(a1, svc.abmeldeSignatur(A, KEY));
    assert.notEqual(a1, svc.abmeldeSignatur(B, KEY));
    assert.notEqual(a1, svc.abmeldeSignatur(A, KEY + "x"));
    assert.match(a1, /^[A-Za-z0-9_-]{43}$/, "base64url eines SHA-256");
  });

  it("ist zweckgebunden: eine HMAC ueber die blosse Kennung (andere Verwendung desselben Schluessels) passt nicht", () => {
    const erwartet = crypto.createHmac("sha256", KEY).update(`produkt-updates-abmelden:v1:${A}`).digest("base64url");
    assert.equal(svc.abmeldeSignatur(A, KEY), erwartet);
    const fremdeVerwendung = crypto.createHmac("sha256", KEY).update(A).digest("base64url");
    assert.equal(svc.pruefeAbmeldung(A, fremdeVerwendung, KEY), false);
  });

  it("die Pruefung nimmt nur die richtige Signatur fuer den richtigen Nutzer", () => {
    const t = svc.abmeldeSignatur(A, KEY);
    assert.equal(svc.pruefeAbmeldung(A, t, KEY), true);
    assert.equal(svc.pruefeAbmeldung(A.toUpperCase(), t, KEY), true, "Gross-/Kleinschreibung der UUID aendert nichts");
    assert.equal(svc.pruefeAbmeldung(B, t, KEY), false, "fremder Nutzer");
    assert.equal(svc.pruefeAbmeldung(A, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), KEY), false, "ein Zeichen anders");
    assert.equal(svc.pruefeAbmeldung(A, t + "x", KEY), false, "andere Laenge");
    assert.equal(svc.pruefeAbmeldung(A, t, null), false, "ohne Schluessel nie gueltig");
    assert.equal(svc.pruefeAbmeldung("42", t, KEY), false, "keine UUID");
    assert.equal(svc.pruefeAbmeldung(A, "", KEY), false);
  });

  it("der Link fuehrt auf die Abmeldeseite und traegt Nutzer und Signatur", () => {
    const link = svc.abmeldeLink("https://tempconnect.de/", A, KEY);
    assert.equal(link, `https://tempconnect.de/public/abmelden.html?u=${A}&t=${svc.abmeldeSignatur(A, KEY)}`);
  });
});

/* ── 2. Abmelden wirkt — und nur auf E-Mail ──────────────────────────────── */

describe("Abmelden", () => {
  it("setzt fuer genau diesen Nutzer die E-Mail der Kategorie product_updates aus", async () => {
    const p = pool([{ match: "INSERT INTO notification_preferences", rowCount: 1 }]);
    assert.equal(await svc.abmelden(p, A), true);
    const c = p.calls[0];
    assert.deepEqual(c.params, [A, "product_updates"]);
    assert.match(c.sql, /SELECT id, \$2, TRUE, FALSE FROM users WHERE id = \$1/, "nur ein bestehendes Konto");
    assert.match(c.sql, /DO UPDATE SET channel_email = FALSE, updated_at = NOW\(\)/);
    assert.ok(!/DO UPDATE SET[^;]*channel_in_app/.test(c.sql), "der In-App-Schalter bleibt, wie er ist");
  });

  it("ein unbekanntes Konto meldet false", async () => {
    assert.equal(await svc.abmelden(pool([{ match: "INSERT INTO notification_preferences", rowCount: 0 }]), A), false);
  });
});

/* ── 3. Empfaenger: dieselbe Ermittlung fuer Vorschau und Versand ────────── */

describe("Empfaenger ermitteln", () => {
  it("wer abbestellt hat, faellt heraus und wird gezaehlt", async () => {
    const r = await svc.ermittleEmpfaenger(welt(), MITTEILUNG);
    assert.deepEqual(r.empfaenger, [A, C]);
    assert.equal(r.abgemeldet, 1);
    assert.equal(r.nicht_in_zielgruppe, 0);
  });

  it("ein Entwurf wird bewertet, als waere er veroeffentlicht (sonst saehe ihn nur das Team)", async () => {
    const r = await svc.ermittleEmpfaenger(welt(), { ...MITTEILUNG, status: "draft", published_at: null });
    assert.equal(r.empfaenger.length, 2);
  });

  it("die Vorschau nennt Zielgruppe, Abbesteller, was rausginge und wie lange", async () => {
    const v = await versand.empfaengerVorschau(welt(), REL);
    assert.deepEqual(v, {
      zielgruppe: 3, abgemeldet: 1, wuerden_gesendet: 2,
      paket_groesse: 20, pakete: 1, dauer_minuten: 0, schon_gestartet: false
    });
  });
});

/* ── 4. Versand ──────────────────────────────────────────────────────────── */

describe("Versand mit Abmeldelink", () => {
  it("ohne Schluessel wird nicht gemailt", async () => {
    const gesendet = [];
    const p = welt();
    await assert.rejects(
      versand.paketSenden(p, REL, { sendMail: async (...a) => { gesendet.push(a); return true; }, logger: leise, baseUrl: "https://x.de" }),
      /ohne Abmelde-Schluessel/
    );
    assert.equal(gesendet.length, 0);
    assert.equal(p.calls.length, 0, "ohne Schluessel wird nicht einmal die Liste gelesen");
  });

  it("jede Mail traegt den eigenen, gueltigen Abmeldelink; wer inzwischen abbestellt hat, bekommt nichts", async () => {
    const gesendet = [];
    const sendMail = async (to, subject, html, opts) => { gesendet.push({ to, subject, html, opts }); return true; };
    const p = welt();
    const r = await versand.paketSenden(p, REL, { sendMail, logger: leise, baseUrl: "https://tempconnect.de", schluessel: KEY });
    assert.deepEqual(gesendet.map((g) => g.to), ["a@kunde.de", "c@kunde.de"]);
    assert.equal(r.gesendet, 2);
    assert.equal(r.entfallen, 1, "B stand auf der Liste, hat aber vor seinem Paket abbestellt");
    for (const [g, id] of [[gesendet[0], A], [gesendet[1], C]]) {
      const m = /href="https:\/\/tempconnect\.de\/public\/abmelden\.html\?u=([^&"]+)&amp;t=([^"]+)"/.exec(g.html);
      assert.ok(m, "kein Abmeldelink in der Mail");
      assert.equal(decodeURIComponent(m[1]), id, "der Link gehoert zum Empfaenger");
      assert.equal(svc.pruefeAbmeldung(id, m[2], KEY), true, "die Signatur im Link ist gueltig");
      assert.match(g.html, /abbestellen/i);
      assert.equal(g.opts?.zweck, "produkt-update", "Versand erscheint im Mailprotokoll unter seinem Zweck");
      assert.ok(!g.html.includes("<Verwaltung>"), "Titel wird maskiert");
      assert.ok(g.html.includes("&lt;Verwaltung&gt; &amp; mehr"));
      // Der „Abbestellen"-Knopf des Mailprogramms zeigt auf denselben Link (RFC 2369).
      const kopf = g.opts?.headers?.["List-Unsubscribe"] || "";
      assert.match(kopf, /^<https:\/\/tempconnect\.de\/public\/abmelden\.html\?u=[^>]+>$/);
      assert.ok(kopf.includes(`u=${encodeURIComponent(id)}&`), "der Kopf gehoert zum Empfaenger");
    }
  });
});

/* ── 5. Die Wege ─────────────────────────────────────────────────────────── */

function handler(router, methode, pfad) {
  const s = router.stack.find((l) => l.route && l.route.path === pfad && l.route.methods[methode]);
  assert.ok(s, `${methode} ${pfad} fehlt`);
  return s.route.stack;
}
function res() {
  const r = { _status: 200, _json: null, locals: {} };
  r.status = (c) => { r._status = c; return r; };
  r.json = (b) => { r._json = b; return r; };
  return r;
}

describe("POST /product-releases/abmelden (oeffentlich, signiert)", () => {
  const baue = (p) => createProductReleasesRouter({
    pool: p, requireAuth: function requireAuth(_q, _s, n) { n(); }, getUserAndPlan, logger: leise,
    config: { JWT_SECRET: KEY }
  });

  it("verlangt keine Anmeldung — die Signatur ist die Berechtigung", () => {
    const namen = handler(baue(pool()), "post", "/product-releases/abmelden").map((s) => s.handle.name);
    assert.ok(!namen.includes("requireAuth"), namen.join(" > "));
  });

  it("ungueltiger Link → 400, ohne Datenbank", async () => {
    const p = pool();
    const r = res();
    const kette = handler(baue(p), "post", "/product-releases/abmelden");
    await kette[kette.length - 1].handle({ body: { u: A, t: "x".repeat(43) } }, r);
    assert.equal(r._status, 400);
    assert.equal(r._json.error.code, "LINK_UNGUELTIG");
    assert.equal(p.calls.length, 0);
  });

  it("gueltiger Link → abbestellt, protokolliert, Nutzer als Verantwortlicher", async () => {
    const p = pool([{ match: "INSERT INTO notification_preferences", rowCount: 1 }]);
    const r = res();
    const kette = handler(baue(p), "post", "/product-releases/abmelden");
    await kette[kette.length - 1].handle({ body: { u: A, t: svc.abmeldeSignatur(A, KEY) } }, r);
    assert.equal(r._status, 200, JSON.stringify(r._json));
    assert.equal(r.locals.audit.action, "product_release.unsubscribe");
    assert.equal(r.locals.audit.details.responsible_actor_user_id, A);
    assert.deepEqual(p.calls[0].params, [A, "product_updates"]);
  });

  it("gueltiger Link fuer ein geloeschtes Konto → 404", async () => {
    const p = pool([{ match: "INSERT INTO notification_preferences", rowCount: 0 }]);
    const r = res();
    const kette = handler(baue(p), "post", "/product-releases/abmelden");
    await kette[kette.length - 1].handle({ body: { u: A, t: svc.abmeldeSignatur(A, KEY) } }, r);
    assert.equal(r._status, 404);
  });
});

describe("GET /staff/api/produkt-updates/:id/empfaenger", () => {
  it("Staff-Tor plus Handler, und dieselben Zahlen wie die Vorschau", async () => {
    const router = createStaffControlCenterRouter({ pool: welt(), logger: leise, sendMail: async () => true });
    const kette = handler(router, "get", "/produkt-updates/:id/empfaenger");
    assert.equal(kette.length, 2);
    const r = res();
    await kette[1].handle({ params: { id: REL } }, r);
    assert.equal(r._status, 200);
    assert.equal(r._json.data.wuerden_gesendet, 2);
    assert.equal(r._json.data.abgemeldet, 1);
  });
});
