/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N2.11 — FIRMA AM BEDARF, BLAETTERN UND UMKREIS AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Was die Muster-Pool-Proben (`firmaAmBedarf.test.js`, `trefferzahlStimmt.test.js`)
 * nicht koennen: SQL AUSFUEHREN. Genau dort lagen zwei der Befunde vom 2026-09-15:
 *
 *   * Blaettern: bei gleichem Zeitstempel ist die Reihenfolge fuer Postgres
 *     unbestimmt — gemessen fehlten zwei Angebote auf allen Seiten. Das zeigt
 *     sich nur an einer echten Datenbank mit echten Gleichstaenden.
 *   * Umkreis: ein umgedrehter Vergleich blieb in allen Form-Proben gruen.
 *
 * Dazu Migration 218 selbst: die Spalte, der Rueckfall in getDemandById, und der
 * Nachtrag des Altbestands (einzige Unternehmens-Mitgliedschaft, sonst Start-Firma)
 * — ausgefuehrt aus der Migrationsdatei, ohne ihr BEGIN/COMMIT.
 *
 * Alles in EINER Transaktion mit ROLLBACK.
 * Datenbankgebunden: ohne DATABASE_URL (bzw. DB_HOST + POSTGRES_PASSWORD)
 * uebersprungen — der Runner nennt das ausdruecklich als Luecke im Nachweis.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createDemandRequest, getDemandById } from "../../services/marketplaceService.js";
import { kundenOrgEinesBedarfs } from "../../services/companyBlocklistService.js";
import { browseFeed } from "../../services/capacityExchangeService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(HIER, "..", "..", "..", "sql", "migrations", "218_bedarf_kennt_seine_firma.sql");

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

describe("N2.11 — Firma am Bedarf, Blaettern und Umkreis (reales Schema)",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let nutzer = null;   // ein Unternehmens-Nutzer mit Start-Firma
  const eins = async (sql, params) => (await client.query(sql, params)).rows[0];

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    nutzer = await eins(
      `SELECT u.id, u.org_id FROM users u JOIN organizations o ON o.id = u.org_id
        WHERE u.role = 'company' LIMIT 1`);
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  const neueFirma = async (name) => (await eins(
    `INSERT INTO organizations (id, name, type, slug) VALUES ($1, $2, 'company', $3) RETURNING id`,
    [randomUUID(), name, `n211-${randomUUID()}`])).id;

  it("es gibt einen Unternehmens-Nutzer mit Start-Firma", (t) => {
    if (!nutzer) t.skip("kein Unternehmens-Nutzer im Bestand");
    assert.ok(nutzer);
  });

  it("die Firma wird gespeichert, und getDemandById gibt SIE heraus — nicht die Start-Firma", async (t) => {
    if (!nutzer) return t.skip("kein Gegenstand");
    const firmaA = await neueFirma("N2.11 Firma A");
    const d = await createDemandRequest(client, nutzer.id, "PRO",
      { title: "N2.11", role: "Pflege", start_date: "2027-01-01", location_city: "Münster", requester_org_id: firmaA });
    assert.equal(d.requester_org_id, firmaA, "die Firma wurde nicht gespeichert");
    const geladen = await getDemandById(client, d.id);
    assert.equal(geladen.requester_org_id, firmaA, "getDemandById liefert die Start-Firma statt der gespeicherten");
    assert.notEqual(firmaA, nutzer.org_id);
    assert.equal(await kundenOrgEinesBedarfs(client, geladen), firmaA);
  });

  it("ohne gespeicherte Firma: Rueckfall auf die Start-Firma, in SQL und in JavaScript gleich", async (t) => {
    if (!nutzer) return t.skip("kein Gegenstand");
    const d = await createDemandRequest(client, nutzer.id, "PRO",
      { title: "N2.11 alt", role: "Pflege", start_date: "2027-01-01", location_city: "Münster" });
    assert.equal(d.requester_org_id, null);
    assert.equal((await getDemandById(client, d.id)).requester_org_id, nutzer.org_id);
    assert.equal(await kundenOrgEinesBedarfs(client, d), nutzer.org_id);
  });

  it("der Nachtrag der Migration: einzige Unternehmens-Mitgliedschaft gewinnt, bei zweien die Start-Firma", async (t) => {
    if (!nutzer) return t.skip("kein Gegenstand");
    const nachtrag = fs.readFileSync(MIGRATION, "utf8")
      .replace(/^\s*(BEGIN|COMMIT);\s*$/gm, "")
      .replace(/^\s*SET client_min_messages.*$/gm, "");
    assert.ok(!/\bCOMMIT\b/.test(nachtrag.replace(/--.*$/gm, "")), "die Migration traegt noch ein COMMIT — sie wuerde die Probe festschreiben");

    await client.query("SAVEPOINT nachtrag");
    // Der Nutzer handelt NUR noch fuer Firma T (eine aktive Unternehmens-Mitgliedschaft).
    await client.query("UPDATE org_memberships SET is_active = FALSE WHERE user_id = $1", [nutzer.id]);
    const firmaT = await neueFirma("N2.11 Team");
    await client.query("INSERT INTO org_memberships (user_id, org_id, role_key, is_active) VALUES ($1, $2, 'member', TRUE)", [nutzer.id, firmaT]);
    const alt = await createDemandRequest(client, nutzer.id, "PRO",
      { title: "N2.11 Altbestand", role: "Pflege", start_date: "2027-01-01", location_city: "Münster" });

    await client.query(nachtrag);
    assert.equal((await eins("SELECT requester_org_id FROM demand_requests WHERE id = $1", [alt.id])).requester_org_id, firmaT,
      "der Altbestand eines Teammitglieds bekam nicht seine einzige Firma");

    // Eine ZWEITE aktive Unternehmens-Mitgliedschaft: nicht eindeutig -> Start-Firma.
    const firmaZ = await neueFirma("N2.11 Zweite");
    await client.query("INSERT INTO org_memberships (user_id, org_id, role_key, is_active) VALUES ($1, $2, 'member', TRUE)", [nutzer.id, firmaZ]);
    await client.query("UPDATE demand_requests SET requester_org_id = NULL WHERE id = $1", [alt.id]);
    await client.query(nachtrag);
    assert.equal((await eins("SELECT requester_org_id FROM demand_requests WHERE id = $1", [alt.id])).requester_org_id, nutzer.org_id,
      "bei zwei Firmen wurde geraten statt auf die Start-Firma zurueckzufallen");

    // Und ein bereits gesetzter Wert wird NIE ueberschrieben.
    await client.query("UPDATE demand_requests SET requester_org_id = $1 WHERE id = $2", [firmaZ, alt.id]);
    await client.query(nachtrag);
    assert.equal((await eins("SELECT requester_org_id FROM demand_requests WHERE id = $1", [alt.id])).requester_org_id, firmaZ);
    await client.query("ROLLBACK TO SAVEPOINT nachtrag");
  });

  it("Blaettern: bei identischem Zeitstempel keine Doppelten, keine Luecken — Angebotsseite", async (t) => {
    const { rows } = await client.query("SELECT id FROM capacity_posts WHERE status = 'active' AND is_active = TRUE");
    if (rows.length < 3) return t.skip("weniger als drei aktive Angebote");
    await client.query("UPDATE capacity_posts SET updated_at = TIMESTAMPTZ '2026-09-15 10:12:30.038324+00' WHERE status = 'active' AND is_active = TRUE");
    const erste = await browseFeed(client, { viewer_role: "company", limit: 2, page: 1 });
    const gesehen = [];
    const seiten = Math.ceil(erste.total / 2);
    for (let seite = 1; seite <= seiten; seite++) {
      const r = await browseFeed(client, { viewer_role: "company", limit: 2, page: seite });
      gesehen.push(...r.items.map((i) => i.id));
    }
    assert.ok(erste.total >= 3, `Probe ohne Gleichstand-Menge: total=${erste.total}`);
    assert.equal(new Set(gesehen).size, gesehen.length, "Doppelte zwischen den Seiten: " + gesehen.join(", "));
    assert.equal(gesehen.length, erste.total, `Seiten ergeben ${gesehen.length} Eintraege, total sagt ${erste.total}`);
  });

  it("Blaettern ueber BEIDE Seiten bei Gleichstand: dieselbe totale Ordnung in SQL und Zusammenfuehrung", async (t) => {
    const zeit = "TIMESTAMPTZ '2026-09-15 10:12:30.038999+00'";
    await client.query(`UPDATE capacity_posts SET updated_at = ${zeit} WHERE status = 'active' AND is_active = TRUE`);
    await client.query(`UPDATE demand_requests SET updated_at = ${zeit} WHERE status = 'open'`);
    const erste = await browseFeed(client, { limit: 2, page: 1 });   // ohne Rolle: beide Marktseiten
    if (erste.total < 4) return t.skip(`zu wenig Eintraege ueber beide Seiten (${erste.total})`);
    const gesehen = [];
    for (let seite = 1; seite <= Math.ceil(erste.total / 2); seite++) {
      const r = await browseFeed(client, { limit: 2, page: seite });
      gesehen.push(...r.items.map((i) => `${i.feed_type}:${i.id}`));
    }
    assert.equal(new Set(gesehen).size, gesehen.length, "Doppelte beim Zusammenfuehren: " + gesehen.join(", "));
    assert.equal(gesehen.length, erste.total);
  });

  it("der Umkreis rechnet INNERHALB: nah ist drin, fern ist draussen, groesserer Radius nimmt nichts weg", async (t) => {
    const post = await eins(
      `SELECT id, location_lat, location_lng FROM capacity_posts
        WHERE status = 'active' AND is_active = TRUE AND location_lat IS NOT NULL AND location_lng IS NOT NULL LIMIT 1`);
    if (!post) return t.skip("kein aktives Angebot mit Koordinaten");
    await client.query("UPDATE capacity_posts SET radius_km = 1 WHERE id = $1", [post.id]);
    const lat = Number(post.location_lat);
    const lng = Number(post.location_lng);
    const drin = (r) => r.items.some((i) => i.id === post.id);

    const nah = await browseFeed(client, { viewer_role: "company", latitude: lat, longitude: lng, radius_km: 1, limit: 100 });
    assert.ok(drin(nah), "ein Angebot am Suchpunkt fehlt bei Radius 1 — der Vergleich rechnet nicht 'innerhalb'");

    const fernLat = lat > 0 ? lat - 5 : lat + 5;   // ~555 km entfernt
    const fern = await browseFeed(client, { viewer_role: "company", latitude: fernLat, longitude: lng, radius_km: 1, limit: 100 });
    assert.equal(drin(fern), false, "ein 555 km entferntes Angebot steht im 1-km-Umkreis");

    const klein = await browseFeed(client, { viewer_role: "company", latitude: lat, longitude: lng, radius_km: 5, limit: 1 });
    const gross = await browseFeed(client, { viewer_role: "company", latitude: lat, longitude: lng, radius_km: 500, limit: 1 });
    assert.ok(gross.total >= klein.total, `groesserer Radius, weniger Treffer: ${klein.total} -> ${gross.total}`);
  });
});
