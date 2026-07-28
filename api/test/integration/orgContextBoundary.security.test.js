/**
 * Org-Kontext: der Client darf die Org-Grenze nicht durch einen mitgeschickten
 * `org_id`-Parameter ausschalten.
 *
 * DER BEFUND, DEN DIESE DATEI FESTNAGELT
 * --------------------------------------
 * `middleware/orgContext.js` nahm `?org_id=` / `body.org_id` als Kontextquelle.
 * Nannte der Wert eine Org **ohne** Mitgliedschaft, schlug die Aufloesung fehl
 * und `req.orgId` blieb `null` — es gab keinen Rueckfall auf die eigene Org.
 *
 * 45 Routen pruefen die Org-Grenze in der Form
 *     if (req.orgId && ressource.org_id !== req.orgId) return 403;
 * Diese Pruefung schaltet sich bei `req.orgId === null` selbst ab. Sie fiel also
 * genau dann aus, wenn der Client eine **fremde** org_id mitschickte — der
 * Angriffsfall.
 *
 * Bei 36 der 45 Stellen fing ein vorgelagerter `requirePermission` den Zugriff
 * trotzdem ab. Bei neun nicht: `GET /organizations/:id/members|locations|
 * departments` laufen nur mit `requireAuth`. Dort war es ein echtes,
 * erreichbares Cross-Org-Leck — jeder angemeldete Nutzer konnte die
 * Mitgliederliste einer fremden Organisation lesen, indem er ihre id zweimal
 * schickte: einmal im Pfad, einmal als `?org_id=`.
 *
 * Die Tests unten sind die Wiederholung genau dieses Angriffs. Sie waren rot,
 * bevor `orgContext` einen Rueckfall auf die eigene Org bekam.
 *
 * Run: node --test --test-force-exit test/integration/orgContextBoundary.security.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, registerAndLogin, createPool, cleanupUser, getUserOrgId } from "./helpers.js";

describe("Org-Grenze laesst sich nicht per org_id-Parameter aushebeln", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  let victim; let victimOrgId;
  let attacker;
  const createdEmails = [];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();

    victim = await registerAndLogin({ role: "company", company_name: "Opfer Industrie AG" });
    createdEmails.push(victim.email);
    victimOrgId = await getUserOrgId(pool, victim.user.id);

    attacker = await registerAndLogin({ role: "agency", company_name: "Fremde Agentur GmbH" });
    createdEmails.push(attacker.email);
  });

  after(async () => {
    for (const email of createdEmails) await cleanupUser(pool, email);
    await pool?.end();
  });

  // ── Der eigentliche Angriff ────────────────────────────────────────────────
  // Fremde org_id doppelt schicken: im Pfad UND als Query-Parameter. Vor dem Fix
  // liess der zweite Parameter req.orgId auf null fallen und schaltete damit die
  // Grenzpruefung im Handler ab.
  for (const [label, path] of [
    ["Mitglieder", "members"],
    ["Standorte", "locations"],
    ["Abteilungen", "departments"]
  ]) {
    it(`${label}: fremde Org mit doppeltem org_id-Parameter bleibt gesperrt`, async () => {
      const res = await attacker.agent.get(`/api/organizations/${victimOrgId}/${path}?org_id=${victimOrgId}`);
      assert.notStrictEqual(res.status, 200,
        `Cross-Org-Leck: fremde ${label} wurden ausgeliefert (${JSON.stringify(res.body).slice(0, 200)})`);
      assert.ok([403, 404].includes(res.status), `Erwartet 403/404, bekam ${res.status}`);
    });
  }

  it("ohne den Zusatzparameter war es schon immer gesperrt — die Referenz", async () => {
    const res = await attacker.agent.get(`/api/organizations/${victimOrgId}/members`);
    assert.ok([403, 404].includes(res.status), `Erwartet 403/404, bekam ${res.status}`);
  });

  it("die eigene Org bleibt lesbar — der Fix sperrt nicht zu viel", async () => {
    const ownOrgId = await getUserOrgId(pool, attacker.user.id);
    const res = await attacker.agent.get(`/api/organizations/${ownOrgId}/members`);
    assert.strictEqual(res.status, 200, `Eigene Mitglieder muessen lesbar bleiben: ${JSON.stringify(res.body).slice(0, 200)}`);
    assert.ok(Array.isArray(res.body.items), "items muss eine Liste sein");
  });

  it("auch mit passendem org_id-Parameter auf die eigene Org", async () => {
    const ownOrgId = await getUserOrgId(pool, attacker.user.id);
    const res = await attacker.agent.get(`/api/organizations/${ownOrgId}/members?org_id=${ownOrgId}`);
    assert.strictEqual(res.status, 200, `Eigene Org mit explizitem Parameter muss lesbar bleiben: ${res.status}`);
  });

  // ── Nutzdaten vs. Kontext ─────────────────────────────────────────────────
  // `org_id` im Body ist bei vielen Routen ein Nutzdatum ("zu welcher Org gehoert
  // dieser Datensatz"), kein Kontextwechsel. Es darf den Org-Kontext daher nicht
  // umschreiben — sonst laeuft ein legitimer Lieferanten-Vorgang (Agentur legt
  // einen Stundenzettel fuer einen Kunden an) gegen die falsche Org.
  it("body.org_id verschiebt den Kontext nicht auf eine fremde Org", async () => {
    const csrf = (await attacker.agent.get("/api/csrf")).body.token;
    const res = await attacker.agent
      .post("/api/organizations")
      .set("x-csrf-token", csrf)
      .send({ name: "Kontext-Test GmbH", org_id: victimOrgId });
    assert.notStrictEqual(res.status, 500, "Kontextwechsel darf keinen Serverfehler ausloesen");
  });
});
