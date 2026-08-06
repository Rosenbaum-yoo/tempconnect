/**
 * Vermittlungsrelevante Angaben zur Einsatzkraft (B7, Mig 162).
 *
 * Diese Suite haelt vor allem die ENTSCHEIDUNGEN fest, nicht nur den Code.
 * Owner-Entscheidungen vom 2026-08-06:
 *   1. Vier Felder: Fuehrerschein/Fahrzeug, Arbeitserlaubnis, Schichtbereitschaft,
 *      Notfallkontakt.
 *   2. Alter als Ja/Nein ("ueber 18"), NICHT als Geburtsdatum.
 *   3. KEINE Lohndaten (IBAN, Sozialversicherungsnummer, Steuer-ID).
 *   4. Alles optional — zaehlt in den Fortschritt, blockiert die
 *      Einsatzbereitschaft nicht.
 *
 * Punkt 3 ist der wichtigste und zugleich der, den ein spaeterer Ausbau am
 * leichtesten aufweicht ("das eine Feld noch"). Deshalb steht er hier als Test:
 * IBAN und SV-Nummer in einer Vermittlungsplattform verbessern die Vermittlung
 * um null und machen ein Datenleck meldepflichtig.
 *
 * Run: node --test --test-force-exit test/workerPlacementFacts.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as onboarding from "../services/workerOnboardingService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

const MIG = fs.readFileSync(
  path.join(REPO_ROOT, "sql/migrations/162_worker_placement_facts.sql"), "utf8"
);

describe("Migration 162 — die Entscheidungen stehen im Schema", () => {
  it("Alter als Ja/Nein, nicht als Geburtsdatum", () => {
    assert.match(MIG, /is_of_age BOOLEAN/);
    assert.doesNotMatch(MIG, /ADD COLUMN IF NOT EXISTS (birth|geburts)/i);
  });

  it("is_of_age ist nullable — 'nicht beantwortet' ist nicht 'minderjaehrig'", () => {
    assert.doesNotMatch(MIG, /is_of_age BOOLEAN NOT NULL/,
      "eine unbeantwortete Frage darf niemanden von Einsaetzen ausschliessen");
  });

  it("Mengen statt Freitext — sonst zerfaellt das Matching in Schreibvarianten", () => {
    assert.match(MIG, /driving_licence_classes TEXT\[\]/);
    assert.match(MIG, /shift_readiness TEXT\[\]/);
    assert.match(MIG, /USING GIN \(shift_readiness\)/);
    assert.match(MIG, /USING GIN \(driving_licence_classes\)/);
  });

  it("KEINE Lohndaten — die Entscheidung ist im Schema festgeschrieben", () => {
    for (const verboten of [/iban/i, /sozialversicherung/i, /social_security/i, /tax_id/i, /steuer_?id/i]) {
      const treffer = MIG.split("\n").filter((z) => verboten.test(z) && /ADD COLUMN/i.test(z));
      assert.deepEqual(treffer, [],
        `Lohndatenfeld gefunden (${verboten}) — sie gehoeren ins Lohnsystem, nicht hierher`);
    }
  });

  it("nennt einen Rollback-Weg", () => {
    assert.match(MIG, /Rollback:/);
    assert.match(MIG, /DROP COLUMN IF EXISTS is_of_age/);
  });
});

describe("Aufnahme — der neue Schritt fuehrt, blockiert aber nicht", () => {
  const step = onboarding.SCHRITTE.find((s) => s.key === "placement");

  it("es gibt ihn, und er ist NICHT Pflicht (Entscheidung 4)", () => {
    assert.ok(step, "Schritt 'placement' fehlt");
    assert.equal(step.pflicht, false,
      "eine feste Pflicht waere fuer die Haelfte der Faelle falsch");
  });

  it("er liegt vor den Nachweisen — erst was jeden betrifft, dann das Einsatzabhaengige", () => {
    const keys = onboarding.SCHRITTE.map((s) => s.key);
    assert.ok(keys.indexOf("placement") < keys.indexOf("documents"));
  });

  /** Pool-Attrappe: keine Skills/Dokumente/Einsaetze, damit nur der neue Schritt zaehlt. */
  const pool = { query: async () => ({ rows: [] }) };
  const basis = { id: "wp-1", user_id: "u-1", first_name: "Ada", last_name: "Stahl", phone: "+49 30 1" };

  it("unbeantwortet: drei offene Punkte, aber weiterhin einsatzfaehig-faehig", async () => {
    const p = await onboarding.getOnboardingProgress(pool, basis);
    const s = p.schritte.find((x) => x.key === "placement");
    assert.deepEqual(s.offen.sort(), ["emergency_contact_phone", "is_of_age", "shift_readiness"]);
    assert.equal(s.erledigt, false);
    assert.equal(s.pflicht, false, "er darf die Einsatzbereitschaft nicht kippen");
  });

  it("ausgefuellt: erledigt", async () => {
    const p = await onboarding.getOnboardingProgress(pool, {
      ...basis, is_of_age: true, shift_readiness: ["frueh", "nacht"], emergency_contact_phone: "+49 170 1"
    });
    const s = p.schritte.find((x) => x.key === "placement");
    assert.equal(s.erledigt, true);
    assert.deepEqual(s.offen, []);
  });

  it("is_of_age=false zaehlt als beantwortet — 'nein' ist eine Antwort", async () => {
    const p = await onboarding.getOnboardingProgress(pool, {
      ...basis, is_of_age: false, shift_readiness: ["frueh"], emergency_contact_phone: "+49 170 1"
    });
    assert.equal(p.schritte.find((x) => x.key === "placement").erledigt, true);
  });

  it("der Fuehrerschein zaehlt bewusst NICHT mit", async () => {
    // Eine Lagerkraft ohne Fahrerlaubnis waere sonst dauerhaft "unvollstaendig",
    // obwohl ihr nichts fehlt — und ein Hinweis, der bei der Haelfte der Leute
    // falsch ist, wird ignoriert und entwertet alle anderen.
    const p = await onboarding.getOnboardingProgress(pool, {
      ...basis, is_of_age: true, shift_readiness: ["frueh"], emergency_contact_phone: "+49 170 1",
      driving_licence_classes: []
    });
    assert.equal(p.schritte.find((x) => x.key === "placement").erledigt, true);
  });
});

describe("Schreibweg", () => {
  const route = fs.readFileSync(path.join(API_ROOT, "routes/workerPortal.js"), "utf8");
  const svc = fs.readFileSync(path.join(API_ROOT, "services/workerService.js"), "utf8");

  it("Klassen und Schichten sind geschlossene Mengen, kein Freitext", () => {
    assert.match(route, /const LICENCE_CLASSES = \[/);
    assert.match(route, /const SHIFTS = \[/);
    assert.match(route, /driving_licence_classes: z\.array\(z\.enum\(LICENCE_CLASSES\)\)/);
    assert.match(route, /shift_readiness:\s+z\.array\(z\.enum\(SHIFTS\)\)/);
  });

  it("is_of_age ist nullbar — die Angabe laesst sich zuruecknehmen", () => {
    assert.match(route, /is_of_age:\s+z\.boolean\(\)\.optional\(\)\.nullable\(\)/);
  });

  it("die neuen Felder sind wirklich schreibbar (allowed-Liste)", () => {
    for (const f of ["is_of_age", "driving_licence_classes", "has_own_vehicle",
                     "shift_readiness", "emergency_contact_name", "emergency_contact_phone"]) {
      assert.ok(svc.includes(`"${f}"`), `Feld nicht schreibbar: ${f}`);
    }
  });

  it("kein Lohndatenfeld hat sich in den Schreibweg geschlichen", () => {
    for (const f of ["iban", "tax_id", "social_security_number"]) {
      assert.ok(!route.includes(f), `Lohndatenfeld im Schema: ${f}`);
    }
  });
});
