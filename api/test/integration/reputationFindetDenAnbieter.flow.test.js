/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z5 — DIE REPUTATION FINDET DEN ANBIETER, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Drei Dienste haben `supplier_reputation` in drei erfundenen Formen gelesen
 * bzw. geschrieben. Der Sofort-Abgleich las
 *
 *     SELECT org_id, overall_score FROM supplier_reputation WHERE org_id = ANY($1)
 *
 * — keine der beiden Spalten existiert. Der Wurf lief in
 * `catch { return new Map(); }`, und eine leere Karte sieht im Ergebnis genauso
 * aus wie "niemand hat Reputation". Es hat also nie ein Anbieter einen
 * Reputationsbonus erhalten, und niemand konnte es sehen.
 *
 * Dieselbe Funktion hatte einen zweiten, unabhaengigen Fehler: die Smart-Rank-
 * Abfrage stand auf `FROM organizations o WHERE o.id = ANY($1)`, bekommt aber
 * `capacity_posts.supplier_company_id` — und diese Spalte hat einen
 * Fremdschluessel auf `users(id)`. Nutzer-Kennungen gegen die Org-Tabelle:
 * NULL ZEILEN, ohne Fehler. Gemessen per Regel, nicht per Zufall der Daten.
 *
 * WARUM DIESE DATEI: beides ist an Muster-Pool-Proben vorbeigelaufen, weil ein
 * Muster-Pool jede Abfrage annimmt und vorgefertigte Zeilen liefert. Nur eine
 * echte Datenbank zeigt, ob eine Abfrage FINDET.
 *
 * Gemessen wird deshalb nicht "der Dienst hat etwas zurueckgegeben", sondern:
 * dieselben Abfragen, die der Dienst stellt, finden an den echten Daten
 * Treffer — und die falschen Fassungen finden keine.
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15).
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/reputationFindetDenAnbieter.flow.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const HIER = path.dirname(fileURLToPath(import.meta.url));
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

describe("Z5 — die Reputation findet den Anbieter, am realen Schema", () => {
  let pool;
  let client;
  let anbieter = [];

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    const { rows } = await client.query(
      `SELECT DISTINCT supplier_company_id AS id FROM capacity_posts
        WHERE supplier_company_id IS NOT NULL LIMIT 20`);
    anbieter = rows.map((r) => r.id);
  });

  after(async () => { client?.release(); await pool?.end(); });

  it("es gibt Anbieter, an denen sich das zeigen laesst", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anbieter.length) return t.skip("keine Kapazitaets-Anzeige im Bestand");
    assert.ok(anbieter.length >= 1);
  });

  it("supplier_company_id zeigt auf NUTZER, nicht auf Organisationen — per Regel", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    /* Das ist die Grundlage der ganzen Korrektur, und sie wird an der REGEL
       gemessen, nicht an den Daten: sechs passende Werte koennten Zufall sein,
       ein Fremdschluessel nicht. */
    const { rows } = await client.query(
      `SELECT pg_get_constraintdef(oid) AS regel FROM pg_constraint
        WHERE conrelid = 'capacity_posts'::regclass AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE '%supplier_company_id%'`);
    assert.equal(rows.length, 1, "es gibt keine Regel fuer supplier_company_id");
    assert.match(rows[0].regel, /REFERENCES users\(id\)/,
      "supplier_company_id zeigt nicht auf users — dann ist die Z5-Korrektur falsch herum");
  });

  it("die KORRIGIERTE Reputationsabfrage findet Anbieter", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anbieter.length) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      "SELECT supplier_id, reputation_score FROM supplier_reputation WHERE supplier_id = ANY($1)",
      [anbieter]);
    assert.ok(rows.length >= 1,
      "kein einziger Anbieter hat eine Reputationszeile — dann sagt diese Probe nichts, "
      + "und die Korrektur ist nicht belegt");
  });

  it("die ALTE Fassung wirft — sie nannte Spalten, die es nicht gibt", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    /* Die Gegenprobe. Ohne sie koennte die Zeile darueber auch gruen sein, wenn
       die alte Fassung ebenfalls funktioniert haette — dann waere die ganze
       Aenderung unnoetig gewesen. */
    await assert.rejects(
      () => client.query("SELECT org_id, overall_score FROM supplier_reputation WHERE org_id = ANY($1)", [anbieter]),
      /column .*(org_id|overall_score).* does not exist/,
      "die alte Fassung laeuft durch — dann war der Befund keiner");
  });

  it("die KORRIGIERTE Smart-Rank-Abfrage findet Anbieter, die alte findet nichts", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anbieter.length) return t.skip("kein Gegenstand");
    const neu = await client.query(
      `SELECT u.id AS supplier_id, sm.requests_received, sr.activity_score
         FROM users u
         LEFT JOIN org_memberships om ON om.user_id = u.id AND om.role_key = 'owner'
         LEFT JOIN supplier_metrics sm ON sm.agency_id = om.org_id AND sm.window_days = 30
         LEFT JOIN supplier_reputation sr ON sr.supplier_id = u.id
        WHERE u.id = ANY($1)`, [anbieter]);
    const alt = await client.query(
      `SELECT o.id AS supplier_id
         FROM organizations o
         LEFT JOIN supplier_metrics sm ON sm.agency_id = o.id AND sm.window_days = 30
         LEFT JOIN supplier_reputation sr ON sr.supplier_id = o.id
        WHERE o.id = ANY($1)`, [anbieter]);
    assert.ok(neu.rows.length >= 1, "die korrigierte Fassung findet keinen Anbieter");
    assert.equal(alt.rows.length, 0,
      "die alte Fassung findet " + alt.rows.length + " Zeilen — dann war der Anker nicht falsch "
      + "und die Aenderung braucht eine andere Begruendung");
  });

  it("die Bruecke zur Organisation traegt: role_key, nicht role", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anbieter.length) return t.skip("kein Gegenstand");
    const { rows } = await client.query(
      `SELECT COUNT(om.org_id)::int AS mit_org FROM users u
         LEFT JOIN org_memberships om ON om.user_id = u.id AND om.role_key = 'owner'
        WHERE u.id = ANY($1)`, [anbieter]);
    assert.ok(rows[0].mit_org >= 1,
      "kein Anbieter findet ueber role_key='owner' seine Organisation — dann traegt die Bruecke nicht");
    await assert.rejects(
      () => client.query("SELECT 1 FROM org_memberships WHERE role = 'owner'"),
      /column "role" does not exist/,
      "die Spalte `role` existiert doch — dann war der Ein-Wort-Fehler keiner");
  });

  it("der Sofort-Abgleich ankert am ANBIETER, nicht an der Org-Tabelle", () => {
    /*
     * WARUM DIESE PROBE QUELLTEXT LIEST UND NICHT DEN DIENST AUSFUEHRT: die
     * Rueckmutation "Anker wieder auf organizations" hat eine erste Fassung
     * dieser Datei UEBERLEBT, weil dort der Abfragetext SELBST ausgefuehrt wurde.
     * Das belegt die richtige Form - nicht, dass der Dienst sie benutzt. Ein
     * Durchlauf des ganzen Dienstes waere die schoenere Probe, ist aber
     * datenabhaengig: gemessen liefert er bei vier aktiven Anzeigen 0 Treffer,
     * weil `minScore` greift, und eine Probe, die von Seed-Daten abhaengt, faellt
     * beim naechsten Datenstand um. Also beides: die Abfrageform gegen die echte
     * Datenbank (oben) UND hier, dass der Dienst genau diese Form stellt.
     */
    const quelle = fs.readFileSync(
      path.join(HIER, "..", "..", "services", "instantMatchService.js"), "utf8");
    const ohneKommentare = quelle
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split(String.fromCharCode(10))
      .filter((z) => !z.trim().startsWith("--") && !z.trim().startsWith("//"))
      .join(String.fromCharCode(10));

    assert.equal(/FROM organizations o\s+LEFT JOIN supplier_metrics/.test(ohneKommentare), false,
      "die Smart-Rank-Abfrage ankert wieder an organizations - sie bekommt Nutzer-Kennungen "
      + "(capacity_posts.supplier_company_id zeigt per Fremdschluessel auf users) und findet "
      + "dann null Zeilen, ohne zu werfen");
    assert.ok(/FROM users u/.test(ohneKommentare),
      "der Anker ist nicht der Anbieter");
    assert.ok(/org_memberships om ON om\.user_id = u\.id AND om\.role_key = 'owner'/.test(ohneKommentare),
      "die Bruecke zu den org-gebundenen Kennzahlen fehlt oder steht auf der falschen Spalte");
    assert.ok(/supplier_reputation sr ON sr\.supplier_id = u\.id/.test(ohneKommentare),
      "die Reputation wird nicht am Anbieter verbunden");
    assert.equal(/\boverall_score\b/.test(ohneKommentare), false,
      "die erfundene Spalte overall_score ist zurueck");
    assert.equal(/supplier_reputation WHERE org_id/.test(ohneKommentare), false,
      "die Reputationskarte liest wieder org_id - die Spalte existiert nicht");
  });

  it("die Rangliste ist nicht mehr an der falschen Spalte gebunden", () => {
    if (!hasDb) return; // reine Quelltextpruefung, laeuft immer
    /* An die WIRKUNG gehaengt, nicht an eine Zeilennummer: der Quelltext darf
       `om.role =` nicht mehr enthalten, denn genau das hat `buildSnapshotForOrg`
       werfen und die verkaufte Rangposition dauerhaft leer bleiben lassen. */
    const quelle = fs.readFileSync(
      path.join(HIER, "..", "..", "services", "profileRankingService.js"), "utf8");
    /* Kommentare ZUERST entfernen — auch die SQL-Kommentare innerhalb der
       Abfragen (`-- …`). Meine erste Fassung hat nur `/* … *​/` entfernt und
       daraufhin die Begruendung der Korrektur selbst angeklagt: dort steht
       zitiert, was fruher falsch war. Eine Probe, die ihre eigene Dokumentation
       fuer Code haelt, ist nicht streng, sondern blind fuer den Unterschied. */
    const ohneKommentare = quelle
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split(String.fromCharCode(10))
      .filter((z) => !z.trim().startsWith("--") && !z.trim().startsWith("//"))
      .join(String.fromCharCode(10));
    assert.equal(/\bom\.role\s*=/.test(ohneKommentare), false,
      "die Rangliste fragt wieder `om.role` ab — die Spalte heisst role_key, die Abfrage wirft");
    assert.ok(/om\.role_key\s*=\s*'owner'/.test(ohneKommentare),
      "die Bruecke steht nicht mehr auf role_key='owner'");
  });
});
