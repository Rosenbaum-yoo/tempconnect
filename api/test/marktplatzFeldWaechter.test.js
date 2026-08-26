/**
 * Marktplatz-Feld-Waechter (Welle J2, Befund 2.2e)
 *
 * DIE ZUSAGE: Was ein Marktplatz-Betrachter von einem Kapazitaetsposten sieht,
 * steht AUSSCHLIESSLICH in der Positivliste OEFFENTLICH. Personenkennungen
 * (`worker_profile_id`, `created_by`) und die Anbieter-E-Mail verlassen den
 * Marktplatz nie.
 *
 * WARUM ALS WAECHTER: `is_anonymous` stand jahrelang bei jeder Zeile auf TRUE
 * und wurde von keiner Abfrage gelesen — die Anonymitaet existierte als
 * Absicht, nicht als Vollzug (gemessen 2026-08-26). Ein `cp.*` an der
 * richtigen Stelle genuegt, um das unbemerkt wieder einzufuehren. Deshalb:
 *
 *   1. Die Listen selbst: NUR_INTERN enthaelt die Personenkennungen,
 *      OEFFENTLICH enthaelt sie nicht, beide sind disjunkt.
 *   2. Gegen die DATENBANK (skip ohne DB): jede reale Spalte von
 *      capacity_posts ist entweder OEFFENTLICH oder NUR_INTERN klassifiziert.
 *      Eine neue Migration, die eine Spalte ergaenzt, macht diesen Test rot,
 *      bis jemand die Spalte bewusst einordnet.
 *   3. Gegen den QUELLTEXT: die beiden Marktplatz-Services enthalten kein
 *      `cp.*` mehr und kein `supplier_email` (kein Frontend hat es je
 *      benutzt; eine Kontaktadresse vor dem Deal unterlaeuft P8 §3.5).
 *
 * Run: node --test --test-force-exit test/marktplatzFeldWaechter.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { OEFFENTLICH, NUR_INTERN, cpSpaltenSql } from "../services/capacityPostOeffentlicheSpalten.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const hasDb = !!process.env.DATABASE_URL;

/* ── 1. Die Listen selbst ──────────────────────────────────────────────── */

describe("Marktplatz-Felder · die Listen", () => {
  it("die Personenkennungen stehen in NUR_INTERN", () => {
    for (const spalte of ["worker_profile_id", "created_by"]) {
      assert.ok(NUR_INTERN.includes(spalte),
        `"${spalte}" fehlt in NUR_INTERN — die Kennung wuerde beim naechsten cp.* wieder auslaufen`);
      assert.ok(!OEFFENTLICH.includes(spalte),
        `"${spalte}" steht in OEFFENTLICH — genau das soll dieser Waechter verhindern`);
    }
  });

  it("beide Listen sind disjunkt und doppelfrei", () => {
    const alle = [...OEFFENTLICH, ...NUR_INTERN];
    assert.equal(new Set(alle).size, alle.length,
      "eine Spalte steht doppelt oder in beiden Listen — dann ist unklar, was gilt");
  });

  it("das SELECT-Fragment traegt genau die oeffentlichen Spalten", () => {
    const sql = cpSpaltenSql("cp");
    for (const spalte of OEFFENTLICH) assert.ok(sql.includes(`cp.${spalte}`));
    for (const spalte of NUR_INTERN) assert.ok(!sql.includes(`cp.${spalte}`));
    assert.ok(!sql.includes("*"), "kein Stern — der Stern war der Fehler");
  });
});

/* ── 2. Gegen die Datenbank: jede reale Spalte ist klassifiziert ───────── */

describe("Marktplatz-Felder · gegen die laufende Datenbank", { skip: !hasDb }, () => {
  it("jede Spalte von capacity_posts ist bewusst eingeordnet", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'capacity_posts'`
      );
      assert.ok(rows.length >= 40, "Gegenprobe: die Tabelle wurde ueberhaupt gelesen");
      const real = rows.map((r) => r.column_name);
      const klassifiziert = new Set([...OEFFENTLICH, ...NUR_INTERN]);
      const unklassifiziert = real.filter((s) => !klassifiziert.has(s));
      assert.deepEqual(unklassifiziert, [],
        "diese Spalten kennt die Positivliste nicht — bewusst in OEFFENTLICH oder NUR_INTERN " +
        "eintragen (api/services/capacityPostOeffentlicheSpalten.js), sonst ist unklar, ob sie " +
        "einen Betrachter erreichen duerfen");
      const geister = [...klassifiziert].filter((s) => !real.includes(s));
      assert.deepEqual(geister, [],
        "diese Spalten stehen in den Listen, aber nicht in der Datenbank — die Liste luegt");
    } finally {
      await pool.end();
    }
  });
});

/* ── 3. Gegen den Quelltext: der Stern kommt nicht zurueck ─────────────── */

describe("Marktplatz-Felder · gegen den Quelltext", () => {
  const dienste = [
    "../services/capacityExchangeService.js",
    "../services/marketplaceService.js"
  ];

  for (const rel of dienste) {
    const name = path.basename(rel);
    const quelle = fs.readFileSync(path.join(HIER, rel), "utf8");

    it(`${name}: kein cp.* in einem SELECT`, () => {
      /* \.\*: der Stern hinter dem Alias. Erlaubt bleibt `SELECT *` auf
       * interne Zeilen (FOR UPDATE-Sperren), die keinen Client erreichen —
       * verboten ist der Alias-Stern, ueber den die Betrachter-Antworten
       * gebaut wurden. */
      assert.ok(!/\bcp\.\*/.test(quelle),
        "cp.* gefunden — jede Betrachter-Antwort baut auf der Positivliste auf " +
        "(cpSpaltenSql aus capacityPostOeffentlicheSpalten.js)");
    });

    it(`${name}: keine supplier_email mehr`, () => {
      assert.ok(!quelle.includes("supplier_email"),
        "supplier_email gefunden — kein Frontend hat sie je gelesen, und eine " +
        "Kontaktadresse vor dem Deal unterlaeuft die Anonymitaet (P8 §3.5)");
    });
  }
});
