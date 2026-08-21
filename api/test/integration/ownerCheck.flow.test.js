/**
 * canAccessAsOwner am REALEN Schema — Befund E-11.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIESER TEST EXISTIEREN MUSS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die alte Fassung fragte `org_memberships.status`. Diese Spalte gibt es nicht
 * (sie heisst `is_active`), Postgres antwortete mit 42703, ein `catch` machte
 * daraus ein stilles `false` — und die gesamte Suite blieb gruen, weil jeder
 * Mock-Pool jede Abfrage annimmt, egal wie ihre Spalten heissen.
 *
 * Gefunden hatte den Fehler der SQL-Schema-Waechter; er stand dort auf der
 * Liste bekannter Befunde. Die Reparatur hat ihn aber aus dessen Sichtfeld
 * geschoben: `sqlSchemaWaechter` prueft Spalten nur bei EINRELATIONALEN
 * Anweisungen (`relationen.length !== 1 → uebersprungen`), und die neue Fassung
 * verbindet drei Relationen. Ein Tippfehler in einem Spalten- oder Aliasnamen
 * waere dort ab sofort unsichtbar.
 *
 * Deshalb hier die zweite Schicht, die das Projekt fuer genau diesen Fall
 * vorsieht: ein billiger Lauf gegen die echte Datenbank mit erfundenen
 * Kennungen. Es kommen null Treffer zurueck — aber Postgres PARST und PLANT die
 * vollstaendige Abfrage. Jeder Spalten-, Tabellen- oder Aliasfehler faellt hier
 * auf, bevor er einen Kunden erreicht.
 *
 * Der Pool-Mantel unten reicht den Fehler an den Test durch. Ohne ihn wuerde
 * `canAccessAsOwner` ihn selbst verschlucken — genau der Mechanismus, der den
 * Befund sechs Jahre lang verborgen hat.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { canAccessAsOwner } from "../../utils/ownerCheck.js";

/* Bewusst OHNE `./helpers.js`: dessen `createPool` kommt zusammen mit einem
 * Import von `../../app.js` — dem gesamten Express-Aufbau samt allen Routen und
 * Diensten. Diese Probe ruft aber nur zwei Dienstfunktionen auf. Den ganzen
 * Server dafuer hochzufahren macht den Test langsam, an fremden Teilen zerbrechlich
 * und in einem nackten `node`-Aufruf sogar unbenutzbar (er kehrt dort nicht zurueck).
 * Die Gatterbedingung ist dieselbe wie in helpers.js. */
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

const NIRGENDS_A = "11111111-1111-4111-a111-111111111111";
const NIRGENDS_B = "22222222-2222-4222-a222-222222222222";

describe("E-11 — canAccessAsOwner am realen Schema", { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {
  let pool;
  before(() => { pool = createPool(); });
  after(async () => { await pool?.end(); });

  /** Reicht einen Datenbankfehler an den Test durch, statt ihn zu verschlucken. */
  function durchreichenderPool() {
    const gesehen = [];
    return {
      fehler: gesehen,
      query: async (...args) => {
        try {
          return await pool.query(...args);
        } catch (err) {
          gesehen.push(err);
          throw err;
        }
      }
    };
  }

  it("Postgres akzeptiert die Mitgliedschaftsabfrage — kein Spalten- oder Aliasfehler", async () => {
    const mantel = durchreichenderPool();
    const erlaubt = await canAccessAsOwner(mantel, NIRGENDS_A, NIRGENDS_B);

    assert.deepStrictEqual(
      mantel.fehler.map((e) => `${e.code}: ${e.message}`), [],
      "Die Abfrage laeuft nicht gegen das echte Schema. Genau so sah Befund E-11 " +
      "aus: 42703 auf org_memberships.status, verschluckt von einem catch."
    );
    assert.equal(erlaubt, false, "zwei erfundene Kennungen teilen keine Organisation");
  });

  it("die Namensgleichheit bleibt der Kurzschluss — ohne Datenbank", async () => {
    /* Der direkte Vergleich darf die Datenbank gar nicht erst befragen. Das ist
       nicht nur schneller, es haelt den heissen Pfad frei: dieselbe Person auf
       ihre eigene Zeile ist der weitaus haeufigste Fall. */
    let gefragt = 0;
    const zaehler = { query: async (...a) => { gefragt++; return pool.query(...a); } };

    assert.equal(await canAccessAsOwner(zaehler, NIRGENDS_A, NIRGENDS_A), true);
    assert.equal(gefragt, 0, "der Eigentuemer selbst braucht keine Abfrage");
  });

  it("die Weitung endet an der Arbeiterrolle — gegen echte Zeilen geprueft", async () => {
    /* Die eigentliche Gefahr dieser Reparatur. `org_memberships` fuehrt nicht
       nur die Belegschaft einer Organisation, sondern auch ihre ARBEITER
       (`role_key = 'worker'`). Eine Regel "gleiche Organisation genuegt" haette
       einem Zeitarbeiter die Suchauftraege, Angebote und Dealakten seiner
       Agentur geoeffnet — aus einer wirkungslosen Pruefung waere ein echtes
       Leck geworden. Deshalb wird das hier an echten Zeilen belegt, nicht an
       einem Mock, der jede Rolle bestaetigt. */
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const mandant = { query: (...a) => client.query(...a) };
      const marke = `e11-${process.pid}-${process.hrtime.bigint()}`;

      const { rows: [org] } = await client.query(
        "INSERT INTO organizations (name, slug, type) VALUES ($1, $2, 'agency') RETURNING id",
        [`E11 ${marke}`, `e11-${marke}`]);
      const nutzer = async (rolle, kennung) => {
        const { rows: [u] } = await client.query(
          `INSERT INTO users (email, password_hash, role, company_name)
           VALUES ($1, 'x', $2, 'E11') RETURNING id`,
          [`${kennung}-${marke}@example.test`, rolle]);
        return u.id;
      };
      const chefin   = await nutzer("agency", "chefin");
      const kollege  = await nutzer("agency", "kollege");
      const arbeiter = await nutzer("worker", "arbeiter");
      const ruhend   = await nutzer("agency", "ruhend");

      for (const [wer, rolleKey, aktiv] of [
        [chefin, "owner", true], [kollege, "member", true],
        [arbeiter, "worker", true], [ruhend, "member", false]
      ]) {
        await client.query(
          "INSERT INTO org_memberships (org_id, user_id, role_key, is_active) VALUES ($1,$2,$3,$4)",
          [org.id, wer, rolleKey, aktiv]);
      }

      assert.equal(
        await canAccessAsOwner(mandant, chefin, kollege), true,
        "die Kollegin derselben Organisation darf handeln — das ist der Sinn der Reparatur"
      );
      assert.equal(
        await canAccessAsOwner(mandant, chefin, arbeiter), false,
        "der ARBEITER derselben Organisation bleibt draussen"
      );
      assert.equal(
        await canAccessAsOwner(mandant, arbeiter, kollege), false,
        "und auch umgekehrt: die Zeile eines Arbeiters oeffnet sich der Belegschaft nicht"
      );
      assert.equal(
        await canAccessAsOwner(mandant, chefin, ruhend), false,
        "eine ruhende Mitgliedschaft traegt nicht"
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
