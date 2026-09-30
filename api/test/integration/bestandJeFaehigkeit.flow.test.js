/**
 * `aggregateBySkill` am REALEN Schema (N1.3, 2026-09-06).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESE ZWEITE SCHICHT BRAUCHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Form der Abfrage prueft `test/bestandJeFaehigkeit.test.js` gegen einen
 * Muster-Zugang. Der nimmt jede Abfrage an, egal wie ihre Spalten heissen und
 * ob Postgres sie ueberhaupt versteht.
 *
 * Wie noetig das ist, zeigt eine Verwechslung beim Bauen: ich hielt
 * `TRIM(UNNEST(cp.skill_tags))` fuer von Postgres abgewiesen und habe es
 * umgeschrieben. Die Rueckmutation hat die Annahme widerlegt — beide Formen
 * laufen (PostgreSQL 16.12, gemessen am 2026-09-06). Die Lehre ist nicht
 * kleiner dadurch, nur eine andere: eine Vermutung UEBER SQL laesst sich nur
 * an einer Datenbank pruefen. `node --check` sieht eine Zeichenkette, der
 * Muster-Zugang fuehrt nichts aus — beide haetten jede Behauptung durchgelassen,
 * die richtige wie die falsche.
 *
 * Diese Probe laeuft die vollstaendige Abfrage mit erfundenen Filtern: es kommen
 * null oder wenige Zeilen zurueck, aber Postgres PARST und PLANT sie. Jeder
 * Spalten-, Alias- oder Syntaxfehler faellt hier auf.
 *
 * Run: DATABASE_URL=… node --test --test-force-exit test/integration/bestandJeFaehigkeit.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { aggregateBySkill, aggregateByRole } from "../../services/capacityDiscoveryService.js";

/* Bewusst OHNE `./helpers.js` — dessen `createPool` zieht den ganzen
   Express-Aufbau mit. Diese Probe ruft zwei Dienstfunktionen auf. Gleiche
   Gatterbedingung wie dort. */
const hasDb = !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));
const createPool = () => new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.POSTGRES_USER || process.env.DB_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB || process.env.DB_NAME
      }
);

describe("N1.3 — der Bestand je Faehigkeit am realen Schema",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  before(() => { pool = createPool(); });
  after(async () => { await pool?.end(); });

  it("die Abfrage laeuft ueberhaupt", async () => {
    /* Der eigentliche Zweck: Postgres muss sie verstehen. Wie viele Zeilen
       zurueckkommen, ist gleichgueltig — der Bestand schwankt. */
    const zeilen = await aggregateBySkill(pool, {});
    assert.ok(Array.isArray(zeilen), "es kam keine Liste zurueck");
    for (const z of zeilen) {
      assert.equal(typeof z.skill, "string");
      assert.ok(z.skill.length > 0, "eine leere Faehigkeit ist durchgerutscht");
      assert.equal(typeof z.total_headcount, "number");
      assert.ok(z.total_headcount > 0,
        `${z.skill} steht mit ${z.total_headcount} in der Liste — verfuegbar heisst > 0`);
      assert.ok(Array.isArray(z.cities));
    }
  });

  it("jeder Filter laeuft einzeln durch", async () => {
    /* Jeder Zweig baut ein anderes SQL zusammen. Ein Zweig, den niemand
       ausfuehrt, ist ein Zweig, den niemand geprueft hat. */
    await aggregateBySkill(pool, { city: "Muenster" });
    await aggregateBySkill(pool, { worker_category: "hilfskraft" });
    await aggregateBySkill(pool, { org_id: "11111111-1111-4111-a111-111111111111" });
    await aggregateBySkill(pool, { limit: 5 });
    await aggregateBySkill(pool, { skills: ["Stapler", "Kommissionierung"] });
    await aggregateBySkill(pool, {
      city: "Muenster", worker_category: "hilfskraft",
      skills: ["Stapler"], limit: 3
    });
  });

  it("eine unbekannte Faehigkeit gibt eine leere Liste, keinen Fehler", async () => {
    const zeilen = await aggregateBySkill(pool, { skills: ["gibt-es-ganz-sicher-nicht-xyz"] });
    assert.deepEqual(zeilen, []);
  });

  it("die Vorauswahl grenzt wirklich ein", async () => {
    const alle = await aggregateBySkill(pool, {});
    if (!alle.length) return; // leerer Bestand: nichts einzugrenzen
    const eine = alle[0].skill;
    const eng = await aggregateBySkill(pool, { skills: [eine] });
    assert.deepEqual(eng.map((z) => z.skill), [eine],
      "die Vorauswahl wurde ignoriert — die Oberflaeche bekaeme den ganzen Katalog");
  });

  it("die Vorauswahl vergleicht ohne Ruecksicht auf Gross- und Kleinschreibung", async () => {
    /* Der Katalog schreibt "Stapler", die Eintraege womoeglich "stapler". Ein
       Vergleich, der daran scheitert, meldet 0 verfuegbare Kraefte — und das
       ist schlimmer als keine Zahl, weil es wie eine Aussage aussieht. */
    const alle = await aggregateBySkill(pool, {});
    if (!alle.length) return;
    const eine = alle[0].skill;
    const gross = await aggregateBySkill(pool, { skills: [eine.toUpperCase()] });
    assert.deepEqual(gross.map((z) => z.skill), [eine],
      "GROSSSCHREIBUNG fand die Faehigkeit nicht wieder");
  });

  it("der Nachbar `by-role` laeuft unveraendert weiter", async () => {
    /* Gegenprobe: die neue Funktion teilt Konstanten mit ihm. */
    assert.ok(Array.isArray(await aggregateByRole(pool, {})));
  });
});
