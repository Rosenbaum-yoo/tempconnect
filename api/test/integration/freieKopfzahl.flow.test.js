/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N2.8 — DIE FREIE KOPFZAHL AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Muster-Pool-Proben in `trefferzahlStimmt.test.js` pinnen den SQL-TEXT.
 * Was sie nicht koennen, ist ihn AUSFUEHREN — und die kleine Gegenpruefung vom
 * 13.09. hat gezeigt, wie viel dazwischen passt: die Zusage an die ganze
 * Plattform statt an das Angebot gebunden, `SUM` durch `MAX` ersetzt, der
 * Bedarf `ON TRUE` verbunden — alles gruen im Muster-Pool.
 *
 * Diese Probe fuehrt die Rechnung gegen die echte Datenbank aus. In EINER
 * Transaktion, die am Ende zurueckgerollt wird: sie legt ein angenommenes
 * Angebot und zwei Zuweisungen an ein bestehendes Kapazitaetsangebot, fragt den
 * Feed und den Handelsstand ueber GENAU diese Verbindung ab und hinterlaesst
 * nichts.
 *
 * Datenbankgebunden: ohne DATABASE_URL (bzw. DB_HOST + POSTGRES_PASSWORD)
 * uebersprungen — der Runner nennt das ausdruecklich als Luecke im Nachweis.
 *
 * Lauf: DATABASE_URL=postgres://… node --test --test-force-exit test/integration/freieKopfzahl.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { browseFeed, getCapacityCommercialStates } from "../../services/capacityExchangeService.js";

/* Gleiche Gatterbedingung wie die anderen Integrationsproben. */
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

describe("N2.8 — die freie Kopfzahl am realen Schema",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let angebot;      // ein bestehendes, im Feed sichtbares Kapazitaetsangebot mit Kopfzahl >= 3
  let bedarfId;
  let angebotsZusage;

  const drin = (e, id) => e.items.some((i) => i.id === id);
  const stimmig = (e) => e.total === e.items.length;

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const start = await browseFeed(client, { viewer_role: "company", limit: 100 });
    angebot = start.items.find((i) => Number(i.headcount) >= 3) || null;
    const { rows } = await client.query("SELECT id FROM demand_requests LIMIT 1");
    bedarfId = rows[0]?.id || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  it("es gibt ein Angebot, an dem sich die Rechnung zeigen laesst", (t) => {
    /* Ohne passenden Bestand wird NICHT gruen gemeldet, sondern sichtbar
       uebersprungen — eine Probe ohne Gegenstand beweist nichts. */
    if (!angebot || !bedarfId) t.skip("kein Angebot mit Kopfzahl >= 3 oder kein Bedarf im Bestand");
    assert.ok(angebot && bedarfId);
  });

  it("teilweise gebucht: `mindestens N` richtet sich nach den FREIEN Plaetzen, und die Zahl stimmt", async (t) => {
    if (!angebot || !bedarfId) return t.skip("kein Gegenstand");
    const H = Number(angebot.headcount);
    const { rows } = await client.query(
      `INSERT INTO offers (demand_request_id, supplier_company_id, capacity_post_id, status, offered_quantity)
       VALUES ($1, $2, $3, 'accepted', $4) RETURNING id`,
      [bedarfId, angebot.supplier_company_id, angebot.id, H - 1]);
    angebotsZusage = rows[0].id;

    const zuViel = await browseFeed(client, { viewer_role: "company", min_headcount: 2, limit: 100 });
    assert.strictEqual(drin(zuViel, angebot.id), false,
      "ein Angebot mit 1 freien Platz erscheint bei 'mindestens 2' — gefiltert wird die Gesamt-Kopfzahl");
    assert.ok(stimmig(zuViel), `Zahl und Seite laufen auseinander: total=${zuViel.total}, items=${zuViel.items.length}`);

    const passt = await browseFeed(client, { viewer_role: "company", min_headcount: 1, limit: 100 });
    assert.strictEqual(drin(passt, angebot.id), true,
      "ein Angebot mit 1 freien Platz fehlt bei 'mindestens 1' — die Zusage ist nicht an DIESES Angebot gebunden");
    assert.ok(stimmig(passt));
  });

  it("zwei Zuweisungen am selben Angebot verdoppeln die Zusage NICHT", async (t) => {
    if (!angebotsZusage) return t.skip("kein Gegenstand");
    const H = Number(angebot.headcount);
    await client.query(
      "INSERT INTO assignments (offer_id, start_date) VALUES ($1, CURRENT_DATE), ($1, CURRENT_DATE)",
      [angebotsZusage]);
    const zustand = (await getCapacityCommercialStates(client, [angebot.id])).get(angebot.id);
    assert.strictEqual(zustand.committed_headcount, H - 1,
      `zugesagt ${zustand.committed_headcount} statt ${H - 1} — der Zuweisungs-Verbund verdoppelt die Zusage`);
    const feed = await browseFeed(client, { viewer_role: "company", min_headcount: 1, limit: 100 });
    assert.strictEqual(drin(feed, angebot.id), true, "das Angebot ist trotz freiem Platz aus dem Feed verschwunden");
  });

  it("voll gebucht bei Status `active`: nicht im Feed, nicht in der Zahl", async (t) => {
    if (!angebotsZusage) return t.skip("kein Gegenstand");
    await client.query("UPDATE offers SET offered_quantity = $1 WHERE id = $2", [Number(angebot.headcount), angebotsZusage]);
    const voll = await browseFeed(client, { viewer_role: "company", limit: 100 });
    assert.strictEqual(drin(voll, angebot.id), false, "ein voll gebuchtes aktives Angebot steht im Feed");
    assert.ok(stimmig(voll), `Zahl und Seite laufen auseinander: total=${voll.total}, items=${voll.items.length}`);
  });

  it("die Zusage anderer Angebote zaehlt NICHT mit", async (t) => {
    /* Gegen die Mutation `capacity_post_id = cp.id` -> `IS NOT NULL`: dann
       summierte jedes Angebot die Zusagen der ganzen Plattform. */
    if (!angebotsZusage) return t.skip("kein Gegenstand");
    const andere = await browseFeed(client, { viewer_role: "company", limit: 100 });
    const nachbar = andere.items.find((i) => i.id !== angebot.id);
    if (!nachbar) return t.skip("kein zweites Angebot im Feed");
    const zustand = (await getCapacityCommercialStates(client, [nachbar.id])).get(nachbar.id);
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END), 0)::int AS n
         FROM offers WHERE capacity_post_id = $1`, [nachbar.id]);
    if (rows[0].n === 0) {
      assert.strictEqual(zustand?.committed_headcount ?? 0, 0,
        "ein Angebot ohne eigene Zusage zeigt eine Zusage — gebunden an fremde Angebote");
    }
    assert.ok(drin(andere, nachbar.id));
  });
});
