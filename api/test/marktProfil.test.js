/**
 * Das Markt-Profil der Kraft (Welle J9) — Merkmal-Katalog, Horizont, Notiz.
 *
 * DIE ZUSAGEN:
 *   1. Der Katalog ist EINE Wahrheit an ZWEI Stellen: das Modul
 *      (workerMerkmalKatalog.js) und der DB-CHECK (Mig 201). Dieser Test
 *      haelt beide gegeneinander — wer ein Merkmal ergaenzt, ergaenzt beide,
 *      sonst rot (DB-gated; ohne DB prueft Teil A wenigstens das Modul).
 *   2. Kein Freitext erreicht den Markt: die Route nimmt nur Katalog-Werte an.
 *   3. Der Schreibweg ist kraft- UND org-gebunden — dieselbe Grenze, die der
 *      Org-Grenzen-Spion am Praesenz-Schalter erzwungen hat.
 *   4. Der Horizont wirkt: einsetzbar_bis spiegelt sich in availability_to
 *      der eigenen Auto-Angebote (sofort und im Sweep).
 *
 * Run: node --test --test-force-exit test/marktProfil.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { MERKMAL_KATALOG, pruefeMerkmale } from "../services/workerMerkmalKatalog.js";
import { setzeMarktProfil, sweepMarktpraesenz } from "../services/marktpraesenzService.js";

const hasDb = !!process.env.DATABASE_URL;

function aufzeichnenderPool(antworten = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      for (const [muster, antwort] of Object.entries(antworten)) {
        if (String(sql).includes(muster)) return antwort;
      }
      return { rows: [{}], rowCount: 0 };
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil A — Katalog und Pruefung, ohne Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Markt-Profil · Teil A — der Katalog", () => {
  it("der Katalog traegt genau die sechs freigegebenen Merkmale", () => {
    assert.deepEqual([...MERKMAL_KATALOG], [
      "zuverlaessig", "sehr_fleissig", "arbeitet_sauber",
      "langfristig_einsetzbar", "kurzfristig_startklar", "schicht_flexibel"
    ], "Owner-Freigabe 2026-08-26 — eine Aenderung hier ist eine Produktentscheidung");
  });

  it("Freitext wird abgewiesen, nicht durchgereicht", () => {
    const r = pruefeMerkmale(["zuverlaessig", "faul und unpuenktlich"]);
    assert.equal(r.error, "MERKMAL_UNBEKANNT");
    assert.deepEqual(r.unbekannt, ["faul und unpuenktlich"],
      "genau DAS ist der Sinn des Katalogs: ein freies Urteil ueber einen Menschen erreicht den Markt nie");
  });

  it("Duplikate verschwinden, die Reihenfolge ist die des Katalogs", () => {
    const r = pruefeMerkmale(["schicht_flexibel", "zuverlaessig", "zuverlaessig"]);
    assert.deepEqual(r.ok, ["zuverlaessig", "schicht_flexibel"],
      "stabile Anzeige, egal in welcher Reihenfolge die Haken gesetzt wurden");
  });

  it("leer ist erlaubt — kein Merkmal ist eine gueltige Auskunft", () => {
    assert.deepEqual(pruefeMerkmale([]).ok, []);
    assert.deepEqual(pruefeMerkmale(undefined).ok, []);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil B — die Form des Schreibwegs
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Markt-Profil · Teil B — der Schreibweg", () => {
  it("fremdes Profil: null, und nach dem Fehlschlag laeuft NICHTS mehr", async () => {
    const pool = aufzeichnenderPool({ "UPDATE worker_profiles": { rows: [], rowCount: 0 } });
    const r = await setzeMarktProfil(pool, "org-a", "wp-fremd", { merkmale: [], einsetzbarBis: null, dispoNotiz: null });
    assert.equal(r, null);
    assert.equal(pool.calls.length, 1, "kein Spiegel-Schreiben nach verfehlter Mandantengrenze");
    assert.match(pool.calls[0].sql, /supplier_org_id = \$2/);
  });

  it("jede Anweisung traegt Profil UND Org — dieselbe Grenze wie der Praesenz-Schalter", async () => {
    const pool = aufzeichnenderPool({
      "UPDATE worker_profiles": { rows: [{ id: "wp-1", markt_merkmale: ["zuverlaessig"], einsetzbar_bis: "2027-01-31", dispo_notiz: null }], rowCount: 1 }
    });
    const r = await setzeMarktProfil(pool, "org-a", "wp-1", { merkmale: ["zuverlaessig"], einsetzbarBis: "2027-01-31", dispoNotiz: "intern" });
    assert.equal(pool.calls.length, 2, "Profil-UPDATE + Horizont-Spiegel, mehr nicht");
    for (const call of pool.calls) {
      assert.ok(call.params.includes("wp-1"), "Kraft-Kennung fehlt: " + call.sql.slice(0, 50));
      assert.ok(call.params.includes("org-a"), "Org-Kennung fehlt: " + call.sql.slice(0, 50));
    }
    assert.match(pool.calls[1].sql, /quelle = 'live_belegschaft'/,
      "der Spiegel fasst NUR eigene Auto-Angebote an — handgepflegte gehoeren der Agentur");
    assert.match(pool.calls[1].sql, /IS DISTINCT FROM/, "leerlauf-frei: geschrieben wird nur bei Abweichung");
    assert.equal(r.markt_merkmale[0], "zuverlaessig");
  });

  it("der Sweep spiegelt den Horizont ebenfalls — als eigener, vierter Schritt", async () => {
    const pool = aufzeichnenderPool();
    await sweepMarktpraesenz(pool);
    assert.equal(pool.calls.length, 5, "Ruecknahme, Wiederkehr, Horizont, Anlage, Lueckenmass");
    assert.match(pool.calls[2].sql, /SET availability_to = wp\.einsetzbar_bis/,
      "eine Wahrheit: das Profil fuehrt, die Angebote folgen");
    assert.match(pool.calls[3].sql, /wp\.einsetzbar_bis/,
      "auch NEUE Angebote entstehen gleich mit dem Horizont");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil C — gegen die echte Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Markt-Profil · Teil C — echte Datenbank", { skip: !hasDb }, () => {
  it("Modul-Katalog und DB-CHECK sind DIESELBE Liste", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'worker_profiles_markt_merkmale_check'`);
      assert.ok(rows[0], "der CHECK aus Migration 201 fehlt in der Datenbank");
      const imCheck = [...rows[0].def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      assert.deepEqual([...imCheck].sort(), [...MERKMAL_KATALOG].sort(),
        "Katalog-Modul und DB-CHECK sind auseinandergelaufen — beide Stellen bewusst pflegen");
    } finally { await pool.end(); }
  });

  it("der Horizont-Zyklus traegt: setzen -> Spiegel in den Angeboten -> zuruecksetzen", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    try {
      const { rows: kandidaten } = await pool.query(
        `SELECT DISTINCT cp.worker_profile_id, wp.supplier_org_id, wp.markt_merkmale, wp.einsetzbar_bis, wp.dispo_notiz
           FROM capacity_posts cp
           JOIN worker_profiles wp ON wp.id = cp.worker_profile_id
          WHERE cp.quelle = 'live_belegschaft' AND cp.status IN ('draft','active','paused')
          LIMIT 1`);
      if (!kandidaten[0]) return; // kein Auto-Bestand — der Formteil oben gilt trotzdem
      const alt = kandidaten[0];
      const wpId = alt.worker_profile_id;
      try {
        const gesetzt = await setzeMarktProfil(pool, alt.supplier_org_id, wpId, {
          merkmale: ["zuverlaessig", "schicht_flexibel"],
          einsetzbarBis: "2027-03-31",
          dispoNotiz: "Testlauf marktProfil"
        });
        assert.ok(gesetzt.horizont_gespiegelt >= 1, "der Horizont muss die eigenen Angebote erreichen");
        const { rows: posten } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM capacity_posts
            WHERE worker_profile_id = $1 AND quelle = 'live_belegschaft'
              AND status IN ('draft','active','paused')
              AND availability_to = '2027-03-31'`, [wpId]);
        assert.ok(posten[0].n >= 1, "availability_to traegt den gesetzten Horizont");
      } finally {
        await setzeMarktProfil(pool, alt.supplier_org_id, wpId, {
          merkmale: alt.markt_merkmale || [],
          einsetzbarBis: alt.einsetzbar_bis || null,
          dispoNotiz: alt.dispo_notiz || null
        });
      }
    } finally { await pool.end(); }
  });
});
