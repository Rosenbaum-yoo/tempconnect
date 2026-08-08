/**
 * P9 C1 — die Preisrahmen-Seite entscheidet den Zugriff nicht mehr selbst.
 *
 * WARUM ES DIESEN TEST GIBT
 * `rate-cards.html` hat die Zugriffsregel neben `enterpriseSurfaceAccessService`
 * nachgebaut und dafuer `PlanFeatures.hasFeature()` benutzt. Diese Funktion liest
 * aus einer Matrix, die erst `PlanFeatures.load()` per `/api/plan-features`
 * fuellt — die Seite ruft `load()` nie auf und bindet auch `slaGuard.js` nicht
 * ein. Die Matrix blieb dauerhaft leer, `hasFeature()` lieferte immer `false`,
 * und die Seite war fuer JEDEN Nutzer auf JEDEM Plan `plan_locked`.
 *
 * Am echten Konto nachgemessen (`elmiraaaa@gmail.co`, company/owner/INDIVIDUELL):
 * Das Backend gibt frei — `canUseFeature('rate_card_management')` liefert
 * `allowed: true`, und `surface_access.rate_cards` steht auf `full` mit allen
 * Rechten. Gesperrt hat ausschliesslich das Frontend.
 *
 * Der Test haelt beides fest: dass die Seite der Server-Wahrheit folgt, und dass
 * die kaputte Ableitung nicht zurueckkommt.
 *
 * Run: node --test --test-force-exit test/rateCardAccessGate.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnterpriseSurfaceAccess } from "../services/enterpriseSurfaceAccessService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SEITE = path.join(REPO_ROOT, "frontend/public/rate-cards.html");

const vorhanden = fs.existsSync(SEITE);
const suite = vorhanden ? describe : describe.skip;

suite("P9/C1 · Preisrahmen-Zugriff kommt vom Server", () => {
  const html = vorhanden ? fs.readFileSync(SEITE, "utf8") : "";
  /* Kommentare raus, bevor auf Aufrufe geprueft wird — sonst schlaegt die
     Erklaerung des Defekts als Defekt an. */
  const code = html
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  it("liest `surface_access.rate_cards` statt selbst zu rechnen", () => {
    assert.match(html, /me\.surface_access && me\.surface_access\.rate_cards/,
      "die Seite muss die fertig aufgeloeste Zugriffslage des Servers benutzen");
  });

  it("benutzt PlanFeatures.hasFeature NICHT mehr fuer die Zugriffsentscheidung", () => {
    assert.ok(!/PlanFeatures\.hasFeature\(/.test(code),
      "hasFeature liest eine Matrix, die diese Seite nie laedt — sie liefert dort immer false");
  });

  it("wer hasFeature doch wieder braucht, muss die Matrix laden", () => {
    // Die Regel gilt allgemein: hasFeature ohne vorherigen load() ist auf jeder
    // Seite eine stille Falle. Entweder beides, oder keins von beidem.
    const nutztHasFeature = /PlanFeatures\.hasFeature\(/.test(code);
    const laedtMatrix = /PlanFeatures\.load\(/.test(code) || /slaGuard\.js/.test(code);
    assert.ok(!nutztHasFeature || laedtMatrix,
      "hasFeature ohne load() (und ohne slaGuard.js) ist immer false");
  });

  it("alle fuenf Modi des Servers haben eine Entsprechung auf der Seite", () => {
    for (const modus of ["full", "read_only", "plan_locked", "org_locked", "role_locked"]) {
      assert.match(html, new RegExp(`\\b${modus}\\s*:`),
        `Modus ${modus} wird nicht abgebildet — die Seite faellt dann auf den Ersatzweg zurueck`);
    }
  });

  // Gegenprobe an der Quelle: genau die Werte des betroffenen Kontos.
  it("das betroffene Konto ist serverseitig freigegeben (company/owner/INDIVIDUELL)", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({
      plan: "INDIVIDUELL", role: "company", orgType: "company", orgRole: "owner"
    });
    assert.equal(zugriff.rate_cards.mode, "full");
    assert.equal(zugriff.rate_cards.canRead, true);
    assert.equal(zugriff.rate_cards.canWrite, true);
  });

  it("eine Agentur bleibt gesperrt — die Fachregel aendert sich nicht", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({
      plan: "INDIVIDUELL", role: "agency", orgType: "agency", orgRole: "owner"
    });
    assert.equal(zugriff.rate_cards.mode, "org_locked");
    // Der Agentur-Zweig liefert bewusst nur den Modus, keine Capability-Flags —
    // die Seite muss daraus trotzdem "kein Lesezugriff" ableiten.
    assert.ok(!zugriff.rate_cards.canRead);
  });

  it("unter PRO bleibt es plan-gesperrt", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({
      plan: "PLUS", role: "company", orgType: "company", orgRole: "owner"
    });
    assert.equal(zugriff.rate_cards.mode, "plan_locked");
    assert.ok(!zugriff.rate_cards.canRead);
  });
});
