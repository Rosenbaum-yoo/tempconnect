/**
 * Der Waechter ueber die Mutations-Schwellen.
 *
 * OWNER-VORGABE 2026-09-01: 90 % Mutations-Punktzahl JE BEREICH — und fest
 * vorgeschrieben auch fuer weitere Bereiche, die spaeter dazukommen.
 *
 * WARUM ES DAFUER EINEN TEST BRAUCHT
 * Eine Schwelle ist eine Zahl in einer Konfigurationsdatei. Sie zu senken kostet
 * einen Tastendruck und faellt in keinem Diff auf, weil sie aussieht wie eine
 * Einstellung und nicht wie eine Zusage. Gemessen am 2026-09-01 standen die drei
 * vorhandenen Bereiche auf DREI VERSCHIEDENEN Werten:
 *
 *     stryker.subscription.conf.json   break: 0    <- gar kein Tor
 *     stryker.rbac.conf.json           break: 86
 *     stryker.monatsplan.conf.json     break: 70
 *
 * Ein Tor auf 0 ist kein Tor. Und drei verschiedene Latten sind keine Vorgabe,
 * sondern drei Meinungen.
 *
 * WAS DIESER TEST PRUEFT
 *   1. jede Stryker-Konfiguration haelt die vorgeschriebene Schwelle
 *   2. jede ist ueber ein npm-Skript ueberhaupt aufrufbar — eine Konfiguration,
 *      die niemand startet, ist eine Datei, keine Pruefung
 *   3. jede benennt Ziele und einen Testbefehl
 *
 * WAS ER NICHT PRUEFT: ob der Lauf die Schwelle auch ERREICHT. Das kostet je
 * Bereich zehn Minuten und gehoert nicht in die Suite, sondern in den
 * ausdruecklichen Lauf (`npm run test:mutation:<bereich>`). Dieser Test sorgt
 * dafuer, dass die Latte steht — nicht dafuer, dass jemand darueber springt.
 *
 * Run: node --test --test-force-exit test/mutationsSchwelle.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Die vorgeschriebene Schwelle. Owner-Vorgabe 2026-09-01. */
export const SCHWELLE = 90;

function findeApi() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "package.json"))
        && fs.existsSync(path.join(dir, "scripts", "run-tests.js"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const API = findeApi();

describe("Mutations-Schwelle — 90 % je Bereich, ohne Ausnahme",
  { skip: !API && "api/ nicht gefunden" }, () => {

  function konfigurationen() {
    return fs.readdirSync(API)
      .filter((f) => /^stryker\..+\.conf\.json$/.test(f))
      .map((f) => ({
        datei: f,
        inhalt: JSON.parse(fs.readFileSync(path.join(API, f), "utf8"))
      }));
  }

  it("es gibt ueberhaupt Bereiche, die mutiert werden", () => {
    /* Ohne diese Probe waere der ganze Waechter lautlos gruen, sobald jemand die
     * Konfigurationen umbenennt oder verschiebt — eine leere Liste besteht jede
     * Schleife. */
    const gefunden = konfigurationen();
    assert.ok(gefunden.length >= 3,
      `nur ${gefunden.length} Stryker-Konfiguration(en) gefunden — erwartet werden `
        + "mindestens drei (subscription, rbac, monatsplan)");
  });

  for (const { datei, inhalt } of (API ? fs.readdirSync(API)
    .filter((f) => /^stryker\..+\.conf\.json$/.test(f))
    .map((f) => ({ datei: f, inhalt: JSON.parse(fs.readFileSync(path.join(API, f), "utf8")) }))
    : [])) {

    it(`${datei}: die Schwelle steht auf ${SCHWELLE} %`, () => {
      const t = inhalt.thresholds || {};
      assert.equal(typeof t.break, "number",
        `${datei}: ohne \`thresholds.break\` bricht kein Lauf ab — das Tor waere offen`);
      assert.ok(t.break >= SCHWELLE,
        `${datei}: \`break\` steht auf ${t.break}, vorgeschrieben sind ${SCHWELLE}. `
          + "Eine gesenkte Schwelle sieht aus wie eine Einstellung und ist eine "
          + "zurueckgenommene Zusage.");
      assert.ok((t.low ?? 0) >= SCHWELLE,
        `${datei}: \`low\` darf nicht unter der Bruchschwelle liegen — sonst faerbt `
          + "der Bericht gruen, was den Lauf abbricht");
      assert.ok((t.high ?? 100) >= t.low,
        `${datei}: \`high\` liegt unter \`low\``);
    });

    it(`${datei}: benennt Ziele und einen Testbefehl`, () => {
      assert.ok(Array.isArray(inhalt.mutate) && inhalt.mutate.length > 0,
        `${datei}: ohne \`mutate\` wird nichts mutiert — der Lauf waere leer und gruen`);
      assert.ok(inhalt.commandRunner?.command,
        `${datei}: ohne Testbefehl kann kein Mutant sterben`);
      for (const ziel of inhalt.mutate) {
        assert.ok(fs.existsSync(path.join(API, ziel)),
          `${datei}: das Ziel ${ziel} gibt es nicht`);
      }
    });

    it(`${datei}: ist ueber ein npm-Skript aufrufbar`, () => {
      /* Eine Konfiguration, die niemand starten kann, ist eine Datei — keine
       * Pruefung. */
      const pkg = JSON.parse(fs.readFileSync(path.join(API, "package.json"), "utf8"));
      const skripte = Object.values(pkg.scripts || {});
      assert.ok(skripte.some((s) => s.includes(datei)),
        `${datei}: kein npm-Skript ruft diese Konfiguration auf`);
    });
  }

  it("jedes Mutations-Skript zeigt auf eine Konfiguration, die es gibt", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(API, "package.json"), "utf8"));
    for (const [name, befehl] of Object.entries(pkg.scripts || {})) {
      if (!name.startsWith("test:mutation")) continue;
      const m = String(befehl).match(/(stryker\.[\w.-]+\.conf\.json)/);
      assert.ok(m, `${name}: der Befehl nennt keine Konfiguration`);
      assert.ok(fs.existsSync(path.join(API, m[1])),
        `${name}: verweist auf ${m[1]}, das es nicht gibt`);
    }
  });
});
