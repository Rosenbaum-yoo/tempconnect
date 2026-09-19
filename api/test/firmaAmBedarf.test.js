/**
 * Welle N2.11 — was die grosse Gegenpruefung vom 2026-09-15 im Backend fand.
 *
 *  1. DIE FIRMA AM BEDARF (Owner-Entscheid, Migration 218). Vier Stellen rieten
 *     die Kunden-Firma eines Bedarfs ueber `users.org_id` — die Start-Firma des
 *     Anlegers. Ein eingeladenes Teammitglied pruefte dort gegen die leere
 *     Sperrliste seiner Start-Firma.
 *  2. DER ZWEITE NOTDIENST-WEG (POST /api/emergency/request) reichte gar keine
 *     Firma durch — der Abgleich lief ohne Sperre.
 *  3. GET /api/matching/demand/:id rechnete ohne Sperre und gab
 *     `worker_profile_id` heraus (`SELECT *`).
 *  4. BLAETTERN ohne eindeutige Ordnung: bei gleichem Zeitstempel Doppelte und
 *     Luecken zwischen den Seiten.
 *
 * Geprueft an der Wirkung: welche Firma gebunden wird, ob der Rueckfall nur fuer
 * Bedarfe ohne Firma bezahlt wird, dass die Sitzung die Firma setzt und nicht
 * der Rumpf. Die Datenbank-Seite (Spalte, Rueckfall, Blaettern mit echten
 * Gleichstaenden) steht in `integration/firmaAmBedarf.flow.test.js`.
 *
 * Run: node --test --test-force-exit test/firmaAmBedarf.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as sperrDienst from "../services/companyBlocklistService.js";
import * as marktDienst from "../services/marketplaceService.js";
import * as matchMotor from "../services/matchingEngine.js";
import * as matchTrigger from "../services/matchTriggerService.js";
import * as notdienstDienst from "../services/emergencyStaffingService.js";
import * as kapazitaetsDienst from "../services/capacityExchangeService.js";
import { createMarketplaceRouter } from "../routes/marketplace.js";
import { createEmergencyRouter } from "../routes/emergency.js";
import { createMatchingRouter } from "../routes/matching.js";
import { NUR_INTERN } from "../services/capacityPostOeffentlicheSpalten.js";

const FIRMA_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";       // die Firma, fuer die gehandelt wird
const START_FIRMA = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";   // die persoenliche Start-Firma des Anlegers
const FREMD = "cccccccc-3333-4333-8333-cccccccccccc";
const PROFIL = "dddddddd-4444-4444-8444-dddddddddddd";
const CP = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";

function pool(regeln = []) {
  const calls = [];
  const lauf = async (sql, params = []) => {
    const text = typeof sql === "string" ? sql : sql?.text ?? "";
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text.trim().toUpperCase())) return { rows: [], rowCount: 0 };
    calls.push({ sql: text, params });
    for (const [nadel, wert] of regeln) {
      if (typeof nadel === "function" ? nadel(text) : text.includes(nadel)) {
        const rows = typeof wert === "function" ? wert(text, params) : wert;
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    calls, query: lauf, connect: async () => ({ query: lauf, release() {} }),
    finde: (teil) => calls.filter((c) => (teil instanceof RegExp ? teil.test(c.sql) : c.sql.includes(teil)))
  };
}
const durchlass = (_q, _s, next) => next();
const deps = (p) => ({
  pool: p, logger: { info() {}, warn() {}, error() {}, debug() {} },
  requireAuth: durchlass, requireFeature: () => durchlass, requestLimiter: durchlass,
  sendMail: async () => true, config: {},
  getUserAndPlan: async () => ({ id: "u1", plan: "PRO", role: "company", org_id: START_FIRMA,
    limits: { notdienst: true, max_workers_per_request: -1 } })
});
function handler(router, method, pfad) {
  for (const l of router.stack) {
    if (l.route && l.route.path === pfad && l.route.methods[method]) return l.route.stack[l.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${pfad} fehlt`);
}
const antwort = () => ({
  _status: 200, _json: null, locals: {},
  status(c) { this._status = c; return this; }, json(b) { this._json = b; return this; },
  set() { return this; }, setHeader() { return this; }
});
const anfrage = (ueber = {}) => ({
  session: { userId: "u1" }, params: {}, query: {}, body: {}, headers: {},
  orgId: FIRMA_A, ip: "127.0.0.1", get: () => "", ...ueber
});
/* Die Bindung der Sperre: der Kapazitaets-Abgleich traegt sie als einzigen Parameter. */
const kapazitaetsAbfrage = (p) => p.finde(/FROM capacity_posts cp[\s\S]*company_worker_blocklist/)[0];

describe("N2.11 · die Firma eines Bedarfs — eine Quelle", () => {
  it("gespeicherte Firma: gewinnt, und es wird NICHTS nachgeladen", async () => {
    const p = pool();
    assert.equal(await sperrDienst.kundenOrgEinesBedarfs(p, { requester_org_id: FIRMA_A, requester_company_id: "u1" }), FIRMA_A);
    assert.equal(p.calls.length, 0);
  });

  it("ohne gespeicherte Firma: Rueckfall auf den Anleger — genau eine Abfrage, an ihn gebunden", async () => {
    const p = pool([["SELECT org_id FROM users WHERE id = $1", [{ org_id: START_FIRMA }]]]);
    assert.equal(await sperrDienst.kundenOrgEinesBedarfs(p, { requester_company_id: "u-alt" }), START_FIRMA);
    assert.deepEqual(p.calls.map((c) => c.params), [["u-alt"]]);
  });

  it("ohne Firma und ohne Anleger: null, keine Abfrage", async () => {
    const p = pool();
    assert.equal(await sperrDienst.kundenOrgEinesBedarfs(p, { id: "x" }), null);
    assert.equal(await sperrDienst.kundenOrgEinesBedarfs(p, null), null);
    assert.equal(p.calls.length, 0);
  });

  it("viele Bedarfe: EINE Abfrage nur fuer die ohne Firma", async () => {
    const p = pool([["FROM users WHERE id = ANY", (_s, params) => params[0].map((id) => ({ id, org_id: `org-von-${id}` }))]]);
    const karte = await sperrDienst.kundenOrgsDerBedarfe(p, [
      { id: "d1", requester_org_id: FIRMA_A, requester_company_id: "u1" },
      { id: "d2", requester_company_id: "u2" },
      { id: "d3", requester_company_id: "u2" },
      { id: "d4" }
    ]);
    assert.equal(p.calls.length, 1);
    assert.deepEqual(p.calls[0].params, [["u2"]], "nachgeladen wird nur, wer keine Firma traegt — und jeder Nutzer einmal");
    assert.deepEqual(Object.fromEntries(karte), { d1: FIRMA_A, d2: "org-von-u2", d3: "org-von-u2", d4: null });
    const p2 = pool();
    await sperrDienst.kundenOrgsDerBedarfe(p2, [{ id: "d1", requester_org_id: FIRMA_A }]);
    assert.equal(p2.calls.length, 0, "alle mit Firma — trotzdem nachgeladen");
  });
});

describe("N2.11 · die Firma wird beim Anlegen gespeichert — aus der Sitzung", () => {
  it("createDemandRequest schreibt requester_org_id als 27. Wert", async () => {
    const p = pool([["INSERT INTO demand_requests", [{ id: "dr1" }]]]);
    await marktDienst.createDemandRequest(p, "u1", "PRO", { title: "t", role: "r", start_date: "2027-01-01", requester_org_id: FIRMA_A });
    const q = p.finde("INSERT INTO demand_requests")[0];
    assert.ok(q.sql.includes("contact_name, contact_phone, requester_org_id)"));
    assert.ok(q.sql.includes("$26,$27)"));
    assert.equal(q.params.length, 27);
    assert.equal(q.params[26], FIRMA_A);
  });

  const RUMPF = { title: "10 Pflegekraefte", role: "Pflege", headcount: 2, location_city: "Münster",
    location_postal: "48143", location_lat: 51.96, location_lng: 7.62, radius_km: 25 };

  it("Marktplatz-Anlage: die Firma der Sitzung — ein Rumpf-Wert kann sie nicht ueberschreiben", async () => {
    const p = pool([["INSERT INTO demand_requests", [{ id: "dr1", ...RUMPF, start_date: "2027-03-01", urgency: "normal", requester_company_id: "u1" }]]]);
    await handler(createMarketplaceRouter(deps(p)), "post", "/marketplace/demand-requests")(
      anfrage({ body: { ...RUMPF, start_date: "2027-03-01", requester_org_id: FREMD }, orgId: FIRMA_A }), antwort(), () => {});
    const q = p.finde("INSERT INTO demand_requests")[0];
    assert.ok(q, "der Bedarf wurde nicht angelegt");
    assert.equal(q.params[26], FIRMA_A, `gespeichert wurde ${q.params[26]}`);
  });

  it("zweiter Notdienst-Weg POST /api/emergency/request: Firma der Sitzung, Abgleich MIT Sperre", async () => {
    const p = pool([["INSERT INTO demand_requests", [{ id: "dr1", ...RUMPF, start_date: "2026-09-16", urgency: "notdienst",
      requester_company_id: "u1", requester_org_id: FIRMA_A }]]]);
    const res = antwort();
    await handler(createEmergencyRouter(deps(p)), "post", "/emergency/request")(
      anfrage({ body: { ...RUMPF, start_date: "2026-09-16", requester_org_id: FREMD } }), res);
    assert.equal(res._status, 201, JSON.stringify(res._json));
    assert.equal(p.finde("INSERT INTO demand_requests")[0].params[26], FIRMA_A);
    const abgleich = kapazitaetsAbfrage(p);
    assert.ok(abgleich, "der Notdienst-Abgleich kennt die Sperre nicht");
    assert.deepEqual(abgleich.params, [FIRMA_A]);
  });
});

describe("N2.12 · der Notdienst rechnet mit dem GESPEICHERTEN Bedarf", () => {
  /*
   * Befund der Nachpruefung 2026-09-16: die Probe oben deckte nur die Route ab.
   * Nahm man im Dienst die Ableitung zurueck (`payload.requester_org_id || null`),
   * blieb alles gruen — die Anlage haette dann mit einer anderen Firma gerechnet
   * als jede spaetere Stelle, die den gespeicherten Bedarf liest.
   */
  const RUMPF = { role: "Pflege", skill_tags: [], headcount: 1, start_date: "2026-09-20", location_city: "Münster" };

  it("steht die Firma am gespeicherten Bedarf, gewinnt SIE — nicht der uebergebene Wert", async () => {
    const p = pool([["INSERT INTO demand_requests", [{ id: "dr1", ...RUMPF, urgency: "notdienst",
      requester_company_id: "u1", requester_org_id: FIRMA_A }]]]);
    await notdienstDienst.createEmergencyRequest(p, "u1", "PRO", { ...RUMPF, urgency: "notdienst", requester_org_id: FREMD });
    assert.deepEqual(kapazitaetsAbfrage(p)?.params, [FIRMA_A],
      "der Abgleich rechnet mit dem uebergebenen Wert statt mit dem gespeicherten Bedarf");
  });

  it("traegt der gespeicherte Bedarf keine Firma, gilt der uebergebene Wert (Altbestand)", async () => {
    const p = pool([["INSERT INTO demand_requests", [{ id: "dr1", ...RUMPF, urgency: "notdienst",
      requester_company_id: "u1" }]]]);
    await notdienstDienst.createEmergencyRequest(p, "u1", "PRO", { ...RUMPF, urgency: "notdienst", requester_org_id: FIRMA_A });
    assert.deepEqual(kapazitaetsAbfrage(p)?.params, [FIRMA_A]);
    assert.equal(p.finde("SELECT org_id FROM users WHERE id").length, 0,
      "es wurde zusaetzlich die Start-Firma nachgeladen, obwohl eine Firma vorlag");
  });
});

describe("N2.11 · jede spaetere Stelle liest die gespeicherte Firma", () => {
  const BEDARF = { id: "dr1", requester_company_id: "u1", requester_org_id: FIRMA_A, role: "Pflege",
    skill_tags: [], location_city: "Münster", urgency: "normal", status: "open", escalation_level: 0 };
  const START_FIRMA_VON_U1 = ["SELECT org_id FROM users WHERE id = $1", [{ org_id: START_FIRMA }]];

  it("Match-Trigger: gebunden an die Firma des Bedarfs, nicht an die Start-Firma", async () => {
    const p = pool([["FROM demand_requests WHERE id = $1 AND status = 'open'", [BEDARF]], START_FIRMA_VON_U1]);
    await matchTrigger.runMatchTrigger(p, { sourceType: "demand_request", sourceId: "dr1" });
    assert.deepEqual(kapazitaetsAbfrage(p)?.params, [FIRMA_A]);
    assert.equal(p.finde("SELECT org_id FROM users WHERE id").length, 0, "die Start-Firma wurde trotzdem geraten");
  });

  it("Notdienst-Eskalation: laedt die Firma und bindet sie", async () => {
    const p = pool([[(s) => /SELECT id, urgency, status, escalation_level/.test(s),
      (s) => (s.includes("requester_org_id") ? [{ ...BEDARF, urgency: "notdienst" }] : [{ ...BEDARF, urgency: "notdienst", requester_org_id: undefined }])],
      START_FIRMA_VON_U1]);
    await notdienstDienst.escalateEmergency(p, "dr1", "staff-1");
    assert.deepEqual(kapazitaetsAbfrage(p)?.params, [FIRMA_A], "die Eskalation rechnet mit der Start-Firma");
    assert.equal(p.finde("SELECT org_id FROM users WHERE id").length, 0);
  });

  it("Gegenrichtung: der Bedarf der sperrenden FIRMA wird entfernt, auch wenn sein Anleger woanders gestartet ist", async () => {
    const p = pool([
      ["SELECT * FROM capacity_posts WHERE id", [{ id: CP, worker_profile_id: PROFIL, role: "Pflege", skill_tags: [], location_city: "Münster" }]],
      ["SELECT DISTINCT bl.company_org_id", [{ company_org_id: FIRMA_A }]],
      ["FROM demand_requests WHERE status = 'open'", [
        { id: "d-team", requester_company_id: "u1", requester_org_id: FIRMA_A, role: "Pflege", skill_tags: [], location_city: "Münster" },
        { id: "d-alt", requester_company_id: "u-alt", role: "Pflege", skill_tags: [], location_city: "Münster" },
        { id: "d-frei", requester_company_id: "u2", requester_org_id: FREMD, role: "Pflege", skill_tags: [], location_city: "Münster" }]],
      ["FROM users WHERE id = ANY", (_s, params) => params[0].map((id) => ({ id, org_id: id === "u-alt" ? FIRMA_A : START_FIRMA }))]
    ]);
    const treffer = await matchMotor.matchCapacityToRequisitions(p, CP, { minScore: 1, skillIndex: null });
    const ids = treffer.map((t) => t.entity?.id || t.id);
    assert.ok(!ids.includes("d-team"), "der Bedarf des Teammitglieds von Firma A bekam die gesperrte Kraft");
    assert.ok(!ids.includes("d-alt"), "der Altbestand ohne Firma fiel durch den Rueckfall");
    assert.ok(ids.includes("d-frei"), "mehr entfernt als die Sperre verlangt: " + ids.join(", "));
    assert.deepEqual(p.finde("FROM users WHERE id = ANY")[0].params, [["u-alt"]]);
  });

  it("findMatches kennt die Sperre von selbst — auch wenn der Aufrufer keine Firma reicht", async () => {
    const p = pool([["SELECT * FROM demand_requests WHERE id = $1", [BEDARF]]]);
    await matchMotor.findMatches(p, "dr1", { skillIndex: null });
    const q = p.finde("FROM capacity_posts WHERE is_active = TRUE")[0];
    assert.ok(q.sql.includes("company_worker_blocklist"), "ohne Firma vom Aufrufer rechnet findMatches ohne Sperre");
    assert.deepEqual(q.params, [FIRMA_A]);
  });

  it("GET /api/matching/demand/:id: dieselbe Sperre wie die Bedarfsansicht", async () => {
    const p = pool([
      ["AS offene_plaetze", [{ requester_company_id: "u1", status: "open", end_date: null, offene_plaetze: 1, hat_ursprungsauftrag: false }]],
      ["SELECT * FROM demand_requests WHERE id = $1", [BEDARF]]
    ]);
    const res = antwort();
    await handler(createMatchingRouter(deps(p)), "get", "/matching/demand/:id")(anfrage({ params: { id: "dr1" } }), res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    const q = p.finde("FROM capacity_posts WHERE is_active = TRUE")[0];
    assert.ok(q, "die Vorschlaege wurden nicht gerechnet");
    assert.deepEqual(q.params, [FIRMA_A], "die Route rechnet ohne die Sperre des Bedarfstellers");
  });

  it("die Vorschlaege geben keine interne Spalte heraus", async () => {
    const p = pool([["FROM capacity_posts WHERE is_active = TRUE", [{ id: CP, role: "Pflege", skill_tags: [], supplier_company_id: "s1" }]]]);
    await matchMotor.matchRequisition(p, { role: "Pflege", skill_tags: [] }, { skillIndex: null });
    const liste = /^SELECT (.+) FROM capacity_posts WHERE/.exec(p.finde("FROM capacity_posts WHERE is_active")[0].sql)[1];
    assert.equal(/\*/.test(liste), false, "SELECT * gibt die Kennung des Menschen heraus");
    for (const intern of NUR_INTERN) {
      assert.equal(new RegExp(`\\b${intern}\\b`).test(liste), false, `${intern} in den Vorschlaegen`);
    }
  });
});

describe("N2.11 · Blaettern mit einer totalen Ordnung", () => {
  const holen = (p) => p.calls.filter((c) => /LIMIT \$\d+ OFFSET \$\d+/.test(c.sql));

  it("beide Seiten sortieren zuletzt nach der Kennung, und der Zeitstempel ist auf Millisekunden gekuerzt", async () => {
    const p = pool();
    await kapazitaetsDienst.browseFeed(p, { limit: 10 });
    const [angebote, bedarfe] = [holen(p).find((c) => !c.sql.includes("FROM demand_requests dr")), holen(p).find((c) => c.sql.includes("FROM demand_requests dr"))];
    assert.ok(angebote && bedarfe, "ein Betrachter ohne Rolle sieht beide Seiten — Probe ohne Gegenstand");
    assert.match(angebote.sql, /ORDER BY sort_date DESC, cp\.id DESC\s+LIMIT/);
    assert.match(bedarfe.sql, /ORDER BY sort_date DESC, dr\.id DESC LIMIT/);
    assert.ok(angebote.sql.includes("date_trunc('milliseconds', COALESCE(cp.updated_at, cp.created_at)) AS sort_date"));
    assert.ok(bedarfe.sql.includes("date_trunc('milliseconds', COALESCE(dr.updated_at, dr.created_at)) AS sort_date"));
  });

  it("mit Umkreis: Naehe, dann Zeit, dann Kennung", async () => {
    const p = pool();
    await kapazitaetsDienst.browseFeed(p, { limit: 10, latitude: 51.96, longitude: 7.62, radius_km: 25 });
    for (const q of holen(p)) {
      assert.match(q.sql, /ORDER BY _distance_km ASC, sort_date DESC, (cp|dr)\.id DESC/);
    }
  });

  it("die Zusammenfuehrung beider Seiten bricht Gleichstaende mit DERSELBEN Ordnung wie SQL", async () => {
    const zeit = new Date("2026-09-15T10:12:30.038Z");
    const angebot = (id) => ({ id, sort_date: zeit, updated_at: zeit, status: "active", headcount: 1, title: id, visible_to_viewer: true });
    const p = pool([
      [(s) => /LIMIT \$\d+ OFFSET \$\d+/.test(s) && !s.includes("FROM demand_requests dr"), [angebot("11111111-0000-4000-8000-000000000001"), angebot("99999999-0000-4000-8000-000000000009")]],
      [(s) => s.includes("FROM demand_requests dr") && /LIMIT \$1 OFFSET \$3/.test(s), [
        { id: "55555555-0000-4000-8000-000000000005", sort_date: zeit, updated_at: zeit, feed_type: "demand", status: "open", title: "b" }]],
      ["COUNT(*)::int AS cnt", [{ cnt: 3 }]]
    ]);
    const erg = await kapazitaetsDienst.browseFeed(p, { limit: 10 });
    const reihenfolge = erg.items.map((i) => i.id);
    // Gleiche Zeit ueberall: absteigend nach Kennung, ueber beide Seiten hinweg.
    const erwartet = [...reihenfolge].sort().reverse();
    assert.equal(reihenfolge.length, 3, "Probe ohne Gegenstand: " + JSON.stringify(reihenfolge));
    assert.deepEqual(reihenfolge, erwartet);
  });
});
