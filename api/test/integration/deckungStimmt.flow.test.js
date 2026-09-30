/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N3.0/M5.1 — DIE DECKUNG EINES BEDARFS AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Muster-Pool-Proben (`mengeUndRiegel.test.js`) pinnen die FORM der
 * Deckungsabfrage. Ausgefuehrt haben sie sie nie — ein Muster-Pool fuehrt kein
 * SQL aus. Diese Probe laesst Postgres rechnen:
 *
 *   ein angenommenes Angebot (2) + eine Notdienst-Zusage ohne Angebot (1)
 *   + ein Einsatz ohne Angebot (1) = 4 von 6, also 2 offen
 *
 * und dann die beiden Wege, auf denen dieselbe Zusage DOPPELT zaehlen wuerde:
 * wird aus der Notdienst-Zusage ein Angebot, oder aus dem Einsatz der Einsatz
 * ZU diesem Angebot, faellt sie aus ihrer eigenen Quelle heraus.
 *
 * Alles in EINER Transaktion mit ROLLBACK.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { createDemandRequest, getDemandCommercialState, syncDemandCommercialState } from "../../services/marketplaceService.js";

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

describe("N3.0 — die Deckung eines Bedarfs (reales Schema)",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let kunde = null;     // Nutzer, der den Bedarf stellt
  let firma = null;     // Nutzer der Zeitarbeitsfirma (Anbieter)
  let bedarf = null;
  let angebotId = null;
  let zusageId = null;
  let einsatzId = null;

  const deckung = async () => getDemandCommercialState(client, bedarf.id);

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT (SELECT id FROM users WHERE role = 'company' LIMIT 1) AS kunde,
              (SELECT id FROM users WHERE role = 'agency' LIMIT 1) AS firma`);
    kunde = rows[0]?.kunde || null;
    firma = rows[0]?.firma || null;
    if (kunde && firma) {
      bedarf = await createDemandRequest(client, kunde, "PRO", {
        title: "N3.0 Deckung", role: "Pflege", headcount: 6,
        start_date: "2027-05-01", location_city: "Münster"
      });
    }
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  it("es gibt beide Seiten und einen Bedarf ueber 6 Plaetze", (t) => {
    if (!bedarf) t.skip("kein Unternehmens- und Agentur-Konto im Bestand");
    assert.equal(Number(bedarf.required_total_count), 6);
    assert.equal(bedarf.partial_fulfillment_allowed, true);
    assert.equal(bedarf.overfill_allowed, false);
  });

  it("frisch angelegt ist nichts gedeckt", async (t) => {
    if (!bedarf) return t.skip("kein Gegenstand");
    const d = await deckung();
    assert.equal(d.committed_headcount, 0);
    assert.equal(d.remaining_open_count, 6);
    assert.equal(d.commercial_status, "open");
  });

  it("ein angenommenes Angebot zaehlt mit seiner MENGE, nicht mit dem ganzen Bedarf", async (t) => {
    if (!bedarf) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      `INSERT INTO offers (demand_request_id, supplier_company_id, status, offered_quantity)
       VALUES ($1, $2, 'accepted', 2) RETURNING id`, [bedarf.id, firma]);
    angebotId = rows[0].id;
    const d = await deckung();
    assert.equal(d.committed_headcount, 2, "die Menge des Angebots wird nicht gelesen");
    assert.equal(d.remaining_open_count, 4);
    assert.equal(d.commercial_status, "partially_covered");
  });

  it("eine Notdienst-Zusage OHNE Angebot zaehlt dazu", async (t) => {
    if (!angebotId) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      `INSERT INTO emergency_provider_commitments (demand_request_id, supplier_company_id, committed_quantity, status)
       VALUES ($1, $2, 1, 'committed') RETURNING id`, [bedarf.id, firma]);
    zusageId = rows[0].id;
    assert.equal((await deckung()).committed_headcount, 3);
  });

  it("ein Einsatz OHNE Angebot zaehlt dazu — der manuelle Weg", async (t) => {
    if (!zusageId) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      `INSERT INTO assignments (demand_request_id, start_date, requested_quantity, worker_count, status)
       VALUES ($1, CURRENT_DATE, 1, 1, 'planned') RETURNING id`, [bedarf.id]);
    einsatzId = rows[0].id;
    const d = await deckung();
    assert.equal(d.committed_headcount, 4, "der manuelle Einsatz fehlt in der Deckung");
    assert.equal(d.remaining_open_count, 2);
  });

  it("wird aus der Zusage ein Angebot, zaehlt sie NICHT mehr doppelt", async (t) => {
    if (!zusageId) return t.skip("kein Gegenstand");
    await client.query("UPDATE emergency_provider_commitments SET agreement_offer_id = $2 WHERE id = $1", [zusageId, angebotId]);
    assert.equal((await deckung()).committed_headcount, 3,
      "die Notdienst-Zusage zaehlt weiter, obwohl sie jetzt als Angebot gezaehlt wird");
    await client.query("UPDATE emergency_provider_commitments SET agreement_offer_id = NULL WHERE id = $1", [zusageId]);
  });

  it("gehoert der Einsatz zum Angebot, zaehlt er NICHT mehr doppelt", async (t) => {
    if (!einsatzId) return t.skip("kein Gegenstand");
    await client.query("UPDATE assignments SET offer_id = $2 WHERE id = $1", [einsatzId, angebotId]);
    assert.equal((await deckung()).committed_headcount, 3,
      "der Einsatz zaehlt neben seinem Angebot ein zweites Mal");
    await client.query("UPDATE assignments SET offer_id = NULL WHERE id = $1", [einsatzId]);
  });

  it("ein storniertes Angebot haelt keinen Platz mehr besetzt", async (t) => {
    if (!angebotId) return t.skip("kein Gegenstand");
    await client.query("UPDATE offers SET agreement_status = 'cancelled' WHERE id = $1", [angebotId]);
    assert.equal((await deckung()).committed_headcount, 2, "das stornierte Angebot zaehlt weiter");
    await client.query("UPDATE offers SET agreement_status = NULL WHERE id = $1", [angebotId]);
  });

  it("und die Zahlen landen am Bedarf, sobald sie fortgeschrieben werden", async (t) => {
    if (!bedarf) return t.skip("kein Gegenstand");
    const fortgeschrieben = await syncDemandCommercialState(client, bedarf.id);
    assert.equal(Number(fortgeschrieben.currently_committed_count), 4);
    assert.equal(Number(fortgeschrieben.remaining_open_count), 2);
    assert.equal(fortgeschrieben.status, "partially_covered");
    const { rows } = await client.query(
      "SELECT currently_committed_count, remaining_open_count, status FROM demand_requests WHERE id = $1", [bedarf.id]);
    assert.equal(Number(rows[0].currently_committed_count), 4, "die Spalte am Bedarf blieb unveraendert");
    assert.equal(Number(rows[0].remaining_open_count), 2);
  });
});
