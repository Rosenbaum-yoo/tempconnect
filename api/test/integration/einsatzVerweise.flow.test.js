/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N2.9 — DIE VERWEIS-PRUEFUNG DER EINSATZ-ANLAGE AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `einsatzAnlageVerweise.test.js` pinnt Antwort, Bindung und SQL-Form im
 * Muster-Pool. Was ein Muster-Pool nie kann: die Abfragen AUSFUEHREN. Ein
 * Tippfehler in einer Spalte (`om.is_active`, `vp.tier`, `c.buyer_org_id`)
 * waere dort gruen und in Betrieb ein 500 — oder, schlimmer, eine Bedingung,
 * die nie greift.
 *
 * Diese Probe fuehrt `pruefeAnlageVerweise` und `pruefeVertragsVerweis` gegen
 * die laufende Datenbank aus. In EINER Transaktion, am Ende zurueckgerollt: sie
 * legt Vendor-Pool-Eintrag und Rahmenvertrag zwischen zwei Organisationen ohne
 * bestehende Beziehung an, dreht Stufe, Status und Ablauf, und hinterlaesst
 * nichts.
 *
 * Datenbankgebunden: ohne DATABASE_URL (bzw. DB_HOST + POSTGRES_PASSWORD)
 * uebersprungen — der Runner nennt das ausdruecklich als Luecke im Nachweis.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pruefeAnlageVerweise, pruefeVertragsVerweis } from "../../services/assignmentService.js";

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

describe("N2.9 — die Verweis-Pruefung am realen Schema",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let kunde = null;     // zwei Organisationen OHNE Vendor-Pool, Vertrag oder Einsatz zwischen sich
  let zaf = null;
  let vendorId = null;
  let vertragId = null;

  const partner = (orgId, supplier) => pruefeAnlageVerweise(client, orgId, { supplier_org_id: supplier });

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT k.id AS kunde, z.id AS zaf
         FROM organizations k
         JOIN organizations z ON z.id <> k.id
        WHERE NOT EXISTS (SELECT 1 FROM vendor_pool vp WHERE vp.client_org_id = k.id AND vp.supplier_org_id = z.id)
          AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.buyer_org_id = k.id AND c.supplier_org_id = z.id)
          AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.org_id = k.id AND a.supplier_org_id = z.id)
        LIMIT 1`);
    kunde = rows[0]?.kunde || null;
    zaf = rows[0]?.zaf || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  it("Postgres fuehrt jede Abfrage aus — unbekannte Kennungen sind fremd, nie ein Fehler", async () => {
    const org = randomUUID();
    assert.deepEqual(await pruefeAnlageVerweise(client, org, { requisition_id: randomUUID() }),
      { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "requisition_id" });
    assert.deepEqual(await pruefeAnlageVerweise(client, org, { demand_request_id: randomUUID() }),
      { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "demand_request_id" });
    assert.deepEqual(await pruefeAnlageVerweise(client, org, { contract_id: randomUUID() }),
      { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" });
    // Dass die Partner-Abfrage auch WAHR liefern kann, beweist der Vendor-Pool-Fall unten.
    assert.deepEqual(await partner(org, randomUUID()),
      { status: 403, error: "SUPPLIER_NOT_PARTNER", field: "supplier_org_id" });
    assert.deepEqual(await pruefeVertragsVerweis(client, { org_id: org, supplier_org_id: null }, randomUUID()),
      { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" });
  });

  it("es gibt zwei Organisationen ohne Beziehung, an denen sich die Partnerschaft zeigen laesst", (t) => {
    if (!kunde || !zaf) t.skip("keine zwei unverbundenen Organisationen im Bestand");
    assert.ok(kunde && zaf);
  });

  it("ohne Beziehung: kein Partner", async (t) => {
    if (!kunde) return t.skip("kein Gegenstand");
    assert.equal((await partner(kunde, zaf))?.error, "SUPPLIER_NOT_PARTNER");
  });

  it("Vendor-Pool aktiv: Partner — gesperrt, ausgesetzt oder abgelaufen: nicht", async (t) => {
    if (!kunde) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      `INSERT INTO vendor_pool (client_org_id, supplier_org_id, tier, status)
       VALUES ($1, $2, 'SECONDARY', 'active') RETURNING id`, [kunde, zaf]);
    vendorId = rows[0].id;
    assert.equal(await partner(kunde, zaf), null, "aktiver Vendor-Pool-Eintrag wird nicht als Partner erkannt");

    await client.query("UPDATE vendor_pool SET tier = 'BLOCKED' WHERE id = $1", [vendorId]);
    assert.equal((await partner(kunde, zaf))?.error, "SUPPLIER_NOT_PARTNER", "gesperrte Stufe zaehlt als Partner");

    await client.query("UPDATE vendor_pool SET tier = 'SECONDARY', valid_until = CURRENT_DATE - 1 WHERE id = $1", [vendorId]);
    assert.equal((await partner(kunde, zaf))?.error, "SUPPLIER_NOT_PARTNER", "abgelaufener Eintrag zaehlt als Partner");

    await client.query("UPDATE vendor_pool SET valid_until = CURRENT_DATE WHERE id = $1", [vendorId]);
    assert.equal(await partner(kunde, zaf), null, "ein heute noch gueltiger Eintrag zaehlt nicht");

    await client.query("UPDATE vendor_pool SET status = 'suspended' WHERE id = $1", [vendorId]);
    assert.equal((await partner(kunde, zaf))?.error, "SUPPLIER_NOT_PARTNER", "ausgesetzter Eintrag zaehlt als Partner");

    // Die Richtung zaehlt: der Kunde steht nicht im Pool der Zeitarbeitsfirma.
    await client.query("UPDATE vendor_pool SET status = 'active' WHERE id = $1", [vendorId]);
    assert.equal((await partner(zaf, kunde))?.error, "SUPPLIER_NOT_PARTNER", "Vendor-Pool gilt in Gegenrichtung");

    await client.query("DELETE FROM vendor_pool WHERE id = $1", [vendorId]);
  });

  it("Rahmenvertrag: nur aktiv macht zum Partner; der Vertrag bindet die Firma", async (t) => {
    if (!kunde) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      `INSERT INTO contracts (buyer_org_id, supplier_org_id, contract_type, title, status)
       VALUES ($1, $2, 'framework', 'N2.9 Probe', 'draft') RETURNING id`, [kunde, zaf]);
    vertragId = rows[0].id;
    assert.equal((await partner(kunde, zaf))?.error, "SUPPLIER_NOT_PARTNER", "ein Vertragsentwurf macht zum Partner");

    await client.query("UPDATE contracts SET status = 'active' WHERE id = $1", [vertragId]);
    assert.equal(await partner(kunde, zaf), null, "aktiver Rahmenvertrag wird nicht erkannt");

    assert.equal(await pruefeAnlageVerweise(client, kunde, { contract_id: vertragId, supplier_org_id: zaf }), null);
    assert.deepEqual(await pruefeAnlageVerweise(client, kunde, { contract_id: vertragId, supplier_org_id: randomUUID() }),
      { status: 400, error: "SUPPLIER_CONTRACT_MISMATCH", field: "supplier_org_id" });
    assert.deepEqual(await pruefeAnlageVerweise(client, zaf, { contract_id: vertragId }),
      { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "contract_id" }, "fremde Org nutzt den Vertrag");

    assert.equal(await pruefeVertragsVerweis(client, { org_id: kunde, supplier_org_id: zaf }, vertragId), null);
    assert.deepEqual(await pruefeVertragsVerweis(client, { org_id: kunde, supplier_org_id: randomUUID() }, vertragId),
      { status: 400, error: "SUPPLIER_CONTRACT_MISMATCH", field: "contract_id" });
  });

  it("ein Einsatz aus einem Deal macht zum Partner", async (t) => {
    const { rows } = await client.query(
      `SELECT org_id, supplier_org_id FROM assignments
        WHERE offer_id IS NOT NULL AND org_id IS NOT NULL AND supplier_org_id IS NOT NULL AND org_id <> supplier_org_id
        LIMIT 1`);
    if (!rows[0]) return t.skip("kein Einsatz aus einem Deal im Bestand");
    assert.equal(await partner(rows[0].org_id, rows[0].supplier_org_id), null);
  });

  it("ein Bedarf gehoert der Org seines Anlegers — keiner anderen", async (t) => {
    const { rows } = await client.query(
      `SELECT d.id, u.org_id FROM demand_requests d JOIN users u ON u.id = d.requester_company_id
        WHERE u.org_id IS NOT NULL LIMIT 1`);
    if (!rows[0]) return t.skip("kein Bedarf mit zugeordneter Org im Bestand");
    assert.equal(await pruefeAnlageVerweise(client, rows[0].org_id, { demand_request_id: rows[0].id }), null);
    assert.deepEqual(await pruefeAnlageVerweise(client, randomUUID(), { demand_request_id: rows[0].id }),
      { status: 403, error: "ORG_BOUNDARY_VIOLATION", field: "demand_request_id" });
  });
});
