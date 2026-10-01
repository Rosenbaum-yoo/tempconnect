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

describe("Staff-Sitzung: eigene Namen fuer Schluessel und Index (Migration 226)", () => {
  // connect-pg-simple benennt Primaerschluessel und Index fest nach "session".
  // Ohne eigene Anlage der Staff-Tabelle scheitert auf einer frischen Datenbank
  // jeder Staff-Login mit 500 ("relation session_pkey already exists").
  const migration = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sql", "migrations", "226_staff_sitzung_eigene_namen.sql"), "utf8");
  const app = fs.readFileSync(APP, "utf8");

  it("die Migration legt staff_session mit eigenem Schluessel- und Indexnamen an", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_session/);
    assert.match(migration, /CONSTRAINT staff_session_pkey PRIMARY KEY/);
    assert.match(migration, /"IDX_staff_session_expire"/);
    assert.match(migration, /RENAME CONSTRAINT session_pkey TO staff_session_pkey/, "der Rettungsweg fuer bereits falsch belegte Namen fehlt");
  });

  it("app.js nutzt genau diese Tabelle fuer den Staff-Speicher", () => {
    assert.match(app, /tableName: "staff_session"/);
  });
});
