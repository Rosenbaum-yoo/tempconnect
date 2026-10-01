/**
 * Einsatzportal im Protokoll der Verwaltung — wer war wann angemeldet, was wurde
 * getan (Owner-Vorgabe 2026-10-01).
 *
 * GEMESSEN VOR DEM BAU (laufendes System): Anmeldung und Aktionen kamen an, die
 * Abmeldung ohne Person und Firma, ein Ende ohne Abmeldung gar nicht; die
 * Aktionen hiessen "Worker Update Availability", als Person stand die E-Mail;
 * und der Protokoll-Export stand in UTC.
 *
 * WAS HIER FESTGEHALTEN WIRD:
 *   1. Die Middleware eroeffnet NUR Portal-Sitzungen, speichert nie die rohe
 *      Sitzungskennung, und schreibt "zuletzt aktiv" hoechstens alle 5 Minuten.
 *   2. Abmeldung und "ueberall abmelden" stehen mit Person und Firma im Protokoll.
 *   3. Die Liste ist an die eigene Firma gebunden — Sitzungen UND Aktionen.
 *   4. Nur owner/admin/platform_admin; eine Einsatzkraft kommt nicht hin.
 *   5. Jede Aktion des Einsatzportals hat einen deutschen Namen.
 *   6. Exporte in Berliner Zeit, Namen ohne Formel-Ausfuehrung.
 *   7. 12 Monate Aufbewahrung, die Frist nur in der Datenbank.
 *
 * Run: node --test test/einsatzportalSitzungen.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import * as ep from "../services/einsatzportalSitzungService.js";
import { auditWriteMiddleware } from "../middleware/auditWrite.js";
import { createOrgControlCenterRouter } from "../routes/orgControlCenter.js";
import { createAuthRouter } from "../routes/auth.js";
import { formatFeedItem } from "../services/activityFeedService.js";
import { fmtDateTime, csvText, exportEinsatzportalSitzungenCsv } from "../services/exportService.js";
import { LAEUFE, einsatzportalAufbewahrung } from "../services/betriebsTaktLaeufe.js";
import { TAKTE } from "../services/betriebsTaktService.js";
import { IDLE_TIMEOUT_MS } from "../services/sessionSecurityService.js";

const API = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => fs.readFileSync(path.join(API, rel), "utf8");
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KRAFT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ZWEITE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SID = "sitzung-roh-123";
const leise = { info() {}, warn() {}, error() {}, debug() {} };

function pool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    for (const r of routes) {
      const passt = r.match instanceof RegExp ? r.match.test(String(sql)) : String(sql).includes(r.match);
      if (passt) {
        const rows = typeof r.rows === "function" ? r.rows({ sql: String(sql), params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release() {} }) };
}
const warte = () => new Promise((r) => setTimeout(r, 15));

/* ── 1. Die Middleware ───────────────────────────────────────────────────── */

describe("Aktivitaet: nur Portal-Sitzungen, ohne rohe Kennung, hoechstens alle 5 Minuten", () => {
  const baue = (p, uhr) => ep.aktivitaetMiddleware({ pool: p, bestimmeOrg: () => ORG, jetzt: uhr });

  it("eine Sitzung aus dem Buero (Rolle company) kostet keine Abfrage", async () => {
    const p = pool();
    let weiter = 0;
    baue(p, () => 1)({ session: { userId: KRAFT, userRole: "company" }, sessionID: SID }, {}, () => { weiter++; });
    await warte();
    assert.equal(weiter, 1);
    assert.equal(p.calls.length, 0);
  });

  it("die erste Anfrage eroeffnet — mit Hash statt Kennung, Firma und Anmeldezeitpunkt", async () => {
    const p = pool();
    const session = { userId: KRAFT, userRole: "worker", createdAt: 1759312800000 };
    baue(p, () => 1759312900000)({ session, sessionID: SID }, {}, () => {});
    await warte();
    assert.equal(p.calls.length, 1);
    const c = p.calls[0];
    assert.ok(c.sql.includes("INSERT INTO einsatzportal_sitzungen"));
    assert.ok(c.sql.includes("ON CONFLICT (sitzung_hash) DO NOTHING"));
    assert.equal(c.params[0], crypto.createHash("sha256").update(SID).digest("hex"));
    assert.ok(!JSON.stringify(c.params).includes(SID), "die rohe Sitzungskennung wird nie gespeichert");
    assert.deepEqual(c.params.slice(1), [KRAFT, ORG, 1759312800000]);
    assert.equal(session.portalSitzungOffen, true);
  });

  it("innerhalb von 5 Minuten nichts, danach genau ein Fortschreiben", async () => {
    const p = pool();
    const session = { userId: KRAFT, userRole: "worker", portalSitzungOffen: true, portalAktivAm: 1000 };
    let t = 1000 + ep.AKTIV_MELDEN_ALLE_MS - 1;
    const mw = baue(p, () => t);
    mw({ session, sessionID: SID }, {}, () => {});
    await warte();
    assert.equal(p.calls.length, 0, "vor Ablauf von 5 Minuten wird nichts geschrieben");
    t = 1000 + ep.AKTIV_MELDEN_ALLE_MS;
    mw({ session, sessionID: SID }, {}, () => {});
    await warte();
    assert.equal(p.calls.length, 1);
    assert.ok(p.calls[0].sql.includes("SET zuletzt_aktiv_am = NOW()"));
    assert.ok(p.calls[0].sql.includes("AND beendet_am IS NULL"), "eine beendete Sitzung wird nicht wiederbelebt");
  });

  it("ein Fehler beim Schreiben bricht die Anfrage nicht", async () => {
    const p = { query: async () => { throw new Error("db weg"); } };
    let weiter = 0;
    baue(p, () => 1)({ session: { userId: KRAFT, userRole: "worker" }, sessionID: SID }, {}, () => { weiter++; });
    await warte();
    assert.equal(weiter, 1);
  });

  it("haengt hinter dem Firmen-Kontext (sonst kennt sie die Firma nicht)", () => {
    const app = lies("app.js");
    const kontext = app.indexOf("app.use(orgContextMiddleware(pool));");
    const aktiv = app.indexOf("app.use(einsatzportalAktivitaet({ pool, bestimmeOrg: bestimmeAuditOrg }));");
    assert.ok(kontext > 0 && aktiv > kontext, "Reihenfolge: orgContext, dann Einsatzportal");
  });
});

/* ── 2. Sitzungsende ─────────────────────────────────────────────────────── */

describe("Ende: Abmeldung und ueberall abmelden", () => {
  it("beenden schliesst nur eine offene Sitzung, ueber den Hash", async () => {
    const p = pool();
    await ep.beenden(p, SID);
    assert.ok(p.calls[0].sql.includes("ende = 'abgemeldet'"));
    assert.ok(p.calls[0].sql.includes("WHERE sitzung_hash = $1 AND beendet_am IS NULL"));
    assert.deepEqual(p.calls[0].params, [ep.sitzungHash(SID)]);
  });

  it("ueberall abmelden: alle offenen des Menschen, auf Wunsch ausser der eigenen", async () => {
    const p = pool();
    await ep.alleBeenden(p, KRAFT, { ausserSessionId: SID });
    assert.ok(p.calls[0].sql.includes("ende = 'alle_abgemeldet'"));
    assert.ok(p.calls[0].sql.includes("sitzung_hash <> $2::text"));
    assert.deepEqual(p.calls[0].params, [KRAFT, ep.sitzungHash(SID)]);
    await ep.alleBeenden(p, KRAFT);
    assert.deepEqual(p.calls[1].params, [KRAFT, null]);
  });

  it("der Zustand einer Sitzung: abgemeldet, ueberall abgemeldet, abgelaufen, offen", () => {
    const jetzt = Date.parse("2026-10-01T12:00:00Z");
    assert.deepEqual(ep.bewerteSitzung({ beendet_am: "x", ende: "abgemeldet" }, jetzt), { status: "abgemeldet", bis: "x" });
    assert.equal(ep.bewerteSitzung({ beendet_am: "x", ende: "alle_abgemeldet" }, jetzt).status, "alle_abgemeldet");
    const alt = new Date(jetzt - IDLE_TIMEOUT_MS - 1000).toISOString();
    assert.deepEqual(ep.bewerteSitzung({ beendet_am: null, zuletzt_aktiv_am: alt }, jetzt), { status: "abgelaufen", bis: alt });
    const frisch = new Date(jetzt - IDLE_TIMEOUT_MS + 1000).toISOString();
    assert.deepEqual(ep.bewerteSitzung({ beendet_am: null, zuletzt_aktiv_am: frisch }, jetzt), { status: "offen", bis: null });
  });
});

describe("Abmeldung im Protokoll: mit Person und Firma (gemessen: vorher ohne beides)", () => {
  function resM(code = 200) { const r = new EventEmitter(); r.statusCode = code; r.locals = {}; return r; }

  it("das Protokoll nimmt den vorher festgehaltenen Akteur, wenn die Sitzung weg ist", async () => {
    const p = pool();
    const res = resM();
    auditWriteMiddleware(p, { logger: null })({ method: "POST", path: "/api/auth/logout", headers: {}, session: undefined }, res, () => {});
    res.locals.auditAkteurNachSitzungsende = KRAFT;
    res.locals.audit = { action: "auth.logout", entity_type: "user", entity_id: KRAFT, action_type: "LOGIN", org_id: ORG };
    res.emit("finish");
    await warte();
    assert.equal(p.calls[0].params[0], KRAFT, "Akteur");
    assert.equal(p.calls[0].params[8], ORG, "Firma");
  });

  it("…aber nie ueber eine lebende Sitzung hinweg", async () => {
    const p = pool();
    const res = resM();
    auditWriteMiddleware(p, { logger: null })({ method: "POST", path: "/x", headers: {}, session: { userId: ZWEITE } }, res, () => {});
    res.locals.auditAkteurNachSitzungsende = KRAFT;
    res.locals.audit = { action: "x.y", entity_type: "t" };
    res.emit("finish");
    await warte();
    assert.equal(p.calls[0].params[0], ZWEITE);
  });

  it("die Abmelde-Route haelt Person und Firma VOR dem Zerstoeren fest und schliesst den Zeitraum", async () => {
    const p = pool();
    const durch = (_q, _s, n) => n();
    const router = createAuthRouter({ pool: p, logger: leise, config: {}, requireAuth: durch, authLimiter: durch, getUserAndPlan: async () => null, sendMail: async () => true });
    const layer = router.stack.find((l) => l.route && l.route.path === "/auth/logout" && l.route.methods.post);
    const handle = layer.route.stack[layer.route.stack.length - 1].handle;
    const res = { locals: {}, clearCookie() {}, setHeader() {}, json(b) { this._json = b; return this; } };
    const req = {
      sessionID: SID, orgId: ORG, orgIdGiltFuerNutzer: KRAFT,
      session: { userId: KRAFT, destroy(cb) { delete req.session; cb(); } }
    };
    await handle(req, res);
    assert.equal(res.locals.auditAkteurNachSitzungsende, KRAFT);
    assert.equal(res.locals.audit.org_id, ORG);
    const ende = p.calls.find((c) => c.sql.includes("ende = 'abgemeldet'"));
    assert.ok(ende, "der Sitzungszeitraum wird geschlossen");
    assert.deepEqual(ende.params, [ep.sitzungHash(SID)]);
  });
});

/* ── 3. Die Liste — an die eigene Firma gebunden ─────────────────────────── */

describe("Liste: eigene Firma, eine Abfrage fuer alle Aktionen einer Seite", () => {
  it("jede Abfrage ist an die Firma gebunden", () => {
    assert.ok(ep.SITZUNGEN_SQL.includes("WHERE s.org_id = $1"));
    assert.ok(ep.SITZUNGEN_ZAHL_SQL.includes("WHERE s.org_id = $1"));
    assert.ok(ep.PERSONEN_SQL.includes("WHERE s.org_id = $1"));
    assert.ok(ep.AKTIONEN_SQL.includes("WHERE a.org_id = $1"));
    assert.ok(ep.AKTIONEN_SQL.includes("a.actor_id = ANY($2::uuid[])"));
  });

  it("ohne Firma keine Abfrage und nichts", async () => {
    const p = pool();
    assert.deepEqual(await ep.liste(p, null), { items: [], total: 0 });
    assert.deepEqual(await ep.personen(p, null), []);
    assert.equal(p.calls.length, 0);
  });

  it("keine Sitzungen: Leerzustand ohne Aktionsabfrage", async () => {
    const p = pool();
    assert.deepEqual(await ep.liste(p, ORG), { items: [], total: 0 });
    assert.equal(p.calls.some((c) => c.sql.includes("FROM audit_log")), false);
  });

  it("Bindung und Zuordnung: jede Aktion landet in der Sitzung, in deren Zeitraum sie fiel", async () => {
    const jetzt = Date.parse("2026-10-01T12:00:00Z");
    const s1 = { id: "s1", user_id: KRAFT, name: "Erika Einsatz", email: "e@x", begonnen_am: "2026-10-01T08:00:00Z", zuletzt_aktiv_am: "2026-10-01T08:30:00Z", beendet_am: "2026-10-01T08:30:00Z", ende: "abgemeldet" };
    const s2 = { id: "s2", user_id: KRAFT, name: "Erika Einsatz", email: "e@x", begonnen_am: "2026-10-01T10:00:00Z", zuletzt_aktiv_am: "2026-10-01T11:58:00Z", beendet_am: null, ende: null };
    const p = pool([
      { match: "SELECT COUNT(*)::int AS total", rows: [{ total: 2 }] },
      { match: "FROM einsatzportal_sitzungen s", rows: [s2, s1] },
      { match: "FROM audit_log a", rows: [
        { actor_id: KRAFT, action: "worker_submission.submit", status: "SUCCESS", created_at: "2026-10-01T08:10:00Z" },
        { actor_id: KRAFT, action: "worker.update_availability", status: "SUCCESS", created_at: "2026-10-01T09:00:00Z" },
        { actor_id: KRAFT, action: "worker_assignment.confirm", status: "DENIED", created_at: "2026-10-01T10:05:00Z" }
      ] }
    ]);
    const r = await ep.liste(p, ORG, { von: "2026-09-01", bis: "2026-10-02", userId: KRAFT, limit: 10, offset: 5, jetzt });
    const sitz = p.calls.find((c) => c.sql.includes("LIMIT $5 OFFSET $6"));
    assert.deepEqual(sitz.params, [ORG, "2026-09-01", "2026-10-02", KRAFT, 10, 5]);
    const akt = p.calls.find((c) => c.sql.includes("FROM audit_log a"));
    assert.deepEqual(akt.params, [ORG, [KRAFT], "2026-10-01T08:00:00.000Z", "2026-10-01T12:00:00.000Z"]);
    assert.equal(p.calls.length, 3, "zwei fuer die Sitzungen, EINE fuer alle Aktionen");
    assert.equal(r.total, 2);
    assert.deepEqual(r.items.map((z) => [z.id, z.status, z.aktionen.map((a) => a.action)]), [
      ["s2", "offen", ["worker_assignment.confirm"]],
      ["s1", "abgemeldet", ["worker_submission.submit"]]
    ], "die Aktion um 09:00 lag ausserhalb beider Sitzungen und wird keiner zugeschlagen");
    assert.equal(r.items[1].aktionen[0].label, "Einsatzportal: Stundenzettel eingereicht");
  });

  it("ein Kalendertag plus n — ohne Zeitzonen-Falle, ueber Monats- und Jahresgrenzen", () => {
    assert.equal(ep.tagPlus("2026-12-31", 1), "2027-01-01");
    assert.equal(ep.tagPlus("2026-02-28", 1), "2026-03-01");
    assert.equal(ep.tagPlus("2026-03-29", 1), "2026-03-30");
  });
});

/* ── 4. Die Wege der Verwaltung ──────────────────────────────────────────── */

describe("GET /org/einsatzportal/sitzungen (+ CSV): Wache, Bindung, Nachweis", () => {
  const baue = (p) => createOrgControlCenterRouter({ pool: p, logger: leise, requireAuth: function requireAuth(_q, _s, n) { n(); } });
  const kette = (r, pfad) => r.stack.find((l) => l.route && l.route.path === pfad && l.route.methods.get).route.stack;
  const resM = () => {
    const r = { _status: 200, _json: null, _send: null, _headers: {}, locals: {} };
    r.status = (c) => { r._status = c; return r; };
    r.json = (b) => { r._json = b; return r; };
    r.send = (b) => { r._send = b; return r; };
    r.setHeader = (k, v) => { r._headers[k] = v; };
    return r;
  };

  it("beide Wege: angemeldet, eigene Firma, nur owner/admin/platform_admin", async () => {
    for (const pfad of ["/org/einsatzportal/sitzungen", "/org/einsatzportal/sitzungen/export/csv"]) {
      // Die Rollenwache selbst ausfuehren — sie liest die Mitgliedschaft aus der Datenbank.
      // Eine Einsatzkraft und ein Disponent kommen nicht durch, der Owner schon.
      for (const [orgRole, erwartet] of [["worker", 403], ["dispatcher", 403], ["owner", null]]) {
        const p = pool([{ match: "FROM org_memberships om", rows: [{ role_key: orgRole, org_id: ORG }] }]);
        const k = kette(baue(p), pfad);
        assert.ok(k.length >= 4, pfad);
        const rolle = k[2].handle;
        assert.equal(rolle.name, "requireRoleMiddleware", `${pfad}: an dritter Stelle steht die Rollenwache`);
        const res = resM();
        let weiter = false;
        await rolle({ session: { userId: KRAFT }, orgId: ORG, query: {}, params: {} }, res, () => { weiter = true; });
        if (erwartet) assert.equal(res._status, erwartet, `${pfad}: ${orgRole}`);
        else assert.equal(weiter, true, `${pfad}: ${orgRole}`);
      }
    }
  });

  it("liest die Firma aus der Sitzung, nie aus der Anfrage; liefert scope", async () => {
    const p = pool();
    const r = baue(p);
    const k = kette(r, "/org/einsatzportal/sitzungen");
    const res = resM();
    await k[k.length - 1].handle({ orgId: ORG, session: { userId: KRAFT }, query: { org_id: "fremd", von: "2026-09-01", bis: "2026-09-30" } }, res);
    assert.equal(res._status, 200, JSON.stringify(res._json));
    assert.ok(p.calls.length >= 2);
    for (const c of p.calls) assert.equal(c.params[0], ORG);
    const sitz = p.calls.find((c) => c.sql.includes("LIMIT $5 OFFSET $6"));
    assert.equal(sitz.params[2], "2026-10-01", "bis ist einschliesslich — abgefragt wird bis vor den Folgetag");
    assert.deepEqual(res._json.data.scope, { org_id: ORG, date_from: "2026-09-01", date_to: "2026-09-30", user_id: null });
  });

  it("falsche Eingaben: 400 ohne Abfrage", async () => {
    const p = pool();
    const k = kette(baue(p), "/org/einsatzportal/sitzungen");
    for (const query of [{ user_id: "kein-uuid" }, { von: "01.10.2026" }, { limit: "9999" }]) {
      const res = resM();
      await k[k.length - 1].handle({ orgId: ORG, session: { userId: KRAFT }, query }, res);
      assert.equal(res._status, 400, JSON.stringify(query));
    }
    assert.equal(p.calls.length, 0);
  });

  it("der Export steht selbst im Protokoll und traegt Berliner Datum im Namen", async () => {
    const p = pool([{ match: "FROM einsatzportal_sitzungen s", rows: [] }, { match: "INSERT INTO audit_log", rows: [] }]);
    const k = kette(baue(p), "/org/einsatzportal/sitzungen/export/csv");
    const res = resM();
    await k[k.length - 1].handle({ orgId: ORG, session: { userId: KRAFT }, query: {}, headers: {}, ip: "127.0.0.1", get: () => "" }, res);
    assert.equal(res._status, 200);
    assert.match(res._headers["Content-Disposition"], /^attachment; filename="einsatzportal-\d{4}-\d{2}-\d{2}\.csv"$/);
    const audit = p.calls.find((c) => c.sql.includes("INSERT INTO audit_log"));
    assert.ok(audit && JSON.stringify(audit.params).includes("org.einsatzportal.export"));
    assert.ok(res._send.startsWith("Mitarbeiter,E-Mail,Angemeldet,Bis,Ende,Aktionen"));
  });
});

/* ── 5. Deutsche Namen fuer jede Aktion des Einsatzportals ───────────────── */

describe("Bezeichnungen: keine Aktion des Einsatzportals erscheint als 'Worker Update …'", () => {
  it("jede feste Aktion in workerPortal.js hat einen deutschen Namen", () => {
    const quelle = lies("routes/workerPortal.js");
    const feste = [...new Set([...quelle.matchAll(/action:\s*"(worker[a-z_.]*)"/g)].map((m) => m[1]))];
    assert.ok(feste.length >= 15, `zu wenige erkannt (${feste.length}) — Muster gebrochen?`);
    const ohne = feste.filter((a) => formatFeedItem({ action: a }).action_label === a
      || /^Worker /.test(formatFeedItem({ action: a }).action_label));
    assert.deepEqual(ohne, []);
  });

  it("auch die zusammengesetzten (Einsatzanfrage, Einsatzvorschlaege)", () => {
    for (const a of ["worker.staffing_request.accept", "worker.staffing_request.decline",
      "worker.staffing_choice_set.submit_preferences", "worker.staffing_choice_set.submit_ranking",
      "worker.staffing_choice_set.select_option", "worker.staffing_choice_set.decline_all"]) {
      assert.match(formatFeedItem({ action: a }).action_label, /^Einsatzportal: /, a);
    }
    // Die Gegenprobe: die Erkennung findet einen bekannten Fall.
    assert.ok(lies("routes/workerPortal.js").includes("`worker.staffing_request.${parsed.data.action}`"));
  });
});

/* ── 6. Export: Berliner Zeit, keine Formeln ─────────────────────────────── */

describe("Export: Zeitpunkte in Berliner Zeit, Namen ohne Formel-Ausfuehrung", () => {
  it("Sommer +2, Winter +1 — vorher stand hier UTC ohne Kennzeichnung", () => {
    assert.equal(fmtDateTime("2026-10-01T07:50:24Z"), "2026-10-01 09:50:24");
    assert.equal(fmtDateTime("2026-01-15T07:50:24Z"), "2026-01-15 08:50:24");
    assert.equal(fmtDateTime(null), "");
    assert.equal(fmtDateTime("kein datum"), "");
  });

  it("eine Formel-Marke am Anfang wird entschaerft, normaler Text bleibt", () => {
    for (const boese of ["=HYPERLINK(\"x\")", "+1", "-1", "@SUM(A1)", "\tx"]) assert.equal(csvText(boese), `'${boese}`);
    assert.equal(csvText("Erika Einsatz"), "Erika Einsatz");
    assert.equal(csvText(null), "");
  });

  it("eine Zeile je Sitzung, mit dem Ende in Worten", () => {
    const csv = exportEinsatzportalSitzungenCsv([{
      name: "=Erika", email: "e@x.de", begonnen_am: "2026-10-01T07:00:00Z", bis: null, status: "offen",
      aktionen: [{ zeitpunkt: "2026-10-01T07:05:00Z", label: "Einsatzportal: Stunden eingetragen" }]
    }]);
    const [kopf, zeile] = csv.split("\n");
    assert.equal(kopf, "Mitarbeiter,E-Mail,Angemeldet,Bis,Ende,Aktionen,Aktionen im Einzelnen");
    assert.ok(zeile.startsWith("'=Erika,e@x.de,2026-10-01 09:00:00,,"), zeile);
    assert.ok(zeile.includes("\"ohne Abmeldung, noch offen\",1,09:05 Einsatzportal: Stunden eingetragen"), zeile);
  });
});

/* ── 7. Aufbewahrung und Migration ───────────────────────────────────────── */

describe("Aufbewahrung 12 Monate und die Tabelle", () => {
  const mig = fs.readFileSync(path.join(API, "..", "sql", "migrations", "229_einsatzportal_sitzungen.sql"), "utf8");
  const tabelle = mig.slice(mig.indexOf("CREATE TABLE"), mig.indexOf(");", mig.indexOf("CREATE TABLE")));

  it("die Frist steht nur in der Datenbank", () => {
    assert.ok(/DELETE FROM einsatzportal_sitzungen\s+WHERE begonnen_am < NOW\(\) - INTERVAL '12 months';/.test(mig));
    assert.ok(!/INTERVAL\s+'\d+\s*months?'/i.test(lies("services/einsatzportalSitzungService.js")));
  });

  it("keine rohe Sitzungskennung, eindeutiger Hash, Ende nur mit Zeitpunkt", () => {
    assert.ok(tabelle.includes("sitzung_hash     CHAR(64) NOT NULL"));
    assert.ok(!/\bsid\b/.test(tabelle), "keine Spalte fuer die rohe Kennung");
    assert.ok(tabelle.includes("UNIQUE (sitzung_hash)"));
    assert.ok(tabelle.includes("CHECK ((beendet_am IS NULL) = (ende IS NULL))"));
    assert.ok(mig.includes("ROLLBACK") && mig.includes("DROP TABLE IF EXISTS einsatzportal_sitzungen;"));
  });

  it("der Takt: taeglich 04:20, Protokoll nur bei Wirkung", async () => {
    assert.equal(LAEUFE["einsatzportal-aufbewahrung"], einsatzportalAufbewahrung);
    assert.equal(TAKTE["einsatzportal-aufbewahrung"]?.intervall_min, 1440);
    assert.ok(/upsertJobScheduler\("einsatzportal-aufbewahrung-daily", \{ pattern: "20 4 \* \* \*" \}/.test(lies("workers/index.js")));
    const leer = pool([{ match: "einsatzportal_sitzungen_aufraeumen()", rows: [{ geloescht: 0 }] }]);
    await einsatzportalAufbewahrung(leer);
    assert.equal(leer.calls.length, 1);
    const voll = pool([{ match: "einsatzportal_sitzungen_aufraeumen()", rows: [{ geloescht: 7 }] }]);
    assert.deepEqual(await einsatzportalAufbewahrung(voll), { geloescht: 7 });
    assert.equal(voll.calls.filter((c) => /audit/i.test(c.sql)).length, 1);
  });
});

/* ── 8. Oberflaeche und Hinweis ──────────────────────────────────────────── */

describe("Oberflaeche: die Karte in der Verwaltung und der Hinweis im Portal", () => {
  const html = fs.readFileSync(path.join(API, "..", "frontend", "public", "organization.html"), "utf8");
  const js = fs.readFileSync(path.join(API, "..", "frontend", "public", "js", "pages", "verwaltung.js"), "utf8");
  const portal = fs.readFileSync(path.join(API, "..", "frontend", "public", "einsatzportal-profil.html"), "utf8");

  it("die Karte steht im Reiter Protokoll, unter dem Protokoll", () => {
    const panel = html.slice(html.indexOf('id="panel-protokoll"'), html.indexOf("</section>", html.indexOf('id="panel-protokoll"')));
    for (const id of ["vwEpKarte", "vwEpZeit", "vwEpPerson", "vwEpCsv", "vwEpListe", "vwEpZurueck", "vwEpWeiter"]) {
      assert.ok(panel.includes(`id="${id}"`), id);
    }
    assert.ok(panel.indexOf('id="vwProtListe"') < panel.indexOf('id="vwEpKarte"'), "unter dem Protokoll");
  });

  it("verdrahtet: ruft den Weg auf, bindet die Knoepfe, laedt mit dem Reiter, maskiert", () => {
    assert.ok(js.includes('TC.api.get("/org/einsatzportal/sitzungen?"'));
    assert.ok(js.includes('"/org/einsatzportal/sitzungen/export/csv?"'));
    assert.ok(js.includes("verdrahteEinsatzportal();"));
    assert.ok(/if \(neu \|\| !S\.geladen\.einsatzportal\) \{ S\.ep\.offset = 0; ladeEinsatzportal\(\); \}/.test(js));
    assert.ok(js.includes("esc(z.name || z.email || \"–\")"));
    assert.ok(js.includes("esc(a.label || a.action)"));
  });

  it("die Mitarbeiter erfahren, was ihre Firma sieht (DE und EN)", () => {
    assert.ok(portal.includes('data-i18n="ep.profil.sichtText"'));
    assert.equal((portal.match(/'ep\.profil\.sichtText':/g) || []).length, 2);
    assert.ok(portal.includes("Welche Seiten Sie nur ansehen, wird nicht erfasst."));
  });
});
