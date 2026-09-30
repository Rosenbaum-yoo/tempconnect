/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N2.10 — DIE DSGVO-AUSKUNFT AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Auskunft hat monatelang fuer JEDEN Nutzer `null` geliefert, und kein Test
 * hat es bemerkt: die Muster-Pool-Proben gaben der Nutzerabfrage eine Zeile,
 * egal welche Spalten sie verlangte. `safeQuery` schluckt jeden Fehler — von
 * aussen sah eine kaputte Auskunft aus wie eine leere.
 *
 * Diese Probe laesst die Auskunft gegen die echte Datenbank laufen und macht die
 * geschluckten Fehler SICHTBAR: der Pool wird so umhuellt, dass jeder
 * Abfragefehler mitgeschrieben wird, bevor `safeQuery` ihn verschluckt. Null
 * Fehler ist die Zusicherung — nicht "es kam etwas zurueck".
 *
 * Dazu in EINER Transaktion mit ROLLBACK: ein Einsatz, eine Einladung und eine
 * Vormerkung fuer ein echtes Kraefte-Konto — und der Nachweis, dass beide in der
 * Auskunft ankommen, mit Firma und Taetigkeit, ohne Kundenunternehmen.
 *
 * Datenbankgebunden: ohne DATABASE_URL (bzw. DB_HOST + POSTGRES_PASSWORD)
 * uebersprungen — der Runner nennt das ausdruecklich als Luecke im Nachweis.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { exportUserDataFull, exportOrgDataFull } from "../../services/dataGovernanceService.js";

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

describe("N2.10 — die DSGVO-Auskunft am realen Schema",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let fehler;
  let beobachtet;
  let kraft = null;     // ein Kraefte-Konto mit Profil
  let orgs = null;      // Kunde + Zeitarbeitsfirma fuer den Probe-Einsatz

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    fehler = [];
    // Jede Abfrage durch einen SAVEPOINT: ein Fehler darf die Transaktion nicht
    // abbrechen, sonst scheiterten alle folgenden Abfragen mit — und die Probe
    // zaehlte Folgefehler statt Ursachen.
    let n = 0;
    beobachtet = {
      query: async (sql, params) => {
        const sp = `auskunft_${++n}`;
        await client.query(`SAVEPOINT ${sp}`);
        try {
          const r = await client.query(sql, params);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          return r;
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          fehler.push(`${err.message} :: ${String(sql).replace(/\s+/g, " ").slice(0, 100)}`);
          throw err;
        }
      }
    };
    const { rows } = await client.query(
      "SELECT u.id FROM users u JOIN worker_profiles wp ON wp.user_id = u.id LIMIT 1");
    kraft = rows[0]?.id || null;
    const { rows: o } = await client.query(
      `SELECT k.id AS kunde, z.id AS zaf FROM organizations k JOIN organizations z ON z.id <> k.id
        WHERE k.type = 'company' AND z.type = 'agency' LIMIT 1`);
    orgs = o[0] || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  it("es gibt ein Kraefte-Konto, an dem sich die Auskunft zeigen laesst", (t) => {
    if (!kraft) t.skip("kein Kraefte-Konto im Bestand");
    assert.ok(kraft);
  });

  it("die Auskunft liefert — und KEINE ihrer Abfragen scheitert", async (t) => {
    if (!kraft) return t.skip("kein Gegenstand");
    fehler.length = 0;
    const erg = await exportUserDataFull(beobachtet, kraft);
    assert.deepEqual(fehler, [], "Abfragen der Auskunft scheitern still (safeQuery schluckt sie)");
    assert.notEqual(erg, null, "die Auskunft liefert null — GET /me/export antwortet dann 404");
    assert.equal(erg.category_A.user.id, kraft);
    assert.ok("latitude" in erg.category_A.user && "longitude" in erg.category_A.user, "Koordinaten fehlen in der Auskunft");
    assert.equal("password_hash" in erg.category_A.user, false);
  });

  it("Einladung und Vormerkung kommen an — mit Firma und Taetigkeit, ohne Kundenunternehmen", async (t) => {
    if (!kraft || !orgs) return t.skip("kein Gegenstand");
    const { rows: [einsatz] } = await client.query(
      `INSERT INTO assignments (org_id, supplier_org_id, start_date, worker_description)
       VALUES ($1, $2, CURRENT_DATE, 'N2.10 Probe Lager') RETURNING id`, [orgs.kunde, orgs.zaf]);
    const { rows: [kampagne] } = await client.query(
      `INSERT INTO assignment_staffing_campaigns (assignment_id, org_id, supplier_org_id, name)
       VALUES ($1, $2, $3, 'N2.10 Probe') RETURNING id`, [einsatz.id, orgs.kunde, orgs.zaf]);
    await client.query(
      `INSERT INTO assignment_staffing_invites (assignment_id, campaign_id, worker_user_id, org_id, supplier_org_id, status, score)
       VALUES ($1, $2, $3, $4, $5, 'sent', 70)`, [einsatz.id, kampagne.id, kraft, orgs.kunde, orgs.zaf]);
    // Eine ZWEITE Person bekommt eine Vormerkung am selben Einsatz — sie darf in
    // der Auskunft der ersten nicht erscheinen.
    const { rows: andere } = await client.query(
      "SELECT u.id FROM users u JOIN worker_profiles wp ON wp.user_id = u.id WHERE u.id <> $1 LIMIT 1", [kraft]);
    await client.query(
      `INSERT INTO assignment_staffing_waitlist (assignment_id, worker_user_id, org_id, supplier_org_id, status, queue_rank, score, match_reasons)
       VALUES ($1, $2, $3, $4, 'queued', 2, 61.5, '["Skill passt"]'::jsonb)`, [einsatz.id, kraft, orgs.kunde, orgs.zaf]);
    if (andere[0]) {
      await client.query(
        `INSERT INTO assignment_staffing_waitlist (assignment_id, worker_user_id, org_id, supplier_org_id, status, queue_rank)
         VALUES ($1, $2, $3, $4, 'queued', 1)`, [einsatz.id, andere[0].id, orgs.kunde, orgs.zaf]);
    }

    fehler.length = 0;
    const erg = await exportUserDataFull(beobachtet, kraft);
    assert.deepEqual(fehler, []);
    const { invites, waitlist, notice } = erg.category_B.staffing;
    const einladung = invites.find((i) => i.assignment_id === einsatz.id);
    const vormerkung = waitlist.filter((w) => w.assignment_id === einsatz.id);
    assert.ok(einladung, "die Einladung fehlt in der Auskunft");
    assert.equal(vormerkung.length, 1, `erwartet genau die EIGENE Vormerkung, gefunden ${vormerkung.length}`);
    assert.equal(vormerkung[0].queue_rank, 2);
    assert.equal(Number(vormerkung[0].score), 61.5);
    assert.deepEqual(vormerkung[0].match_reasons, ["Skill passt"]);
    assert.equal(vormerkung[0].taetigkeit, "N2.10 Probe Lager");
    const { rows: [zaf] } = await client.query("SELECT name FROM organizations WHERE id = $1", [orgs.zaf]);
    const { rows: [kunde] } = await client.query("SELECT name FROM organizations WHERE id = $1", [orgs.kunde]);
    // Ohne verschiedene Namen koennte die Probe Firma und Kunde nicht unterscheiden.
    assert.notEqual(kunde.name, zaf.name, "Kunde und Zeitarbeitsfirma tragen denselben Namen — Probe ohne Unterscheidung");
    for (const [was, zeile] of [["Vormerkung", vormerkung[0]], ["Einladung", einladung]]) {
      assert.equal(zeile.zeitarbeitsfirma, zaf.name, `${was}: als Firma steht nicht die Zeitarbeitsfirma`);
      assert.equal(JSON.stringify(zeile).includes(kunde.name), false, `${was} nennt das Kundenunternehmen`);
    }
    assert.ok(notice.length > 50);
  });

  it("der Org-Export scheitert an keiner Abfrage", async (t) => {
    const { rows } = await client.query(
      `SELECT o.id FROM organizations o
        ORDER BY EXISTS (SELECT 1 FROM contracts c WHERE c.buyer_org_id = o.id OR c.supplier_org_id = o.id) DESC
        LIMIT 1`);
    if (!rows[0]) return t.skip("keine Organisation im Bestand");
    fehler.length = 0;
    const erg = await exportOrgDataFull(beobachtet, rows[0].id);
    assert.deepEqual(fehler, [], "Abfragen des Org-Exports scheitern still");
    assert.notEqual(erg, null);
  });
});
