/**
 * ═══════════════════════════════════════════════════════════════════════════
 * U6.1 — DIE DATENBANK WEIST EINEN ORG-FREMDEN STANDORT AB
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migration 226 stellt dreizehn Fremdschluessel von `(id)` auf `(id, org_id)` um.
 * DAS KANN NUR DIE DATENBANK BEWEISEN. Eine Probe gegen den Dienst zeigt, dass
 * der Dienst prueft — nicht, dass die zweite Verteidigungslinie dahinter steht.
 * Genau deshalb gibt es diese Datei zusaetzlich zur datenbankfreien Form-Probe
 * in `test/grenzeInDerDatenbank.test.js`.
 *
 * Sie uebersprint ohne Datenbank, SICHTBAR und mit Grund — nicht als `tests 0`.
 * Eine Probendatei, die keine Zahl liefert, sieht im Tor aus wie Erfolg.
 *
 * ALLES IN EINER TRANSAKTION, die zurueckgerollt wird: die Probe hinterlaesst
 * nichts, auch nicht bei einem Abbruch mitten drin.
 *
 * WARUM UPDATE UND NICHT INSERT: zwei erste Anlaeufe am 2026-10-01 scheiterten an
 * Pflichtfeldern (`organizations.slug`, `requisitions.created_by`) — also VOR dem
 * Riegel, und das beweist nichts. Ein UPDATE auf eine bestehende Zeile braucht
 * keine Pflichtfelder und ist ausserdem genau der Angriff, um den es geht: den
 * Standort nachtraeglich umhaengen.
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/standortGrenzeDatenbank.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";

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

/*
 * EINE ZUSICHERUNG, DIE IMMER LAEUFT - und sie ist kein Formalismus.
 *
 * Ohne sie liefert diese Datei ohne Datenbank `tests 0`. Das erscheint im Tor
 * weder als Luecke noch als Zahl: eine Probendatei ohne Testzahl sieht aus wie
 * Erfolg. Gemessen wurde dieselbe Falle am 2026-09-26 an
 * `gesamtangebotEntstehtMit.flow.test.js`, wo zwei Rueckmutationen allein deshalb
 * ueberlebten.
 *
 * Diese eine Zusicherung prueft, was auch ohne Datenbank pruefbar ist: dass die
 * Migration ueberhaupt im Baum liegt. Damit traegt die Datei immer eine Zahl, und
 * der uebersprungene Teil wird als Luecke sichtbar statt als Nichts.
 */
describe("U6.1 — die Datei traegt auch ohne Datenbank eine Zahl", () => {
  it("Migration 226 liegt im Baum", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const hier = path.dirname(fileURLToPath(import.meta.url));
    const mig = path.resolve(hier, "..", "..", "..", "sql", "migrations",
      "226_die_grenze_steht_in_der_datenbank.sql");
    assert.ok(fs.existsSync(mig),
      `Migration 226 fehlt (${mig}) — die Proben unten pruefen dann eine Grenze, die es nicht gibt`);
  });
});

describe("U6.1 — die Standortgrenze in der Datenbank", { skip: !hasDb && "keine Datenbank (DATABASE_URL / DB_HOST fehlt) — laeuft im Container und in CI" }, () => {
  let pool;
  let client;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
  });

  after(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  it("die dreizehn Schluessel sind zusammengesetzt, keiner mehr einspaltig", async () => {
    const { rows } = await client.query(
      `SELECT array_length(conkey, 1) AS spalten, COUNT(*)::int AS anzahl
         FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid IN ('org_locations'::regclass, 'org_departments'::regclass)
        GROUP BY 1 ORDER BY 1`);
    const je = Object.fromEntries(rows.map((r) => [r.spalten, r.anzahl]));
    assert.equal(je[1] || 0, 0,
      `${je[1]} Beziehungen sind noch einspaltig — sie pruefen nur, dass die Zeile IRGENDWO existiert`);
    assert.equal(je[2] || 0, 13,
      `${je[2] || 0} zusammengesetzte Schluessel, erwartet 13`);
  });

  it("jeder traegt die Spaltenauswahl bei ON DELETE SET NULL", async () => {
    /* Ohne sie nullt ein Standort-Loeschen auch die Org-Spalte: in vier Tabellen
       bricht es ab, in drei verliert die Zeile STILL ihre Organisation. */
    const { rows } = await client.query(
      `SELECT conrelid::regclass::text AS tabelle, conname AS name
         FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid IN ('org_locations'::regclass, 'org_departments'::regclass)
          AND pg_get_constraintdef(oid) NOT LIKE '%ON DELETE SET NULL (%'`);
    assert.deepEqual(rows.map((r) => `${r.tabelle}.${r.name}`), [],
      "diese Schluessel nullen beim Loeschen auch die Org-Spalte");
  });

  it("ein org-fremder Standort wird von PostgreSQL abgewiesen", async () => {
    /* DER EIGENTLICHE NACHWEIS. Ohne Datenbank nicht moeglich, und ohne ihn ist
       Migration 226 eine Behauptung. */
    const { rows: paar } = await client.query(
      `SELECT r.id AS anforderung, l.id AS fremder_standort
         FROM requisitions r
         JOIN org_locations l ON l.org_id <> r.org_id AND l.is_active = TRUE
        LIMIT 1`);
    if (!paar.length) {
      /* Kein Paar in den Daten: dann kann diese Probe nichts belegen, und sie
         sagt das, statt gruen zu melden. */
      assert.fail("keine Anforderung mit einem org-fremden Standort in den Daten — "
        + "die Probe kann die Grenze nicht ausloesen und beweist nichts");
    }
    const { anforderung, fremder_standort } = paar[0];

    await client.query("BEGIN");
    try {
      await assert.rejects(
        () => client.query("UPDATE requisitions SET location_id = $1 WHERE id = $2",
          [fremder_standort, anforderung]),
        (err) => /foreign key constraint/i.test(String(err.message))
          && /location_org_fkey/.test(String(err.message)),
        "die Datenbank nimmt einen org-fremden Standort an — Migration 226 wirkt nicht");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("GEGENPROBE: der eigene Standort kommt durch", async () => {
    /*
     * Ohne sie wuesste man nicht, ob die Grenze greift oder die Spalte nur
     * gesperrt ist. Eine Grenze, die alles abweist, ist kaputt, nicht sicher.
     *
     * DIE PROBE STELLT IHREN GEGENSTAND SELBST HER. Eine erste Fassung suchte in
     * den Daten nach einer Anforderung, deren Organisation einen aktiven Standort
     * hat - und fand keine. Sie war damit dauerhaft rot, und eine dauerhaft rote
     * Probe wird abgeschaltet. Angelegt wird in der Transaktion, die danach
     * zurueckgerollt wird; die Datenbank behaelt nichts.
     */
    const { rows: anf } = await client.query("SELECT id, org_id FROM requisitions LIMIT 1");
    if (!anf.length) assert.fail("keine Anforderung in den Daten - nichts zu messen");

    await client.query("BEGIN");
    try {
      const { rows: ort } = await client.query(
        `INSERT INTO org_locations (org_id, name, city, country, is_active, is_hq)
         VALUES ($1, 'U6.1-Probe', 'Probestadt', 'DE', TRUE, FALSE) RETURNING id`,
        [anf[0].org_id]);
      const r = await client.query("UPDATE requisitions SET location_id = $1 WHERE id = $2",
        [ort[0].id, anf[0].id]);
      assert.equal(r.rowCount, 1, "der EIGENE Standort wurde abgewiesen - die Grenze ist zu eng");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  it("ein Standort-Loeschen nullt NUR location_id, nicht die Organisation", async () => {
    /*
     * Die Wirkung der Spaltenauswahl, am VERHALTEN geprueft statt am Text.
     *
     * Gemessen gibt es drei Tabellen, in denen die Org-Spalte nullbar ist
     * (assignments, capacity_posts, requisitions). Genau dort waere ein Verlust
     * STILL - in den vier anderen bricht das Loeschen mit einem Fehler ab, und
     * das faellt auf. Deshalb wird hier an `requisitions` gemessen.
     */
    const { rows: anf } = await client.query("SELECT id, org_id FROM requisitions LIMIT 1");
    if (!anf.length) assert.fail("keine Anforderung in den Daten - nichts zu messen");

    await client.query("BEGIN");
    try {
      const { rows: ort } = await client.query(
        `INSERT INTO org_locations (org_id, name, city, country, is_active, is_hq)
         VALUES ($1, 'U6.1-Loeschprobe', 'Probestadt', 'DE', TRUE, FALSE) RETURNING id`,
        [anf[0].org_id]);
      await client.query("UPDATE requisitions SET location_id = $1 WHERE id = $2",
        [ort[0].id, anf[0].id]);

      /* Den Standort loeschen - die Anforderung muss ihre Organisation BEHALTEN. */
      await client.query("DELETE FROM org_locations WHERE id = $1", [ort[0].id]);
      const { rows } = await client.query(
        "SELECT org_id, location_id FROM requisitions WHERE id = $1", [anf[0].id]);
      assert.equal(rows[0].location_id, null, "location_id wurde nicht genullt");
      assert.equal(String(rows[0].org_id), String(anf[0].org_id),
        "die ORGANISATION wurde mitgenullt - die Spaltenauswahl fehlt oder greift nicht. "
        + "Das ist stiller Datenverlust, kein Schoenheitsfehler.");
    } finally {
      await client.query("ROLLBACK");
    }
  });
});
