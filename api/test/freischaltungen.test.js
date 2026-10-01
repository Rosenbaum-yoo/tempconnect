/**
 * W-E10 — Freischaltungen im Staff Control Center (2026-10-01).
 *
 * WAS HIER ABGESICHERT WIRD
 * Ein Freischalt-Hebel entscheidet, was ein Kunde bekommt. Im Admin Panel liess
 * sich jeder Tarifschluessel setzen; gelesen wird einer. Der Umzug ist nur dann
 * eine Verbesserung, wenn vier Dinge halten:
 *   1. Es gibt nur Hebel, die ein Verbraucher im Code wirklich liest — und jeder
 *      Verbraucher steht in der Liste. (Beide Richtungen, aus dem Quelltext.)
 *   2. Eine Ausnahme je Kunde hat ein Ende (hoechstens ein Jahr) und passt zur
 *      Seite, auf der der Hebel wirkt.
 *   3. Vor der Aenderung steht die Wirkung — dieselbe Rangfolge wie `checkOverride`.
 *   4. Aenderung und Protokoll laufen in EINER Transaktion, hinter Staff-Tor,
 *      Step-up und Begruendung; die alten Admin-Wege kehren nicht zurueck.
 *
 * Run: node --test --test-force-exit test/freischaltungen.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FREISCHALT_HEBEL, MAX_TAGE_JE_AUSNAHME } from "../config/freischaltHebel.js";
import * as dienst from "../services/freischaltungService.js";
import { createStaffControlCenterRouter } from "../routes/staffControlCenter.js";
import { createAdminRouter } from "../routes/admin.js";
import { darfStaffBereich } from "../config/staffRollen.js";

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTUR = "11111111-1111-4111-8111-111111111111";
const FIRMA = "22222222-2222-4222-8222-222222222222";
const HEBEL = "staffing_ready_fast_track";

/* ── Attrappen ─────────────────────────────────────────────────────────── */

function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    for (const r of routes) {
      const hit = r.match instanceof RegExp ? r.match.test(sql) : String(sql).includes(r.match);
      if (hit) {
        const rows = typeof r.rows === "function" ? r.rows({ sql, params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const ORGS = [
  { match: /FROM organizations WHERE id = \$1/, rows: ({ params }) => (
    params[0] === AGENTUR ? [{ id: AGENTUR, name: "ElektroStaff GmbH", type: "agency" }]
      : params[0] === FIRMA ? [{ id: FIRMA, name: "Nordbau Industrie GmbH", type: "company" }]
      : []
  ) }
];

function baueRouter(pool) {
  return createStaffControlCenterRouter({ pool, logger: { error() {}, warn() {}, info() {} }, sendMail: async () => true });
}

function schicht(router, methode, pfad) {
  const s = router.stack.find((l) => l.route && l.route.path === pfad && l.route.methods[methode]);
  assert.ok(s, `Route ${methode.toUpperCase()} ${pfad} ist nicht montiert`);
  return s.route.stack;
}

function handler(router, methode, pfad) {
  const st = schicht(router, methode, pfad);
  return st[st.length - 1].handle;
}

function mockRes() {
  const res = { _status: 200, _json: null };
  res.status = (c) => { res._status = c; return res; };
  res.json = (b) => { res._json = b; return res; };
  return res;
}

const req = (extra = {}) => ({
  body: {}, query: {}, params: {}, headers: {}, ip: "127.0.0.1",
  sccActorId: "33333333-3333-4333-8333-333333333333", sccReason: "Pilot braucht den Schnellweg nicht",
  ...extra
});

/* ── 1. Nur Hebel, die greifen — in beiden Richtungen ──────────────────── */

describe("W-E10 · Jeder Hebel hat einen Leser, jeder Leser einen Hebel", () => {
  it("jeder Hebel nennt eine Datei, die ihn mit checkOverride liest", () => {
    for (const [key, h] of Object.entries(FREISCHALT_HEBEL)) {
      const datei = path.join(API, h.leser);
      assert.ok(fs.existsSync(datei), `${key}: Leser ${h.leser} gibt es nicht`);
      const text = fs.readFileSync(datei, "utf8");
      assert.ok(text.includes(`"${key}"`), `${key}: ${h.leser} nennt den Schluessel nicht`);
      assert.match(text, /checkOverride\(/, `${key}: ${h.leser} ruft checkOverride nicht auf`);
    }
  });

  it("jede Datei, die checkOverride ruft, steht als Leser in der Liste", () => {
    const leser = new Set(Object.values(FREISCHALT_HEBEL).map((h) => h.leser));
    const gefunden = [];
    for (const ordner of ["routes", "services", "middleware", "workers", "queue"]) {
      const voll = path.join(API, ordner);
      if (!fs.existsSync(voll)) continue;
      for (const d of fs.readdirSync(voll, { recursive: true })) {
        if (!String(d).endsWith(".js")) continue;
        const rel = `${ordner}/${d}`;
        if (rel === "services/featureOverrideService.js") continue;
        if (/checkOverride\(/.test(fs.readFileSync(path.join(voll, d), "utf8"))) gefunden.push(rel);
      }
    }
    assert.ok(gefunden.length >= 1, "kein Leser gefunden — Suchmuster pruefen");
    for (const rel of gefunden) {
      assert.ok(leser.has(rel), `${rel} liest einen Freischalt-Hebel, der nicht in config/freischaltHebel.js steht — er waere im Staff CC nicht schaltbar`);
    }
  });

  it("die Standards stimmen mit dem Verbraucher ueberein (ohne Eintrag: an)", async () => {
    const { isStaffingFastTrackEnabled } = await import("../services/dealStaffingFastTrackService.js");
    const leer = trackingPool();
    assert.equal(await isStaffingFastTrackEnabled(leer, AGENTUR), FREISCHALT_HEBEL[HEBEL].standard);
  });
});

/* ── 2. Was als Aenderung angenommen wird ──────────────────────────────── */

describe("W-E10 · pruefeSetzen", () => {
  const p = (body) => dienst.pruefeSetzen(body, { heute: "2026-10-01" });

  it("unbekannter Hebel → HEBEL_UNBEKANNT, auch fuer echte Tarifschluessel", () => {
    assert.equal(p({ hebel: "spend_analytics", enabled: true }).code, "HEBEL_UNBEKANNT",
      "genau dieser Fall stand im Admin Panel zur Auswahl und bewirkte nichts");
    assert.equal(p({ hebel: "  ", enabled: true }).code, "HEBEL_UNBEKANNT");
  });

  it("An oder aus muss ausdruecklich gewaehlt sein", () => {
    assert.equal(p({ hebel: HEBEL }).code, "ZUSTAND_FEHLT");
    assert.equal(p({ hebel: HEBEL, enabled: "true" }).code, "ZUSTAND_FEHLT");
  });

  it("eine Ausnahme je Firma braucht ein Ende", () => {
    assert.equal(p({ hebel: HEBEL, enabled: false, org_id: AGENTUR }).code, "ABLAUF_PFLICHT");
  });

  it("der plattformweite Schalter darf unbefristet sein", () => {
    const r = p({ hebel: HEBEL, enabled: false });
    assert.equal(r.ok, true);
    assert.deepEqual(r.werte, { key: HEBEL, orgId: null, enabled: false, giltBis: null });
  });

  it("Grenzen des Endes: heute ja, gestern nein, genau 366 Tage ja, 367 nein", () => {
    assert.equal(p({ hebel: HEBEL, enabled: false, org_id: AGENTUR, gilt_bis: "2026-10-01" }).ok, true);
    assert.equal(p({ hebel: HEBEL, enabled: false, org_id: AGENTUR, gilt_bis: "2026-09-30" }).code, "ABLAUF_VERGANGEN");
    assert.equal(MAX_TAGE_JE_AUSNAHME, 366);
    assert.equal(p({ hebel: HEBEL, enabled: false, org_id: AGENTUR, gilt_bis: "2027-10-02" }).ok, true);
    assert.equal(p({ hebel: HEBEL, enabled: false, org_id: AGENTUR, gilt_bis: "2027-10-03" }).code, "ABLAUF_ZU_WEIT");
    assert.equal(p({ hebel: HEBEL, enabled: false, gilt_bis: "2027-10-03" }).code, "ABLAUF_ZU_WEIT",
      "auch der plattformweite Schalter haelt die Grenze, wenn er ein Ende hat");
  });

  it("kein gueltiges Datum → ABLAUF_UNGUELTIG", () => {
    for (const d of ["01.12.2026", "2026-13-01", "morgen"]) {
      assert.equal(p({ hebel: HEBEL, enabled: false, org_id: AGENTUR, gilt_bis: d }).code, "ABLAUF_UNGUELTIG", d);
    }
  });

  it("eine Firmenkennung, die keine UUID ist, kommt nicht bis zur Datenbank", () => {
    assert.equal(p({ hebel: HEBEL, enabled: false, org_id: "42", gilt_bis: "2026-12-01" }).code, "ORG_UNGUELTIG");
  });

  it("das Ende gilt den ganzen Tag in Europe/Berlin", () => {
    assert.equal(dienst.ablaufAus("2026-12-31"), "2026-12-31 23:59:59.999 Europe/Berlin");
    assert.equal(dienst.ablaufAus(null), null);
    assert.equal(dienst.tageZwischen("2026-10-01", "2027-10-02"), 366);
    assert.equal(dienst.tageZwischen("2026-03-28", "2026-03-30"), 2, "Zeitumstellung verschiebt keinen Tag");
  });
});

/* ── 3. Die Wirkung vor der Aenderung ──────────────────────────────────── */

describe("W-E10 · wirkung — was gilt heute, und woher", () => {
  it("ohne Eintrag gilt der Standard des Hebels", async () => {
    const pool = trackingPool([...ORGS]);
    const r = await dienst.wirkung(pool, { key: HEBEL, orgId: AGENTUR });
    assert.equal(r.ok, true);
    assert.deepEqual(r.heute, { enabled: true, quelle: "standard", gilt_bis: null, eintrag_id: null });
    assert.equal(r.org.name, "ElektroStaff GmbH");
    const lesen = pool.calls.find((c) => c.sql.includes("FROM feature_overrides"));
    assert.deepEqual(lesen.params, [HEBEL, AGENTUR], "Bindung: Schluessel und Firma, nichts sonst");
    assert.match(lesen.sql, /expires_at IS NULL OR expires_at > NOW\(\)/, "abgelaufene Eintraege zaehlen nicht");
    assert.match(lesen.sql, /ORDER BY org_id IS NULL ASC/, "die eigene Ausnahme geht dem plattformweiten Schalter vor");
  });

  it("eine eigene Ausnahme heisst quelle=firma, der Plattformschalter quelle=plattform", async () => {
    const firma = trackingPool([...ORGS, { match: "FROM feature_overrides", rows: [{ id: 7, org_id: AGENTUR, enabled: false, expires_at: "2026-12-31T22:59:59.999Z" }] }]);
    const r1 = await dienst.wirkung(firma, { key: HEBEL, orgId: AGENTUR });
    assert.equal(r1.heute.quelle, "firma");
    assert.equal(r1.heute.enabled, false);
    assert.equal(r1.heute.gilt_bis, "2026-12-31", "das Ende in Berliner Kalendertagen, nicht in UTC");

    const platt = trackingPool([...ORGS, { match: "FROM feature_overrides", rows: [{ id: 8, org_id: null, enabled: false, expires_at: null }] }]);
    const r2 = await dienst.wirkung(platt, { key: HEBEL, orgId: AGENTUR });
    assert.equal(r2.heute.quelle, "plattform");
  });

  it("die falsche Seite wird abgelehnt — mit dem Namen der Firma", async () => {
    const r = await dienst.wirkung(trackingPool([...ORGS]), { key: HEBEL, orgId: FIRMA });
    assert.equal(r.ok, false);
    assert.equal(r.code, "FALSCHE_SEITE");
    assert.match(r.message, /Nordbau Industrie GmbH ist ein Unternehmen/);
  });

  it("unbekannte Firma → 404", async () => {
    const r = await dienst.wirkung(trackingPool([...ORGS]), { key: HEBEL, orgId: "44444444-4444-4444-8444-444444444444" });
    assert.equal(r.code, "ORG_NICHT_GEFUNDEN");
    assert.equal(r.status, 404);
  });

  it("plattformweit: nennt die Firmen, deren eigene Ausnahme unberuehrt bleibt", async () => {
    const pool = trackingPool([{ match: "COUNT(*)::int AS n", rows: [{ n: 3 }] }]);
    const r = await dienst.wirkung(pool, { key: HEBEL, orgId: null });
    assert.equal(r.eigene_ausnahmen, 3);
    const zaehlen = pool.calls.find((c) => c.sql.includes("COUNT(*)::int AS n"));
    assert.match(zaehlen.sql, /org_id IS NOT NULL/);
    assert.match(zaehlen.sql, /expires_at IS NULL OR expires_at > NOW\(\)/);
  });
});

/* ── 4. Die Uebersicht zeigt, was NICHT wirkt ──────────────────────────── */

describe("W-E10 · uebersicht", () => {
  const jetzt = Date.parse("2026-10-01T10:00:00Z");
  const zeilen = [
    { id: 1, org_id: null, feature_key: HEBEL, enabled: false, reason: "Test", expires_at: null, created_at: "2026-09-01", org_name: null, org_type: null, created_by_email: "o@x" },
    { id: 2, org_id: AGENTUR, feature_key: HEBEL, enabled: true, reason: "Pilot", expires_at: "2026-12-31T22:59:59Z", created_at: "2026-09-02", org_name: "ElektroStaff", org_type: "agency", created_by_email: "o@x" },
    { id: 3, org_id: FIRMA, feature_key: HEBEL, enabled: true, reason: "Irrtum", expires_at: null, created_at: "2026-09-03", org_name: "Nordbau", org_type: "company", created_by_email: "o@x" },
    { id: 4, org_id: AGENTUR, feature_key: "spend_analytics", enabled: true, reason: "alt", expires_at: null, created_at: "2026-01-01", org_name: "ElektroStaff", org_type: "agency", created_by_email: null },
    { id: 5, org_id: AGENTUR, feature_key: HEBEL, enabled: false, reason: "vorbei", expires_at: "2026-09-01T00:00:00Z", created_at: "2026-08-01", org_name: "ElektroStaff", org_type: "agency", created_by_email: null }
  ];

  it("markiert unbekannte, abgelaufene und seitenfremde Eintraege als wirkungslos — mit Grund", async () => {
    const d = await dienst.uebersicht(trackingPool([{ match: "FROM feature_overrides fo", rows: zeilen }]), { jetzt });
    const nach = Object.fromEntries(d.eintraege.map((e) => [e.id, e]));
    assert.equal(nach[1].wirkt, true);
    assert.equal(nach[2].wirkt, true);
    assert.equal(nach[3].wirkt, false);
    assert.match(nach[3].warum_nicht, /Zeitarbeitsfirma/);
    assert.equal(nach[4].wirkt, false);
    assert.match(nach[4].warum_nicht, /Kein Code liest/);
    assert.equal(nach[5].wirkt, false);
    assert.equal(nach[5].warum_nicht, "Abgelaufen.");
    assert.equal(d.wirkungslos, 3);
  });

  it("der Hebel nennt plattformweiten Stand und wirkende Ausnahmen", async () => {
    const d = await dienst.uebersicht(trackingPool([{ match: "FROM feature_overrides fo", rows: zeilen }]), { jetzt });
    const h = d.hebel.find((x) => x.key === HEBEL);
    assert.equal(h.gilt_plattformweit, false);
    assert.deepEqual(h.plattform, { id: 1, enabled: false, gilt_bis: null });
    assert.equal(h.ausnahmen_an, 1, "nur die wirkende Ausnahme zaehlt, nicht die seitenfremde");
    assert.equal(h.ausnahmen_aus, 0, "die abgelaufene zaehlt nicht");
    assert.equal(d.max_tage_je_ausnahme, 366);
  });

  it("die Liste ist begrenzt", async () => {
    const pool = trackingPool();
    await dienst.uebersicht(pool, { jetzt });
    assert.match(pool.calls[0].sql, /LIMIT 500/);
  });
});

/* ── 5. Firmensuche ────────────────────────────────────────────────────── */

describe("W-E10 · firmenSuche", () => {
  it("sucht nur auf der Seite des Hebels und maskiert Platzhalter", async () => {
    const pool = trackingPool([{ match: "FROM organizations", rows: [{ id: AGENTUR, name: "ElektroStaff GmbH", type: "agency" }] }]);
    const r = await dienst.firmenSuche(pool, { key: HEBEL, suche: "100%_" });
    assert.equal(r.firmen.length, 1);
    assert.deepEqual(pool.calls[0].params, ["agency", "%100\\%\\_%"]);
    assert.match(pool.calls[0].sql, /LIMIT 20/);
  });

  it("unter zwei Zeichen wird nicht gesucht", async () => {
    const pool = trackingPool();
    const r = await dienst.firmenSuche(pool, { key: HEBEL, suche: "e" });
    assert.deepEqual(r.firmen, []);
    assert.equal(pool.calls.length, 0);
  });
});

/* ── 6. Kette, Transaktion, Protokoll ──────────────────────────────────── */

describe("W-E10 · Routen im Staff Control Center", () => {
  it("Setzen verlangt Staff, MFA-Pruefung, Step-up HOCH und Bestaetigung mit Grund", () => {
    const namen = schicht(baueRouter(trackingPool()), "post", "/freischaltungen/setzen").map((s) => s.handle.name);
    for (const w of ["requireConfirmAndReason"]) assert.ok(namen.includes(w), `${w} fehlt: ${namen.join(", ")}`);
    assert.ok(namen.length >= 5, `nur ${namen.length} Glieder: ${namen.join(", ")}`);
  });

  it("Entfernen verlangt Bestaetigung mit Grund", () => {
    const namen = schicht(baueRouter(trackingPool()), "post", "/freischaltungen/:id/entfernen").map((s) => s.handle.name);
    assert.ok(namen.includes("requireConfirmAndReason"), namen.join(", "));
  });

  it("Lesen: Staff-Tor plus Handler", () => {
    for (const p of ["/freischaltungen", "/freischaltungen/wirkung", "/freischaltungen/firmen"]) {
      assert.equal(schicht(baueRouter(trackingPool()), "get", p).length, 2, p);
    }
  });

  it("die Pfade gehoeren dem Bereich commercial — staff_ops darf sie nicht, staff_commercial schon", () => {
    assert.equal(darfStaffBereich("staff_commercial", "/freischaltungen/setzen", "POST").erlaubt, true);
    assert.equal(darfStaffBereich("staff_ops", "/freischaltungen/setzen", "POST").erlaubt, false);
    assert.equal(darfStaffBereich("staff_audit", "/freischaltungen", "GET").erlaubt, true);
    assert.equal(darfStaffBereich("staff_audit", "/freischaltungen/setzen", "POST").erlaubt, false);
  });

  it("Setzen: Upsert und Protokoll in derselben Transaktion, mit Stand davor und danach", async () => {
    let stand = [];
    const pool = trackingPool([
      ...ORGS,
      { match: "INSERT INTO feature_overrides", rows: ({ params }) => {
        stand = [{ id: 9, org_id: params[1], enabled: params[2], expires_at: "2026-12-31T22:59:59.999Z" }];
        return [{ id: 9, feature_key: params[0], org_id: params[1], enabled: params[2] }];
      } },
      { match: "FROM feature_overrides", rows: () => stand },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "a1", created_at: "2026-10-01" }] }
    ]);
    const res = mockRes();
    await handler(baueRouter(pool), "post", "/freischaltungen/setzen")(
      req({ body: { hebel: HEBEL, org_id: AGENTUR, enabled: false, gilt_bis: "2026-12-31", confirmed: true, reason: "x" } }), res
    );
    assert.equal(res._status, 200, JSON.stringify(res._json));
    assert.equal(res._json.data.vorher.quelle, "standard");
    assert.equal(res._json.data.nachher.quelle, "firma");
    assert.equal(res._json.data.nachher.enabled, false);

    const folge = pool.calls.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(" "));
    const begin = folge.indexOf("BEGIN");
    const upsert = pool.calls.findIndex((c) => c.sql.includes("INSERT INTO feature_overrides"));
    const audit = pool.calls.findIndex((c) => c.sql.includes("INSERT INTO staff_control_audit_log"));
    const commit = folge.indexOf("COMMIT");
    assert.ok(begin >= 0 && begin < upsert && upsert < audit && audit < commit,
      `Reihenfolge BEGIN < Upsert < Protokoll < COMMIT verletzt: ${folge.join(" | ")}`);

    const upsertCall = pool.calls[upsert];
    assert.deepEqual(upsertCall.params, [HEBEL, AGENTUR, false, "Pilot braucht den Schnellweg nicht",
      "33333333-3333-4333-8333-333333333333", "2026-12-31 23:59:59.999 Europe/Berlin"],
      "Bindung: der Grund aus der Bestaetigung, der Staff als Urheber, das Ende als Berliner Tagesende");
    const auditCall = pool.calls[audit];
    assert.equal(auditCall.params[2], "staff.freischaltung.gesetzt");
    assert.equal(auditCall.params[8], "medium", "eine Ausnahme je Firma ist mittleres Risiko");
    const details = JSON.parse(auditCall.params[12]);
    assert.equal(details.org_name, "ElektroStaff GmbH");
    assert.equal(details.vorher.quelle, "standard");
  });

  it("der plattformweite Schalter wird als HOHES Risiko protokolliert", async () => {
    const pool = trackingPool([
      { match: "INSERT INTO feature_overrides", rows: [{ id: 10 }] },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "a2" }] }
    ]);
    const res = mockRes();
    await handler(baueRouter(pool), "post", "/freischaltungen/setzen")(req({ body: { hebel: HEBEL, enabled: false } }), res);
    assert.equal(res._status, 200);
    const audit = pool.calls.find((c) => c.sql.includes("INSERT INTO staff_control_audit_log"));
    assert.equal(audit.params[8], "high");
  });

  it("die falsche Seite schreibt nichts", async () => {
    const pool = trackingPool([...ORGS]);
    const res = mockRes();
    await handler(baueRouter(pool), "post", "/freischaltungen/setzen")(
      req({ body: { hebel: HEBEL, org_id: FIRMA, enabled: false, gilt_bis: "2026-12-31" } }), res);
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "FALSCHE_SEITE");
    assert.equal(pool.calls.find((c) => c.sql.includes("INSERT INTO feature_overrides")), undefined);
    assert.equal(pool.calls.find((c) => c.sql.includes("staff_control_audit_log")), undefined);
  });

  it("ein unbekannter Hebel wird abgelehnt, bevor die Datenbank gefragt wird", async () => {
    const pool = trackingPool();
    const res = mockRes();
    await handler(baueRouter(pool), "post", "/freischaltungen/setzen")(req({ body: { hebel: "spend_analytics", enabled: true } }), res);
    assert.equal(res._status, 400);
    assert.equal(res._json.error.code, "HEBEL_UNBEKANNT");
    assert.equal(pool.calls.length, 0);
  });

  it("Entfernen: SERIAL-Kennung, 404 ohne Zeile, sonst Loeschen und Protokoll in einer Transaktion", async () => {
    const res0 = mockRes();
    await handler(baueRouter(trackingPool()), "post", "/freischaltungen/:id/entfernen")(req({ params: { id: "abc" } }), res0);
    assert.equal(res0._status, 400);

    const res1 = mockRes();
    await handler(baueRouter(trackingPool()), "post", "/freischaltungen/:id/entfernen")(req({ params: { id: "5" } }), res1);
    assert.equal(res1._status, 404);

    const pool = trackingPool([
      { match: "WHERE fo.id = $1", rows: [{ id: 5, org_id: AGENTUR, feature_key: HEBEL, enabled: false, reason: "r", expires_at: null, created_at: "2026-09-01", org_name: "ElektroStaff", org_type: "agency" }] },
      { match: "DELETE FROM feature_overrides", rowCount: 1 },
      { match: "INSERT INTO staff_control_audit_log", rows: [{ id: "a3" }] }
    ]);
    const res = mockRes();
    await handler(baueRouter(pool), "post", "/freischaltungen/:id/entfernen")(req({ params: { id: "5" } }), res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    assert.deepEqual(pool.calls.find((c) => c.sql.includes("DELETE FROM feature_overrides")).params, [5]);
    assert.equal(res._json.data.nachher.quelle, "standard", "danach gilt wieder, was darunter liegt");
    const audit = pool.calls.find((c) => c.sql.includes("INSERT INTO staff_control_audit_log"));
    assert.equal(audit.params[2], "staff.freischaltung.entfernt");
  });
});

/* ── 7. Die alten Wege kehren nicht zurueck ────────────────────────────── */

describe("W-E10 · Das Admin Panel schaltet nichts mehr frei", () => {
  it("createAdminRouter kennt /admin/feature-overrides und /admin/feature-keys nicht mehr", () => {
    const router = createAdminRouter({
      pool: trackingPool(), requireAuth: (_q, _s, n) => n(), logger: { error() {}, warn() {}, info() {} },
      config: {}, getUserAndPlan: async () => ({}), requestLimiter: (_q, _s, n) => n()
    });
    const pfade = router.stack.filter((l) => l.route).map((l) => l.route.path);
    assert.ok(pfade.length > 5, "Router nicht gebaut — Attrappe pruefen");
    for (const p of pfade) {
      assert.ok(!/feature-overrides|feature-keys/.test(p), `alter Weg ist zurueck: ${p}`);
    }
  });
});
