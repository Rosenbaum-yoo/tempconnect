/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z6 — DIE AKTE EINES LIEFERANTEN: VERLAUF, NOTIZEN, REPUTATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Drei Dinge waren an der Lieferantenverwaltung kaputt, alle drei stumm oder
 * mit einer 500, und alle drei an Muster-Pool-Proben vorbei:
 *
 * 1. `vendor_pool_history` existierte nicht. `getHistory` warf, die Route fing
 *    es nicht — wer den Verlauf eines Lieferanten aufrief, bekam eine 500. Beim
 *    Schreiben hat `swallow` den Wurf gefangen: jede Tier-Aenderung hat eine
 *    Warnung erzeugt und keinen Verlauf.
 *    BEHOBEN OHNE TABELLE: die Aenderungen stehen schon im Audit-Log.
 *
 * 2. `vendor_pool_notes` existierte nicht. Notiz schreiben und lesen: 500.
 *    BEHOBEN MIT TABELLE (Migration 224) — eine Notiz ist Inhalt, kein
 *    Protokoll, und der Audit-Eintrag schneidet bei 200 Zeichen ab.
 *
 * 3. NEUN Abfragen verbanden `supplier_reputation.supplier_id` (ein NUTZER, per
 *    Fremdschluessel) mit `vendor_pool.supplier_org_id` (eine ORGANISATION, per
 *    Fremdschluessel). Ein LEFT JOIN, der nie trifft: kein Fehler, nur lauter
 *    NULL. Die ganze Lieferantenverwaltung hat KEINE Reputation angezeigt, und
 *    die Liste der schwaechsten Lieferanten (mit
 *    `WHERE sr.reputation_score IS NOT NULL`) war dauerhaft leer.
 *    BEHOBEN mit `reputationSql.reputationJoinSql` — EINE Stelle statt neun.
 *
 * Diese Probe legt dazu einen echten Pool-Eintrag an (in einer zurueckgerollten
 * Transaktion), weil `vendor_pool` leer ist: ohne Zeile waere jede Zusicherung
 * ueber "findet die Reputation" leer gruen. Das ist die Lehre aus
 * "Muster-Zeile aus echter Projektion".
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15).
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/lieferantAkteUndVerlauf.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as vendorPoolService from "../../services/vendorPoolService.js";
import { reputationJoinSql } from "../../services/reputationSql.js";

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

describe("Z6 — die Akte eines Lieferanten, am realen Schema", () => {
  let pool;
  let client;
  let aufbau = null;   // { kundeOrg, lieferantOrg, eigentuemer, eintragId }

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");

    /* Ein Lieferant, dessen EIGENTUEMER eine Reputationszeile hat — sonst kann
       die Probe ueber die Bruecke nichts finden und waere leer gruen. */
    const { rows } = await client.query(
      `SELECT om.org_id AS lieferant_org, om.user_id AS eigentuemer
         FROM org_memberships om
         JOIN supplier_reputation sr ON sr.supplier_id = om.user_id
        WHERE om.role_key = 'owner'
        LIMIT 1`);
    /* NICHT `reputation_score IS NOT NULL`: gemessen am 2026-09-27 ist dieser
       Wert in ALLEN neun Zeilen null (grade='UNRATED', nur avg_stars gesetzt) -
       der kanonische Schreiber `reputationService` hat fuer sie nie gelaufen. Eine
       Probe mit dieser Vorbedingung haette sich selbst uebersprungen und
       gemeldet, es gebe keinen Gegenstand. Gemessen wird deshalb an `grade`:
       die Spalte ist NOT NULL, also ist NULL dort der eindeutige Beweis, dass
       der Join NICHT getroffen hat. Dass `reputation_score` leer bleibt, ist ein
       eigener Befund und gehoert nicht in diese Zusicherung. */
    if (!rows.length) return;
    const { rows: kunden } = await client.query(
      "SELECT id FROM organizations WHERE id <> $1 LIMIT 1", [rows[0].lieferant_org]);
    if (!kunden.length) return;

    const { rows: eintrag } = await client.query(
      `INSERT INTO vendor_pool (client_org_id, supplier_org_id, tier, status, reason)
       VALUES ($1, $2, 'SECONDARY', 'active', 'Z6 Probe')
       RETURNING id`,
      [kunden[0].id, rows[0].lieferant_org]);
    aufbau = {
      kundeOrg: kunden[0].id,
      lieferantOrg: rows[0].lieferant_org,
      eigentuemer: rows[0].eigentuemer,
      eintragId: eintrag[0].id
    };
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && aufbau) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && aufbau) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  it("der Aufbau steht: ein Lieferant, dessen Eigentuemer eine Reputation hat", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Lieferant mit Reputation am Eigentuemer im Bestand");
    assert.ok(aufbau.eintragId);
  });

  /* ── 1. Notizen ─────────────────────────────────────────────────────────── */

  it("eine Notiz laesst sich anlegen und wiederfinden — vorher warf beides", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    const notiz = await vendorPoolService.addNote(
      client, aufbau.eintragId, aufbau.eigentuemer, "  Erste Notiz zur Zusammenarbeit  ");
    assert.ok(notiz?.id, "das Anlegen liefert keine Zeile");
    assert.equal(notiz.note_text, "Erste Notiz zur Zusammenarbeit",
      "der Text wird nicht getrimmt gespeichert");

    const liste = await vendorPoolService.listNotes(client, aufbau.eintragId);
    assert.equal(liste.length, 1, "die Notiz steht nicht in der Liste");
    assert.equal(liste[0].author_id, aufbau.eigentuemer, "der Verfasser fehlt");
  });

  it("Notizen kommen in umgekehrter Zeitfolge, die juengste zuerst", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    await client.query(
      `INSERT INTO vendor_pool_notes (vendor_pool_id, author_id, note_text, created_at)
       VALUES ($1, $2, 'alt', NOW() - INTERVAL '2 days'),
              ($1, $2, 'neu', NOW())`,
      [aufbau.eintragId, aufbau.eigentuemer]);
    const liste = await vendorPoolService.listNotes(client, aufbau.eintragId);
    assert.deepEqual(liste.map((n) => n.note_text), ["neu", "alt"],
      "die Reihenfolge stimmt nicht: " + JSON.stringify(liste.map((n) => n.note_text)));
  });

  it("eine leere Notiz wird abgewiesen — an der Grenze UND in der Datenbank", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    await assert.rejects(() => vendorPoolService.addNote(client, aufbau.eintragId, null, "   "),
      /Note text required/, "leerer Text kommt durch die Eingangsgrenze");
    /* Und die Struktur haelt auch, wenn ein anderer Weg die Grenze umgeht. */
    await assert.rejects(
      () => client.query(
        "INSERT INTO vendor_pool_notes (vendor_pool_id, note_text) VALUES ($1, '  ')",
        [aufbau.eintragId]),
      /vendor_pool_notes_text_nicht_leer|violates check constraint/,
      "die Datenbank nimmt eine leere Notiz an");
  });

  /* ── 2. Verlauf aus dem Audit-Log ───────────────────────────────────────── */

  it("der Verlauf kommt aus dem Audit-Log, mit alt, neu und Grund", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    /* Geschrieben wird der Eintrag von der ROUTE (res.locals.audit). Die Probe
       schreibt ihn deshalb in derselben Form, in der die Route ihn schreibt —
       anders gesagt: sie prueft den LESEWEG, und der ist der kaputte gewesen. */
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, old_values, new_values, details)
       VALUES ('vendor_pool.tier_change', 'vendor_pool', $1::text, $2,
               jsonb_build_object('tier', 'SECONDARY'), jsonb_build_object('tier', 'PREFERRED'),
               jsonb_build_object('reason', 'gute Zusammenarbeit'))`,
      [aufbau.eintragId, aufbau.eigentuemer]);

    const verlauf = await vendorPoolService.getHistory(client, aufbau.eintragId);
    assert.equal(verlauf.length, 1, "der Verlauf ist leer: " + JSON.stringify(verlauf));
    const v = verlauf[0];
    assert.equal(v.field_changed, "tier");
    assert.equal(v.old_value, "SECONDARY", "der alte Wert fehlt — dann sagt der Verlauf nicht, von was");
    assert.equal(v.new_value, "PREFERRED");
    assert.equal(v.reason, "gute Zusammenarbeit",
      "der Grund fehlt — 'wurde geaendert' ohne Warum ist kein Verlauf");
    assert.equal(v.changed_by, aufbau.eigentuemer, "der Akteur fehlt");
  });

  it("der Verlauf zeigt NUR diesen Lieferanten", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    /* Gegenprobe: ohne sie waere alles darueber auch dann gruen, wenn die Abfrage
       gar nicht an den Eintrag gebunden waere — und ein Verlauf, der die Sperrung
       eines FREMDEN Lieferanten zeigt, ist ein Datenleck zwischen zwei Kunden. */
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, old_values, new_values)
       VALUES ('vendor_pool.status_change', 'vendor_pool', $1,
               jsonb_build_object('status', 'active'), jsonb_build_object('status', 'blocked'))`,
      ["00000000-0000-0000-0000-0000000000aa"]);
    const verlauf = await vendorPoolService.getHistory(client, aufbau.eintragId);
    assert.equal(verlauf.some((v) => v.new_value === "blocked"), false,
      "der Verlauf eines fremden Lieferanten erscheint hier");
  });

  it("`vendor_pool_history` existiert weiterhin nicht — der Befund bleibt behoben", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'vendor_pool_history'`);
    assert.deepEqual(rows, [],
      "die Verlaufstabelle ist aufgetaucht — dann gibt es zwei Verlaeufe, und beim Streit um "
      + "eine Sperrung ist die Frage, welcher stimmt");
  });

  /* ── 3. Die Reputation findet den Lieferanten ───────────────────────────── */

  it("die Lieferantenliste zeigt die Reputation — vorher immer NULL", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    const liste = await vendorPoolService.listForClientEnriched(client, aufbau.kundeOrg, {});
    const eintrag = (liste.items || liste).find?.((e) => e.id === aufbau.eintragId)
      || (liste.items || liste)[0];
    assert.ok(eintrag, "der angelegte Lieferant steht nicht in der Liste");
    assert.notEqual(eintrag.grade, null,
      "grade ist NULL, obwohl der Eigentuemer eine Reputationszeile hat — die Spalte ist NOT NULL, "
      + "also hat der Join nicht getroffen");
  });

  it("der Join ueber den Eigentuemer trifft, der alte ueber die Org nicht", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    const neu = await client.query(
      `SELECT sr.grade FROM vendor_pool vp
       ${reputationJoinSql("vp.supplier_org_id")}
        WHERE vp.id = $1`, [aufbau.eintragId]);
    const alt = await client.query(
      `SELECT sr.grade FROM vendor_pool vp
         LEFT JOIN supplier_reputation sr ON sr.supplier_id = vp.supplier_org_id
        WHERE vp.id = $1`, [aufbau.eintragId]);
    assert.notEqual(neu.rows[0]?.grade, null, "die neue Form findet nichts");
    assert.equal(alt.rows[0]?.grade, null,
      "die ALTE Form findet ebenfalls etwas — dann war der Schluessel nicht falsch und die "
      + "Aenderung braucht eine andere Begruendung");
  });

  it("die Uebersicht laeuft und liest den Verlauf aus dem Audit-Log", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!aufbau) return t.skip("kein Gegenstand");
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, old_values, new_values, details)
       VALUES ('vendor_pool.status_change', 'vendor_pool', $1::text,
               jsonb_build_object('status', 'active'), jsonb_build_object('status', 'paused'),
               jsonb_build_object('reason', 'Pruefung offen'))`,
      [aufbau.eintragId]);
    const uebersicht = await vendorPoolService.getVendorDashboard(client, aufbau.kundeOrg);
    assert.ok(uebersicht, "die Uebersicht liefert nichts");
    const letzte = uebersicht.recent_changes || uebersicht.recentChanges || [];
    assert.ok(letzte.some((c) => c.new_value === "paused"),
      "die Aenderung steht nicht in den letzten Aenderungen: " + JSON.stringify(letzte));
  });
});
