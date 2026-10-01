/**
 * ═══════════════════════════════════════════════════════════════════════════
 * U6.2 — DIE POOL-REGEL AN ECHTEN ZEILEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `vendor_pool` hat **0 Zeilen** (gemessen 2026-10-01). Damit ist jede Probe der
 * Form „ein Lieferant, der nicht im Pool steht, wird abgewiesen" **leer grün** —
 * sie prüft, dass eine leere Tabelle leer ist. Genau davor hat die
 * gegenprüfende Sitzung gewarnt.
 *
 * DESHALB LEGT DIESE DATEI IHRE ZEILEN SELBST AN, in einer Transaktion, die
 * danach zurückgerollt wird. Jeder Fall stellt seinen Gegenstand her:
 *
 *   aktiv und ohne Fenster        -> kommt durch
 *   gar nicht im Pool             -> abgewiesen
 *   status = 'suspended'          -> abgewiesen
 *   status = 'removed'            -> abgewiesen
 *   tier = 'BLOCKED'              -> abgewiesen
 *   Fenster abgelaufen            -> abgewiesen
 *   Fenster noch nicht begonnen   -> abgewiesen
 *   Fenster umschliesst heute     -> kommt durch
 *
 * Die ersten und letzten Fälle sind die wichtigeren: eine Prüfung, die alles
 * abweist, besteht jede Abweisungs-Probe und ist trotzdem kaputt.
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/lieferantImPool.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { istLieferantImPool } from "../../services/vendorPoolService.js";

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

/* Eine Zusicherung, die IMMER laeuft - sonst liefert die Datei ohne Datenbank
   `tests 0`, und das sieht im Tor aus wie Erfolg. */
describe("U6.2 — die Datei traegt auch ohne Datenbank eine Zahl", () => {
  it("die Pruefung ist importierbar", () => {
    assert.equal(typeof istLieferantImPool, "function");
  });
});

describe("U6.2 — die Pool-Regel an echten Zeilen", { skip: !hasDb && "keine Datenbank (DATABASE_URL / DB_HOST fehlt) — laeuft im Container und in CI" }, () => {
  let pool;
  let client;
  let kunde;
  let lieferant;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    /* Zwei verschiedene, VORHANDENE Organisationen - damit keine Pflichtfelder
       geraten werden muessen (zwei Anlaeufe in U6.1 sind daran gescheitert). */
    const { rows } = await client.query("SELECT id FROM organizations LIMIT 2");
    if (rows.length === 2) {
      kunde = rows[0].id;
      lieferant = rows[1].id;
    }
  });

  after(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  /** Legt eine Poolzeile an, fuehrt die Pruefung aus, rollt zurueck. */
  async function mitPoolzeile(felder) {
    await client.query("BEGIN");
    try {
      const spalten = ["client_org_id", "supplier_org_id", "status", "tier"];
      const werte = [kunde, lieferant, felder.status || "active", felder.tier || "SECONDARY"];
      if (felder.valid_from !== undefined) { spalten.push("valid_from"); werte.push(felder.valid_from); }
      if (felder.valid_until !== undefined) { spalten.push("valid_until"); werte.push(felder.valid_until); }
      const platz = werte.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(
        `INSERT INTO vendor_pool (${spalten.join(", ")}) VALUES (${platz})`, werte);
      return await istLieferantImPool(client, kunde, lieferant);
    } finally {
      await client.query("ROLLBACK");
    }
  }

  it("die Voraussetzung ist da: zwei verschiedene Organisationen", () => {
    assert.ok(kunde && lieferant && kunde !== lieferant,
      "weniger als zwei Organisationen in den Daten — die Proben unten koennen nichts belegen");
  });

  it("aktiv und ohne Fenster: kommt durch", async () => {
    /* DER WICHTIGSTE FALL. Ohne ihn besteht eine Pruefung, die ALLES abweist,
       jede andere Probe dieser Datei. */
    assert.equal(await mitPoolzeile({}), true,
      "ein aktiver Lieferant ohne Gueltigkeitsfenster wird abgewiesen — die Regel ist zu streng");
  });

  it("gar nicht im Pool: abgewiesen", async () => {
    /* Ohne Zeile - und das ist der Zustand der leeren Tabelle, also der Fall,
       der auch ohne diese Datei schon wahr waere. Er steht hier der
       Vollstaendigkeit wegen, nicht als Nachweis. */
    assert.equal(await istLieferantImPool(client, kunde, lieferant), false);
  });

  it("status 'suspended' und 'removed': abgewiesen", async () => {
    assert.equal(await mitPoolzeile({ status: "suspended" }), false,
      "eine stillgelegte Zugehoerigkeit zaehlt");
    assert.equal(await mitPoolzeile({ status: "removed" }), false,
      "eine entfernte Zugehoerigkeit zaehlt");
  });

  it("tier 'BLOCKED': abgewiesen — sonst waere die Sperre ein Vermerk ohne Wirkung", async () => {
    /*
     * Dieser Fall ist der Zusatz dieser Sitzung zur Festlegung "aktiv und im
     * Gueltigkeitsfenster". Ein gesperrter Lieferant STEHT im Pool, ausdruecklich
     * gesperrt - mit ihm Konditionen zu vereinbaren waere widersinnig.
     */
    assert.equal(await mitPoolzeile({ tier: "BLOCKED" }), false,
      "mit einem GESPERRTEN Lieferanten lassen sich Konditionen vereinbaren");
  });

  it("die uebrigen Stufen gelten — sie sind Abstufungen, keine Sperren", async () => {
    /* Gegenprobe zum BLOCKED-Fall: wer `tier` pauschal pruefte, verboete auch
       RESTRICTED und TRIAL, und das waere zu streng. */
    for (const tier of ["PREFERRED", "SECONDARY", "TRIAL", "RESTRICTED"]) {
      assert.equal(await mitPoolzeile({ tier }), true, `tier ${tier} wird abgewiesen`);
    }
  });

  it("ein abgelaufenes Fenster: abgewiesen", async () => {
    assert.equal(await mitPoolzeile({ valid_from: "2020-01-01", valid_until: "2020-12-31" }), false,
      "eine abgelaufene Zugehoerigkeit zaehlt");
  });

  it("ein Fenster, das noch nicht begonnen hat: abgewiesen", async () => {
    assert.equal(await mitPoolzeile({ valid_from: "2099-01-01" }), false,
      "eine noch nicht gueltige Zugehoerigkeit zaehlt");
  });

  it("ein Fenster, das heute umschliesst: kommt durch", async () => {
    /* Die zweite Gegenprobe: ein Fenster darf nicht grundsaetzlich abweisen. */
    assert.equal(await mitPoolzeile({ valid_from: "2020-01-01", valid_until: "2099-12-31" }), true,
      "ein gueltiges Fenster wird abgewiesen — die Fensterpruefung ist verdreht");
  });

  it("die Pruefung findet die Zeile nur fuer DIESEN Kunden", async () => {
    /*
     * Die Spalte, die luegt: `vendor_pool` traegt beide Seiten. Wer Kunde und
     * Lieferant vertauscht, baut eine Pruefung, die gruen ist und nichts
     * bewacht. Hier wird sie umgekehrt gefragt - und muss NICHTS finden.
     */
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO vendor_pool (client_org_id, supplier_org_id, status, tier)
         VALUES ($1, $2, 'active', 'SECONDARY')`, [kunde, lieferant]);
      assert.equal(await istLieferantImPool(client, lieferant, kunde), false,
        "die Pruefung findet die Zeile auch mit vertauschten Rollen — Kunde und Lieferant sind verwechselt");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
