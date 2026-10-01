/**
 * Das Staff Control Center bekommt seinen Versandweg.
 *
 * BEFUND 2026-10-01: `createStaffControlCenterRouter` las `sendMail` aus seinen
 * Abhaengigkeiten — Benachrichtigungen bei Statuswechseln von Abo-Anfragen, die
 * Umwandlung strategischer Anfragen, seit W-E10 die Produkt-Updates. `app.js`
 * uebergab aber nur `{ pool, logger, staffLoginLimiter }`. Jede dieser Mails endete
 * still als "kein Versandweg"; die Tests merkten nichts, weil JEDER Test den Router
 * mit einer eigenen `sendMail`-Attrappe baut. Genau diese Luecke schliesst diese
 * Probe: sie liest die echte Verdrahtung.
 *
 * Run: node --test --test-force-exit test/staffMailVerdrahtung.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "app.js");

describe("Staff Control Center: die echte Verdrahtung in app.js", () => {
  const text = fs.readFileSync(APP, "utf8");
  const zeile = (text.match(/const sccDeps = \{([^}]*)\}/) || [])[1] || "";

  it("sccDeps ist auffindbar", () => {
    assert.ok(zeile, "die Zeile `const sccDeps = { … }` fehlt — Probe anpassen, nicht loeschen");
  });

  for (const dep of ["pool", "logger", "sendMail", "getUserAndPlan"]) {
    it(`sccDeps reicht ${dep} weiter`, () => {
      assert.match(zeile, new RegExp(`\\b${dep}\\b`), `${dep} fehlt in sccDeps: {${zeile}}`);
    });
  }

  it("der Center-Router bekommt genau diese Abhaengigkeiten", () => {
    assert.match(text, /createStaffControlCenterRouter\(sccDeps\)/);
  });
});
