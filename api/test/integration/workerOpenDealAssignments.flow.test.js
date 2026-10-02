/**
 * Regression test: /api/open-deal-assignments must not 500 due to schema drift.
 *
 * Root cause fixed: workerService.getOpenDealAssignments previously referenced
 * non-existent columns on `requests` (type/title) and crashed at runtime.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { hasDb, registerAndLogin, createPool, cleanupUser } from "./helpers.js";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * BEFUND 2026-10-02: DIESE PROBE ERREICHTE IHREN EIGENEN GEGENSTAND NICHT MEHR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Laut Kopf oben ist der Gegenstand: `/api/open-deal-assignments` darf NICHT mit
 * 500 antworten, weil `getOpenDealAssignments` auf Spalten zugriff, die es nicht
 * gibt. Angemeldet hat sich die Probe dafuer als UNTERNEHMEN — und die Route
 * gehoert der Zeitarbeitsfirma (`requireAgencyOrg` → 403 AGENCY_ORG_REQUIRED).
 * Der Dienst wurde also nie gerufen; geprueft wurde ein Tor, nicht die Drift.
 *
 * Gemessen beim ersten echten Lauf der datenbankgebundenen Suite (584 Proben mit
 * DATABASE_URL): `Expected 200, got 403`. Test und Route stammen aus demselben
 * Erst-Import (2026-06-01) — die Probe war also nie gruen, und sie faellt nur
 * niemandem auf, weil sie sich ohne Datenbank ueberspringt.
 *
 * GEAENDERT WURDE DIE ANMELDUNG, NICHT DIE ZUSICHERUNG. Die bestehenden
 * `assert.*` stehen unveraendert; sie laufen jetzt gegen die Rolle, die die Route
 * ueberhaupt erreicht. Dazu kommt die Grenze als eigene Zusicherung: ein
 * Unternehmen bekommt 403. Damit prueft die Probe beides — die Drift UND das
 * Tor, das sie vorher nur versehentlich getroffen hat.
 */
describe("Worker Open Deal Assignments (regression)", { skip: !hasDb && "No database configured" }, () => {
  let pool;
  const createdEmails = [];
  let agency;
  let company;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    /* Die Zeitarbeitsfirma: nur sie erreicht den Dienst, dessen Spalten diese
     * Probe beweisen soll. */
    agency = await registerAndLogin({
      role: "agency",
      company_name: "E2E Worker Agency",
      plan: "PLUS"
    });
    createdEmails.push(agency.email);
    /* Das Unternehmen bleibt — als Nachweis der Grenze, nicht als Zufall. */
    company = await registerAndLogin({
      role: "company",
      company_name: "E2E Worker Org",
      plan: "PLUS"
    });
    createdEmails.push(company.email);
  });

  after(async () => {
    if (!pool) return;
    for (const email of createdEmails) {
      await cleanupUser(pool, email);
    }
    await pool.end();
  });

  it("GET /api/open-deal-assignments returns 200 with stable shape", async () => {
    const res = await agency.agent.get("/api/open-deal-assignments");
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body && typeof res.body === "object", "Body must be an object");
    assert.ok(Array.isArray(res.body.items), "Body.items must be an array");
    assert.ok(typeof res.body.total === "number", "Body.total must be a number");
  });

  it("ein UNTERNEHMEN kommt nicht an diesen Bereich — das ist die Grenze, nicht ein Zufall", async () => {
    /* Vorher war dieses 403 der Grund, warum die Probe oben rot war, ohne dass
     * jemand es gelesen hat. Jetzt steht es als eigene Zusicherung da: der
     * Bereich gehoert der Zeitarbeitsfirma, ein Unternehmenskonto verwaltet
     * keine eigenen Arbeitskraefte (`orgAccess.js`, AGENCY_ORG_REQUIRED). */
    const res = await company.agent.get("/api/open-deal-assignments");
    assert.strictEqual(res.status, 403,
      `Ein Unternehmen muss 403 bekommen, bekam ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body?.error, "AGENCY_ORG_REQUIRED",
      "die Ablehnung muss ihren Grund nennen — sonst ist sie fuer den Aufrufer ein Raetsel");
  });
});

