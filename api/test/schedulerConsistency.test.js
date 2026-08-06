/**
 * Zeitplan-Konsistenz: jeder interne Endpunkt ist entweder verplant oder
 * ausdruecklich ausgenommen.
 *
 * WARUM ES DIESEN TEST GIBT
 * Am 2026-08-06 ergab ein Abgleich: 16 von 25 implementierten
 * `/api/internal/*`-Endpunkten standen in KEINEM Zeitplan. Darunter die
 * Notdienst-Eskalation, der Sweep, der Angebote nach Einsatzende wieder
 * freigibt, und der DSGVO-Aufbewahrungslauf.
 *
 * Der entscheidende Punkt: Die gesamte Testsuite war dabei gruen. Der Code war
 * richtig — er wurde nur nie gerufen. Diese Luecke ist in Unit-Tests
 * grundsaetzlich unsichtbar, weil sie nicht im Code liegt, sondern zwischen
 * Code und Betrieb. Genau dort setzt dieser Test an.
 *
 * Er prueft NICHT, ob ein Cron laeuft (das kann er nicht wissen), sondern ob
 * jemand ueberhaupt darueber entschieden hat. Ein neuer Endpunkt zwingt damit
 * zu einer bewussten Entscheidung: Takt eintragen oder begruenden, warum nicht.
 *
 * Run: node --test --test-force-exit test/schedulerConsistency.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

const ROUTES = path.join(API_ROOT, "routes/internal.js");
const PLAN = path.join(REPO_ROOT, "docs/SCHEDULER.md");

const verfuegbar = fs.existsSync(ROUTES) && fs.existsSync(PLAN);
const suite = verfuegbar ? describe : describe.skip;

/** Alle im Router definierten internen Endpunkte. */
function implementierteEndpunkte() {
  const src = fs.readFileSync(ROUTES, "utf8");
  return [...src.matchAll(/router\.post\(\s*"\/internal\/([a-z0-9-]+)"/g)].map((m) => m[1]);
}

/**
 * Alle im Plan erwaehnten Endpunkte. Bewusst tolerant gelesen (Tabelle ODER
 * Crontab-Zeile): der Plan soll fuer Menschen lesbar bleiben, nicht fuer den Test.
 */
function verplanteEndpunkte() {
  const doc = fs.readFileSync(PLAN, "utf8");
  return new Set([...doc.matchAll(/\/api\/internal\/([a-z0-9-]+)/g)].map((m) => m[1]));
}

suite("Zeitplan ↔ Code", () => {
  it("jeder interne Endpunkt ist verplant oder ausdruecklich ausgenommen", () => {
    const impl = implementierteEndpunkte();
    const geplant = verplanteEndpunkte();
    assert.ok(impl.length > 10, `zu wenige Endpunkte erkannt (${impl.length}) — Regex gebrochen?`);

    const ohneEntscheidung = impl.filter((e) => !geplant.has(e)).sort();
    assert.deepEqual(ohneEntscheidung, [],
      "Diese internen Endpunkte stehen in keinem Zeitplan. Ein Endpunkt, den niemand " +
      "ruft, ist toter Code im Betrieb — und faellt erst auf, wenn ein Kunde ihn " +
      "vermisst. Entweder in docs/SCHEDULER.md takten oder dort unter " +
      "'Bewusst NICHT geplant' mit Begruendung eintragen.");
  });

  it("der Plan erfindet keine Endpunkte, die es nicht gibt", () => {
    const impl = new Set(implementierteEndpunkte());
    const geplant = [...verplanteEndpunkte()];
    // Historische Sonderfaelle: Pfade, die im Plan bewusst anders geschrieben sind.
    const AUSNAHMEN = new Set(["infrastructure-snapshots"]);
    const verwaist = geplant.filter((e) => !impl.has(e) && !AUSNAHMEN.has(e)).sort();
    assert.deepEqual(verwaist, [],
      "Der Plan taktet Endpunkte, die im Code nicht (mehr) existieren. Ein Cron, der " +
      "ins Leere laeuft, sieht im Log aus wie ein Fehler und verdeckt echte.");
  });

  it("die Ausnahmeliste bleibt ehrlich: jeder Eintrag traegt eine Begruendung", () => {
    const doc = fs.readFileSync(PLAN, "utf8");
    const block = doc.match(/### Bewusst NICHT geplant[\s\S]*?(?=\n## |\n### |$)/);
    assert.ok(block, "Abschnitt 'Bewusst NICHT geplant' fehlt");
    const zeilen = [...block[0].matchAll(/^\|\s*`POST \/api\/internal\/([a-z0-9-]+)`\s*\|\s*([^|]+)\|/gm)];
    assert.ok(zeilen.length > 0, "Ausnahmeliste ist leer, obwohl der Abschnitt existiert");
    for (const [, name, grund] of zeilen) {
      assert.ok(grund.trim().length > 25, `Ausnahme ohne echte Begruendung: ${name}`);
    }
  });
});
