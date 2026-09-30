/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.4 — DIE MARKTZAHL ZAEHLT MENSCHEN, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe zu M4c: Volumen entsteht durch DARSTELLUNGEN, nie durch
 * mehrfache Verfuegbarkeit. Das Beispiel im Plan: "128 verfuegbare Kraefte" darf
 * nicht entstehen, weil 32 Menschen je vier Faehigkeiten tragen.
 *
 * `test/koepfeFormel.test.js` nagelt die Form der Formel fest, ohne Datenbank.
 * Was es nicht kann, ist sie AUSFUEHREN — und genau dort entscheidet sich, ob die
 * Zahl stimmt: `COUNT(DISTINCT ...)` ueber eine Gruppe, die das Profil nicht
 * mitfuehrt, ist syntaktisch einwandfrei und zaehlt trotzdem falsch.
 *
 * Diese Probe legt deshalb den Fall her, der vor M4c.4 vierfach gezaehlt haette:
 * EIN Mensch, VIER Darstellungen, und die Marktzahl muss EINS sagen. In einer
 * Transaktion, die zurueckgerollt wird.
 *
 * Datenbankgebunden. Der Uebersprung ist SICHTBAR (Lehre aus M4c.15): jede Probe
 * ueberspringt sich selbst, damit der Lauf die Luecke als `skipped` zaehlt statt
 * `tests 0` zu melden.
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/marktzahlZaehltMenschen.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import {
  aggregateByRole, aggregateBySkill, aggregateByRegion, aggregateByCategory
} from "../../services/capacityDiscoveryService.js";

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

describe("M4c.4 — die Marktzahl zaehlt Menschen, am realen Schema", () => {
  let pool;
  let client;
  let kraft = null;
  /** Eine Rolle, eine Stadt, eine Kategorie, die sonst niemand benutzt. */
  const ROLLE = "ZZ-Probe-Rolle-M4c4";
  const STADT = "ZZ-Probe-Stadt-M4c4";
  const KATEGORIE = "ZZ-Probe-Kategorie";
  const FAEHIGKEIT = "ZZ-Probe-Faehigkeit";

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT wp.id, wp.supplier_org_id,
             (SELECT om.user_id FROM org_memberships om
               WHERE om.org_id = wp.supplier_org_id AND om.is_active AND om.role_key <> 'worker'
               ORDER BY om.created_at LIMIT 1) AS agentur_nutzer
        FROM worker_profiles wp
       WHERE wp.is_active LIMIT 1`);
    if (rows[0]?.agentur_nutzer) kraft = rows[0];
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && kraft) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && kraft) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  /**
   * Legt ein aktives Angebot in der Probe-Rolle an.
   * @param {string|null} profil worker_profiles.id, oder null fuer ein pauschales
   * @param {number} kopfzahl
   */
  async function angebot(profil, kopfzahl = 1) {
    await client.query(`
      INSERT INTO capacity_posts (
        supplier_company_id, title, role, skill_tags, headcount, availability_from,
        location_city, worker_category, status, is_active, org_id, worker_profile_id,
        offer_kind, quelle)
      VALUES ($1, $2, $2, ARRAY[$6]::text[], $3, CURRENT_DATE, $4, $7, 'active', TRUE, $5, $8,
              CASE WHEN $8::uuid IS NULL THEN 'legacy' ELSE 'single_skill' END, 'manuell')`,
      [kraft.agentur_nutzer, ROLLE, kopfzahl, STADT, kraft.supplier_org_id, FAEHIGKEIT, KATEGORIE, profil]);
  }

  const zahlFuer = async (fn, feld, wert) => {
    const zeilen = await fn(client, { limit: 300 });
    const treffer = zeilen.find((z) => z[feld] === wert);
    return treffer ? Number(treffer.total_headcount) : null;
  };

  it("es gibt eine Kraft und einen Agentur-Nutzer, an denen sich das zeigen laesst", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("keine aktive Kraft mit Agentur-Nutzer im Bestand");
    assert.ok(kraft);
  });

  it("VIER Darstellungen EINES Menschen ergeben die Zahl 1 — nicht 4", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    /* Genau der Fall aus dem Plan: seit M4c.1 traegt eine Kraft mit drei
       Faehigkeiten drei Einzelangebote und ein Gesamtangebot. Vor M4c.4 haette
       die Summe der Kopfzahlen daraus vier Kraefte gemacht. */
    for (let i = 0; i < 4; i++) await angebot(kraft.id);

    assert.equal(await zahlFuer(aggregateByRole, "role", ROLLE), 1,
      "die Rollen-Zahl zaehlt Angebote statt Menschen");
    assert.equal(await zahlFuer(aggregateByRegion, "city", STADT), 1,
      "die Stadt-Zahl zaehlt Angebote statt Menschen");
    assert.equal(await zahlFuer(aggregateByCategory, "category", KATEGORIE), 1,
      "die Kategorie-Zahl zaehlt Angebote statt Menschen");
    assert.equal(await zahlFuer(aggregateBySkill, "skill", FAEHIGKEIT), 1,
      "die Faehigkeits-Zahl zaehlt Angebote statt Menschen");
  });

  it("pauschale Angebote zaehlen weiter ihre Kopfzahl — dort nennt niemand einen Menschen", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    /* Die Gegenrichtung. Wuerde die Formel nur Menschen zaehlen, verschwaenden
       die alten `legacy`-Eintraege und die "pauschal N Helfer"-Angebote aus der
       Marktzahl — gemessen am 2026-09-26 waren das 31 von 32 beworbenen Koepfen. */
    await angebot(null, 7);
    assert.equal(await zahlFuer(aggregateByRole, "role", ROLLE), 7,
      "ein pauschales Angebot mit 7 Koepfen zaehlt nicht 7");
  });

  it("beides zusammen wird ADDIERT, und der Mensch zaehlt genau einmal", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    await angebot(kraft.id);
    await angebot(kraft.id);
    await angebot(null, 5);
    assert.equal(await zahlFuer(aggregateByRole, "role", ROLLE), 6,
      "1 Mensch (zwei Darstellungen) + 5 pauschale Koepfe muessen 6 ergeben");
  });

  it("zwei VERSCHIEDENE Menschen zaehlen zwei", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      "SELECT id FROM worker_profiles WHERE id <> $1 AND is_active LIMIT 1", [kraft.id]);
    if (!rows[0]) return t.skip("keine zweite Kraft im Bestand");
    await angebot(kraft.id);
    await angebot(kraft.id);
    await angebot(rows[0].id);
    assert.equal(await zahlFuer(aggregateByRole, "role", ROLLE), 2,
      "zwei verschiedene Menschen ergeben nicht 2 — DISTINCT trifft die falsche Spalte");
  });

  it("eine Gruppe ohne freien Platz erscheint gar nicht", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!kraft) return t.skip("kein Gegenstand");
    /* Filter und Anzeige benutzen denselben Ausdruck (M4c.4). Ein pauschales
       Angebot mit Kopfzahl 0 ist kein Angebot. */
    await angebot(null, 0);
    assert.equal(await zahlFuer(aggregateByRole, "role", ROLLE), null,
      "eine Gruppe ohne freien Platz erscheint in der Marktzahl");
  });
});
