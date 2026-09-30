/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N2.10 — LOESCHEN RAEUMT AUF, UND DIE SPERRE GREIFT — AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Muster-Pool-Proben (`loeschenRaeumtAuf.test.js`) pinnen Zustaende und
 * Bindungen. Was sie nicht koennen: gegen die Constraints der echten Tabellen
 * schreiben. Ein Status, den ein CHECK nicht kennt, eine Spalte, die es nicht
 * gibt — im Muster-Pool gruen, in Betrieb rollt die GANZE Loeschung zurueck.
 *
 * In EINER Transaktion mit ROLLBACK baut diese Probe fuer ein echtes
 * Kraefte-Konto die ganze Einsatzplanung auf — Einladung, angenommene
 * Einladung mit Reservierung, Auswahl-Set, unbeantwortete Anfrage, Vormerkung,
 * Marktangebot, ein BEENDETER Einsatz — prueft zuerst die beiden Sperren und
 * loescht dann ueber genau den Pfad, den DELETE /me nimmt.
 *
 * Datenbankgebunden: ohne DATABASE_URL (bzw. DB_HOST + POSTGRES_PASSWORD)
 * uebersprungen — der Runner nennt das ausdruecklich als Luecke im Nachweis.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { anonymizeUser, canDeleteUser } from "../../services/dataGovernanceService.js";

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

describe("N2.10 — Loeschen raeumt auf, und die Sperre greift (reales Schema)",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  let pool;
  let client;
  let k = null;          // { user, profil, zaf, kunde }
  const ids = {};

  const eins = async (sql, params) => (await client.query(sql, params)).rows[0];

  before(async () => {
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    // Eine Kraft, die HEUTE nichts sperrt — sonst prueft die Probe den Bestand statt der Regel.
    const kraft = await eins(
      `SELECT u.id AS user, wp.id AS profil
         FROM users u JOIN worker_profiles wp ON wp.user_id = u.id
        WHERE NOT EXISTS (SELECT 1 FROM worker_assignment_links l WHERE l.worker_user_id = u.id AND l.is_active = TRUE)
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.user_id = u.id AND i.status IN ('draft','issued','overdue'))
          AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.created_by = u.id AND a.status = 'active')
          AND NOT EXISTS (SELECT 1 FROM timesheets t WHERE t.submitted_by = u.id AND t.status = 'submitted')
        LIMIT 1`);
    const orgs = await eins(
      `SELECT k.id AS kunde, z.id AS zaf FROM organizations k JOIN organizations z ON z.id <> k.id
        WHERE k.type = 'company' AND z.type = 'agency' LIMIT 1`);
    if (kraft && orgs) k = { ...kraft, ...orgs };
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  it("es gibt eine Kraft ohne offene Vorgaenge und zwei Organisationen", (t) => {
    if (!k) t.skip("kein Gegenstand im Bestand");
    assert.ok(k);
  });

  it("die Einsatzplanung wird aufgebaut — gegen die echten Constraints", async (t) => {
    if (!k) return t.skip("kein Gegenstand");
    const einsatz = async (titel) => (await eins(
      `INSERT INTO assignments (org_id, supplier_org_id, start_date, worker_description, requested_quantity, worker_count)
       VALUES ($1, $2, CURRENT_DATE, $3, 3, 3) RETURNING id`, [k.kunde, k.zaf, titel])).id;
    ids.a = await einsatz("N2.10 A Einladung+Vormerkung");
    ids.b = await einsatz("N2.10 B angenommen+reserviert");
    ids.c = await einsatz("N2.10 C Anfrage offen");
    ids.d = await einsatz("N2.10 D beendet");
    const kampagne = async (a) => (await eins(
      `INSERT INTO assignment_staffing_campaigns (assignment_id, org_id, supplier_org_id, name)
       VALUES ($1, $2, $3, 'N2.10') RETURNING id`, [a, k.kunde, k.zaf])).id;
    const campA = await kampagne(ids.a);
    const campB = await kampagne(ids.b);

    ids.einladungA = (await eins(
      `INSERT INTO assignment_staffing_invites (assignment_id, campaign_id, worker_user_id, org_id, supplier_org_id, status)
       VALUES ($1, $2, $3, $4, $5, 'sent') RETURNING id`, [ids.a, campA, k.user, k.kunde, k.zaf])).id;
    ids.einladungB = (await eins(
      `INSERT INTO assignment_staffing_invites (assignment_id, campaign_id, worker_user_id, org_id, supplier_org_id, status, accepted_at)
       VALUES ($1, $2, $3, $4, $5, 'accepted', NOW()) RETURNING id`, [ids.b, campB, k.user, k.kunde, k.zaf])).id;
    ids.reservierung = (await eins(
      `INSERT INTO assignment_staffing_reservations (assignment_id, campaign_id, invite_id, worker_user_id, org_id, supplier_org_id, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'reserved', NOW() + INTERVAL '1 hour') RETURNING id`,
      [ids.b, campB, ids.einladungB, k.user, k.kunde, k.zaf])).id;
    ids.auswahl = (await eins(
      `INSERT INTO assignment_staffing_choice_sets (worker_user_id, supplier_org_id, status)
       VALUES ($1, $2, 'options_presented') RETURNING id`, [k.user, k.zaf])).id;
    ids.anfrage = (await eins(
      `INSERT INTO worker_assignment_links (worker_user_id, assignment_id, org_id, supplier_org_id, start_date, worker_confirmation_status)
       VALUES ($1, $2, $3, $4, CURRENT_DATE + 3, 'pending_confirmation') RETURNING id`, [k.user, ids.c, k.kunde, k.zaf])).id;
    ids.beendet = (await eins(
      `INSERT INTO worker_assignment_links (worker_user_id, assignment_id, org_id, supplier_org_id, start_date, end_date, worker_confirmation_status)
       VALUES ($1, $2, $3, $4, CURRENT_DATE - 10, CURRENT_DATE - 1, 'worker_confirmed') RETURNING id`, [k.user, ids.d, k.kunde, k.zaf])).id;
    await client.query(
      `INSERT INTO assignment_staffing_waitlist (assignment_id, worker_user_id, org_id, supplier_org_id, status, queue_rank, score)
       VALUES ($1, $2, $3, $4, 'queued', 1, 55)`, [ids.a, k.user, k.kunde, k.zaf]);
    const post = await eins("SELECT id FROM capacity_posts ORDER BY created_at DESC LIMIT 1");
    if (post) {
      ids.markt = post.id;
      await client.query("UPDATE capacity_posts SET worker_profile_id = $1, status = 'active', is_active = TRUE WHERE id = $2", [k.profil, post.id]);
    }
    await client.query("UPDATE worker_profiles SET is_active = TRUE WHERE id = $1", [k.profil]);
    await client.query("UPDATE users SET latitude = 52.52, longitude = 13.40 WHERE id = $1", [k.user]);
    assert.ok(ids.anfrage && ids.reservierung && ids.auswahl);
  });

  it("ein BEENDETER Einsatz und eine unbeantwortete Anfrage sperren nicht", async (t) => {
    if (!ids.anfrage) return t.skip("kein Gegenstand");
    assert.deepEqual((await canDeleteUser(client, k.user)).blockers, []);
  });

  it("ein Einsatz, der HEUTE endet, sperrt — und es wird nichts veraendert", async (t) => {
    if (!ids.anfrage) return t.skip("kein Gegenstand");
    const { rows: [heute] } = await client.query(
      `INSERT INTO worker_assignment_links (worker_user_id, assignment_id, org_id, supplier_org_id, start_date, end_date, worker_confirmation_status)
       VALUES ($1, $2, $3, $4, CURRENT_DATE - 5, (NOW() AT TIME ZONE 'Europe/Berlin')::date, 'worker_confirmed') RETURNING id`,
      [k.user, ids.a, k.kunde, k.zaf]);
    const r = await anonymizeUser(client, k.user, k.user);
    assert.equal(r.success, false);
    assert.deepEqual(r.blockers, [{ reason: "ACTIVE_DEPLOYMENTS", count: 1 }]);
    assert.equal((await eins("SELECT status FROM assignment_staffing_invites WHERE id = $1", [ids.einladungA])).status, "sent");
    assert.equal((await eins("SELECT is_active FROM worker_profiles WHERE id = $1", [k.profil])).is_active, true);
    await client.query("DELETE FROM worker_assignment_links WHERE id = $1", [heute.id]);
  });

  it("eine offene Rechnung sperrt", async (t) => {
    if (!ids.anfrage) return t.skip("kein Gegenstand");
    await client.query("SAVEPOINT rechnung");
    await client.query(
      `INSERT INTO invoices (invoice_number, user_id, billing_period_start, billing_period_end, plan, amount_cents, total_cents, status)
       VALUES ($1, $2, CURRENT_DATE - 30, CURRENT_DATE, 'BASIS', 100, 119, 'issued')`, [`N210-${randomUUID()}`, k.user]);
    assert.deepEqual((await canDeleteUser(client, k.user)).blockers, [{ reason: "OPEN_INVOICES", count: 1 }]);
    await client.query("ROLLBACK TO SAVEPOINT rechnung");
  });

  it("DELETE /me-Pfad: alles aufgeraeumt, Aufbewahrtes bleibt, Zaehler neu gerechnet", async (t) => {
    if (!ids.anfrage) return t.skip("kein Gegenstand");
    const vorher = await eins("SELECT reserved_quantity FROM assignments WHERE id = $1", [ids.b]);
    // Einsatz B traegt die Reservierung: erst neu rechnen, damit "vorher" die Wahrheit ist.
    await client.query("UPDATE assignments SET reserved_quantity = 1 WHERE id = $1", [ids.b]);

    const r = await anonymizeUser(client, k.user, k.user);
    assert.equal(r.success, true, `Loeschung verweigert: ${JSON.stringify(r)}`);

    assert.equal((await eins("SELECT is_active FROM worker_profiles WHERE id = $1", [k.profil])).is_active, false, "Profil noch aktiv");
    const u = await eins("SELECT latitude, longitude FROM users WHERE id = $1", [k.user]);
    assert.deepEqual([u.latitude, u.longitude], [null, null], "Koordinaten stehen noch");

    assert.equal((await eins("SELECT status FROM assignment_staffing_invites WHERE id = $1", [ids.einladungA])).status, "cancelled");
    assert.equal((await eins("SELECT status FROM assignment_staffing_invites WHERE id = $1", [ids.einladungB])).status, "cancelled",
      "die angenommene Einladung mit freigegebener Reservierung steht noch");
    const res = await eins("SELECT status, release_reason FROM assignment_staffing_reservations WHERE id = $1", [ids.reservierung]);
    assert.deepEqual([res.status, res.release_reason], ["released", "person_geloescht"]);
    assert.equal((await eins("SELECT status FROM assignment_staffing_choice_sets WHERE id = $1", [ids.auswahl])).status, "cancelled");
    const anf = await eins("SELECT worker_confirmation_status, is_active FROM worker_assignment_links WHERE id = $1", [ids.anfrage]);
    assert.deepEqual([anf.worker_confirmation_status, anf.is_active], ["worker_declined", false]);
    assert.equal(Number((await eins("SELECT COUNT(*) AS n FROM assignment_staffing_waitlist WHERE worker_user_id = $1", [k.user])).n), 0,
      "Vormerkungen stehen noch");
    if (ids.markt) {
      const p = await eins("SELECT status, is_active FROM capacity_posts WHERE id = $1", [ids.markt]);
      assert.deepEqual([p.status, p.is_active], ["archived", false], "das Marktangebot der Person steht noch im Markt");
    }

    // Aufbewahrt: der beendete Einsatz bleibt, wie er war.
    const end = await eins("SELECT worker_confirmation_status, is_active FROM worker_assignment_links WHERE id = $1", [ids.beendet]);
    assert.deepEqual([end.worker_confirmation_status, end.is_active], ["worker_confirmed", true]);

    // Die freigegebene Reservierung gibt ihren Platz wirklich frei.
    assert.equal((await eins("SELECT reserved_quantity FROM assignments WHERE id = $1", [ids.b])).reserved_quantity, 0,
      `Zaehler nicht neu gerechnet (vorher ${vorher.reserved_quantity})`);

    const audit = await eins(
      `SELECT details FROM audit_log WHERE action = 'dsgvo.anonymize' AND entity_id::text = $1 ORDER BY created_at DESC LIMIT 1`, [k.user]);
    assert.equal(audit.details.einsatzplanung.vormerkungen, 1);
    assert.equal(audit.details.einsatzplanung.reservierungen, 1);
    assert.equal(audit.details.einsatzplanung.einladungen, 2);
    assert.equal(audit.details.einsatzplanung.anfragen, 1);
    assert.equal(audit.details.einsatzplanung.auswahl, 1);
  });
});
