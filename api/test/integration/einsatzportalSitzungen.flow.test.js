/**
 * Einsatzportal-Sitzungen am ECHTEN Schema (Migration 229, Owner 2026-10-01).
 *
 * Jede Abfrage des Dienstes einmal wirklich ausfuehren — ein Muster-Pool nimmt
 * jede an (beim Paketversand am selben Tag gemessen: ein Typfehler, den nur
 * PostgreSQL sah). Dazu die Protokoll-Abfrage mit dem Namen der Einsatzkraft.
 * Alles in einer Transaktion, die zurueckgerollt wird.
 *
 * Run: DATABASE_URL=… node --test test/integration/einsatzportalSitzungen.flow.test.js
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as ep from "../../services/einsatzportalSitzungService.js";
import { queryOrgAuditLog } from "../../services/auditLog.js";

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

describe("Einsatzportal-Sitzungen am echten Schema", { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {
  let pool;
  let client;
  let org;
  let fremd;
  let kraft;
  const SID1 = "probe-sitzung-1", SID2 = "probe-sitzung-2", SID3 = "probe-sitzung-3";

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const nr = Date.now().toString(36);
    org = (await client.query(
      `INSERT INTO organizations (name, slug, type, plan) VALUES ('Probe Agentur', $1, 'agency', 'PLUS') RETURNING id`,
      [`probe-ep-${nr}`])).rows[0].id;
    fremd = (await client.query(
      `INSERT INTO organizations (name, slug, type, plan) VALUES ('Probe Fremd', $1, 'company', 'PLUS') RETURNING id`,
      [`probe-ep-fremd-${nr}`])).rows[0].id;
    kraft = (await client.query(
      `INSERT INTO users (role, email, password_hash, org_id) VALUES ('worker', $1, 'x', $2) RETURNING id`,
      [`ep-${nr}@probe.tempconnect.test`, org])).rows[0].id;
    await client.query(`INSERT INTO org_memberships (user_id, org_id, role_key) VALUES ($1, $2, 'worker')`, [kraft, org]);
    await client.query(
      `INSERT INTO worker_profiles (user_id, supplier_org_id, first_name, last_name) VALUES ($1, $2, 'Erika', 'Einsatz')`,
      [kraft, org]);
  });

  after(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
    if (pool) await pool.end();
  });

  it("beginnen, aktiv melden, beenden, ueberall abmelden — jede Abfrage laeuft", async () => {
    const vorEinerStunde = Date.now() - 3600 * 1000;
    assert.equal(await ep.beginnen(client, { sessionId: SID1, userId: kraft, orgId: org, begonnenAm: vorEinerStunde }), true);
    assert.equal(await ep.beginnen(client, { sessionId: SID1, userId: kraft, orgId: org }), true, "zweimal ist kein Fehler");
    assert.equal(await ep.aktivMelden(client, SID1), true);
    assert.equal(await ep.beenden(client, SID1), true);
    await ep.beginnen(client, { sessionId: SID2, userId: kraft, orgId: org });
    await ep.beginnen(client, { sessionId: SID3, userId: kraft, orgId: org });
    assert.equal(await ep.alleBeenden(client, kraft, { ausserSessionId: SID3 }), 1, "nur SID2 — SID1 ist schon beendet, SID3 ausgenommen");
    const z = (await client.query(
      `SELECT sitzung_hash, ende, begonnen_am FROM einsatzportal_sitzungen WHERE user_id = $1 ORDER BY begonnen_am`, [kraft])).rows;
    assert.equal(z.length, 3);
    const nachHash = Object.fromEntries(z.map((r) => [r.sitzung_hash, r]));
    assert.equal(nachHash[ep.sitzungHash(SID1)].ende, "abgemeldet");
    assert.equal(nachHash[ep.sitzungHash(SID2)].ende, "alle_abgemeldet");
    assert.equal(nachHash[ep.sitzungHash(SID3)].ende, null);
    const beginn = new Date(nachHash[ep.sitzungHash(SID1)].begonnen_am).getTime();
    assert.ok(Math.abs(beginn - vorEinerStunde) < 2000, "der Anmeldezeitpunkt kommt aus der Sitzung, nicht aus der ersten Anfrage");
  });

  it("die Liste: eigene Firma, mit Aktionen; die fremde Firma sieht nichts", async () => {
    await client.query(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, org_id, status, action_type)
       VALUES ($1, 'worker.update_availability', 'worker_profile', 'p1', $2, 'SUCCESS', 'UPDATE')`, [kraft, org]);
    const r = await ep.liste(client, org, { userId: kraft });
    assert.equal(r.total, 3);
    assert.equal(r.items[0].name, "Erika Einsatz");
    assert.ok(r.items.some((s) => s.aktionen.some((a) => a.label === "Einsatzportal: Verfügbarkeit geändert")));
    assert.deepEqual(await ep.personen(client, org), [{ user_id: kraft, name: "Erika Einsatz" }]);
    assert.deepEqual(await ep.liste(client, fremd, { userId: kraft }), { items: [], total: 0 });
    // Zeitraum: von/bis als Kalendertage
    const heute = new Date().toISOString().slice(0, 10);
    const mitZeit = await ep.liste(client, org, { von: heute, bis: ep.tagPlus(heute, 1) });
    assert.ok(mitZeit.total >= 1);
  });

  it("das Protokoll nennt die Einsatzkraft beim Namen und kennzeichnet sie", async () => {
    const r = await queryOrgAuditLog(client, org, { actor_id: kraft, limit: 5 });
    assert.ok(r.items.length >= 1);
    assert.equal(r.items[0].actor_name, "Erika Einsatz");
    assert.equal(r.items[0].actor_einsatzkraft, true);
  });

  it("Aufbewahrung: eine 12 Monate alte Sitzung verschwindet, eine frische bleibt", async () => {
    await client.query(
      `INSERT INTO einsatzportal_sitzungen (sitzung_hash, user_id, org_id, begonnen_am, zuletzt_aktiv_am)
       VALUES ($1, $2, $3, NOW() - INTERVAL '12 months 1 day', NOW() - INTERVAL '12 months 1 day')`,
      [ep.sitzungHash("probe-alt"), kraft, org]);
    const r = await ep.aufbewahrungDurchsetzen(client);
    assert.ok(r.geloescht >= 1);
    const rest = (await client.query(`SELECT COUNT(*)::int AS n FROM einsatzportal_sitzungen WHERE user_id = $1`, [kraft])).rows[0].n;
    assert.equal(rest, 3);
  });
});
