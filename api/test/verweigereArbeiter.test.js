/**
 * `verweigereArbeiter` — der Arbeiter verwaltet nicht die Firma.
 *
 * Der Riegel entstand in M2.5 fuer die vier Wege, die die OEFFENTLICHE
 * DARSTELLUNG der Organisation fuehren. Die Messung, die ihn ausgeloest hat, war
 * GET-only; drei der vier Wege sind SCHREIBWEGE. Ohne diese Datei waere
 * `/settings/pause` verriegelt und nichts wuerde es bezeugen.
 *
 * WORUM ES GEHT
 * Ein Arbeiter ist Mitglied in der Org seiner Zeitarbeitsfirma
 * (`workerService.acceptInvite`, role_key='worker' auf die supplier_org_id).
 * `req.orgId` zeigt damit auf seinen Arbeitgeber. Die vier Routen trugen nur
 * `requireAuth` und ein PLAN-Tor — und das Tor prueft den Plan der FIRMA. Je
 * besser deren Tarif, desto weiter kam er: `/settings/pause` haette ihm erlaubt,
 * das oeffentliche Profil seines Arbeitgebers abzuschalten.
 *
 * Lauf: node --test --test-force-exit test/verweigereArbeiter.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { verweigereArbeiter } from "../middleware/orgAccess.js";
import { createProfileVisibilityRouter } from "../routes/profileVisibility.js";
import { createProfileBountiesRouter } from "../routes/profileBounties.js";

const UID = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";

const still = () => {};
const logger = { info: still, warn: still, error: still, debug: still, child: () => logger };
const durch = (_q, _r, n) => n();

function pool() {
  const antwort = (sql) => {
    const s = String(sql);
    if (/profile_visibility_settings/i.test(s)) {
      return { rows: [{ id: "s1", org_id: ORG, is_public: false, status: "rejected",
        reviewed_by: "STAFF-KENNUNG", rejection_reason: "GRUND-DER-ABLEHNUNG",
        suspended_reason: null }] };
    }
    if (/org_memberships/i.test(s)) {
      return { rows: [{ user_id: UID, org_id: ORG, role_key: "worker", is_active: true,
        org_type: "agency", org_plan: "PRO" }] };
    }
    return { rows: [] };
  };
  return {
    query: async (s) => antwort(s),
    connect: async () => ({ query: async (s) => antwort(s), release() {} }),
    on() {}
  };
}

/** Die echte Fläche, mit der Rolle als einziger Stellschraube. */
function flaeche(rolle) {
  const app = express();
  app.use(express.json());
  app.use((req, _r, n) => {
    req.session = { userId: UID, userRole: rolle === "worker" ? "worker" : "company" };
    req.orgId = ORG;
    req.orgRole = rolle;
    req.orgMembership = { role_key: rolle, org_id: ORG, org_type: "agency" };
    n();
  });
  app.use("/api/v1", createProfileVisibilityRouter({
    pool: pool(), logger, requireAuth: durch, requireFeature: () => durch
  }));
  app.use((err, _q, res, _n) => res.status(500).json({ fehler: String(err.message).slice(0, 60) }));
  return app;
}

const WEGE = [
  ["get", "/profile-visibility/settings"],
  ["post", "/profile-visibility/settings/opt-in"],
  ["post", "/profile-visibility/settings/submit"],
  ["post", "/profile-visibility/settings/pause"]
];

describe("verweigereArbeiter", () => {

  it("weist den Arbeiter auf ALLEN vier Verwaltungswegen ab", async () => {
    for (const [verb, pfad] of WEGE) {
      const res = await request(flaeche("worker"))[verb]("/api/v1" + pfad).send({});
      assert.equal(res.status, 403,
        `${verb.toUpperCase()} ${pfad}: der Arbeiter kommt durch (${res.status})`);
      assert.equal(res.body?.error, "WORKER_NOT_ALLOWED",
        `${verb.toUpperCase()} ${pfad}: abgewiesen, aber aus dem falschen Grund `
        + `(${JSON.stringify(res.body)}) — ein Zufallstreffer waere kein Riegel`);
    }
  });

  it("das Urteil ueber die Firma erreicht ihn nicht", async () => {
    /* Nicht der Statuscode zaehlt, sondern was NICHT im Rumpf steht. */
    const res = await request(flaeche("worker")).get("/api/v1/profile-visibility/settings");
    for (const geheim of ["STAFF-KENNUNG", "GRUND-DER-ABLEHNUNG", "rejected"]) {
      assert.ok(!String(res.text).includes(geheim),
        `"${geheim}" steht in der Antwort an den Arbeiter — genau das war der Befund`);
    }
  });

  it("der Disponent derselben Firma arbeitet weiter", async () => {
    /* Der Riegel gilt der ROLLE 'worker', nicht "alle ausser owner/admin". Wer die
       oeffentliche Darstellung fuehren darf, ist eine Produktfrage (M2.6) — dieser
       Riegel darf sie nicht im Vorbeigehen beantworten. */
    for (const rolle of ["dispatcher", "recruiter", "program_manager", "owner"]) {
      const res = await request(flaeche(rolle)).get("/api/v1/profile-visibility/settings");
      assert.notEqual(res.status, 403,
        `Rolle '${rolle}' wird abgewiesen — der Riegel greift zu weit `
        + `(${JSON.stringify(res.body)})`);
    }
  });

  it("… und er kommt auch an die Praemien, lesend wie schreibend", async () => {
    /* Die Gegenprobe muss ALLE verriegelten Flaechen abdecken. Sonst beweist sie
       nur, dass EINE davon nicht zu weit greift. */
    for (const rolle of ["dispatcher", "owner"]) {
      const app = express();
      app.use(express.json());
      app.use((req, _r, n) => {
        req.session = { userId: UID, userRole: "company" };
        req.orgId = ORG;
        req.orgRole = rolle;
        req.orgMembership = { role_key: rolle, org_id: ORG, org_type: "agency" };
        n();
      });
      app.use("/api/v1", createProfileBountiesRouter({
        pool: pool(), logger, requireAuth: durch, requireFeature: () => durch
      }));
      app.use((err, _q, res, _n) => res.status(500).json({ fehler: String(err.message).slice(0, 60) }));

      for (const [verb, pfad] of [["get", "/profile-bounties/me"], ["post", "/profile-bounties/me"]]) {
        const res = await request(app)[verb]("/api/v1" + pfad).send({ bounty_type: "empfehlung" });
        assert.notEqual(res.status, 403,
          `${verb.toUpperCase()} ${pfad} als '${rolle}': abgewiesen — der Riegel greift `
          + `zu weit (${JSON.stringify(res.body)})`);
      }
    }
  });

  it("die Praemien der Firma sind ebenfalls zu — auch die Schreibwege", async () => {
    /*
     * `/profile-bounties/me` heisst "me" und meint die ORG
     * (`getOrgBountyHistory(pool, req.orgId)`). Die Schreibwege wiegen schwerer
     * als der Leseweg: POST legt einen Antrag mit der orgId der FIRMA an, DELETE
     * storniert einen bestehenden. Ohne diese Probe waeren drei der vier Wege
     * verriegelt, ohne dass irgendetwas es bezeugt — die Messung aus M2.5 sieht
     * nur GET-Routen.
     */
    const app = express();
    app.use(express.json());
    app.use((req, _r, n) => {
      req.session = { userId: UID, userRole: "worker" };
      req.orgId = ORG;
      req.orgRole = "worker";
      req.orgMembership = { role_key: "worker", org_id: ORG, org_type: "agency" };
      n();
    });
    app.use("/api/v1", createProfileBountiesRouter({
      pool: pool(), logger, requireAuth: durch, requireFeature: () => durch
    }));
    app.use((err, _q, res, _n) => res.status(500).json({ fehler: String(err.message).slice(0, 60) }));

    const wege = [
      ["get", "/profile-bounties/me"],
      ["post", "/profile-bounties/me"],
      ["post", "/profile-bounties/b1/submit"],
      ["delete", "/profile-bounties/b1"]
    ];
    for (const [verb, pfad] of wege) {
      const res = await request(app)[verb]("/api/v1" + pfad).send({ bounty_type: "empfehlung" });
      assert.equal(res.status, 403,
        `${verb.toUpperCase()} ${pfad}: der Arbeiter kommt durch (${res.status})`);
      assert.equal(res.body?.error, "WORKER_NOT_ALLOWED",
        `${verb.toUpperCase()} ${pfad}: abgewiesen, aber aus dem falschen Grund `
        + `(${JSON.stringify(res.body)})`);
    }
  });

  it("er handelt nicht im Namen seiner Firma — Befürworten und Merken sind zu", async () => {
    /*
     * Owner-Entscheid 2026-09-03. `like`/`favorite` schreiben `likerOrgId: req.orgId`:
     * ein Arbeiter haette ein fremdes Firmenprofil im Namen SEINER Agentur oeffentlich
     * befuerwortet, und die haette nie davon erfahren. Kein Datenabfluss — deshalb hat
     * die Messung aus M2.5 (GET-only) diese vier Wege nicht gesehen, und deshalb
     * braucht es hier eine eigene Probe.
     */
    const wege = [
      ["post", "/profile-visibility/" + ORG + "/like"],
      ["delete", "/profile-visibility/" + ORG + "/like"],
      ["post", "/profile-visibility/" + ORG + "/favorite"],
      ["delete", "/profile-visibility/" + ORG + "/favorite"]
    ];
    for (const [verb, pfad] of wege) {
      const res = await request(flaeche("worker"))[verb]("/api/v1" + pfad).send({});
      assert.equal(res.status, 403,
        `${verb.toUpperCase()} ${pfad}: der Arbeiter handelt weiter im Namen der Firma (${res.status})`);
      assert.equal(res.body?.error, "WORKER_NOT_ALLOWED",
        `${verb.toUpperCase()} ${pfad}: abgewiesen, aber aus dem falschen Grund `
        + `(${JSON.stringify(res.body)})`);
    }
    /* Und die Gegenprobe: wer die Firma vertritt, darf es weiterhin. */
    for (const rolle of ["dispatcher", "owner"]) {
      const res = await request(flaeche(rolle)).post("/api/v1/profile-visibility/" + ORG + "/like").send({});
      assert.notEqual(res.status, 403,
        `Rolle '${rolle}' wird abgewiesen — der Riegel greift zu weit (${JSON.stringify(res.body)})`);
    }
  });

  it("erkennt den Arbeiter an BEIDEN Merkmalen, einzeln", async () => {
    /* Zwei Quellen, weil zwei Wege dorthin fuehren: die Mitgliedschaft
       (org_memberships.role_key) und die Sitzung (users.role). Faellt eine aus,
       muss die andere allein tragen — sonst ist der Riegel von einer Reihenfolge
       in der Middleware abhaengig, die niemand garantiert. */
    const tor = verweigereArbeiter({ logger });
    const faelle = [
      ["nur die Mitgliedschaft", { orgMembership: { role_key: "worker" }, session: {} }],
      ["nur die Sitzung", { session: { userRole: "worker" } }],
      ["nur req.orgRole", { orgRole: "worker", session: {} }],
      ["mit Grossschreibung", { session: { userRole: "WORKER" } }],
      ["mit Leerzeichen", { orgRole: " worker ", session: {} }]
    ];
    for (const [name, req] of faelle) {
      let code = null;
      const res = { status(c) { code = c; return this; }, json() { return this; } };
      let weiter = false;
      tor({ ...req }, res, () => { weiter = true; });
      assert.equal(code, 403, `${name}: nicht erkannt`);
      assert.equal(weiter, false, `${name}: der Riegel hat trotzdem durchgelassen`);
    }
  });

  it("laesst durch, wo niemand 'worker' ist", () => {
    const tor = verweigereArbeiter({ logger });
    for (const req of [
      { orgMembership: { role_key: "owner" }, session: { userRole: "company" } },
      { session: {} },
      {}
    ]) {
      let weiter = false;
      tor(req, { status() { return this; }, json() { return this; } }, () => { weiter = true; });
      assert.equal(weiter, true,
        `${JSON.stringify(req)} wird abgewiesen — der Riegel faerbt Gesunde rot`);
    }
  });
});
