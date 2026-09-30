/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.12 — DER ANSTOSS ZUR FREIGABE KOMMT AN, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `test/meldungKommtAn.test.js` haelt ohne Datenbank fest, dass jeder Typ der
 * Matrix in der Positivliste steht. Was es nicht kann, ist die Meldung
 * ENTSTEHEN LASSEN — und genau dort lag der Befund: der INSERT scheiterte mit
 * 23514, und der Aufrufer schluckt den Fehler bewusst (die Faehigkeiten sind
 * gespeichert, eine gescheiterte Meldung darf das nicht gefaehrden).
 *
 * Diese Probe schreibt eine Benachrichtigung dieses Typs in einer Transaktion,
 * die zurueckgerollt wird. Vor Migration 221 scheiterte sie mit 23514; jetzt
 * steht die Zeile. Das ist der Unterschied zwischen "der Typ ist in einer Liste
 * eingetragen" und "die Meldung erreicht einen Menschen".
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15): jede Probe
 * ueberspringt sich selbst, statt als `tests 0` zu verschwinden.
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/freigabeMeldungKommtAn.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { getMatrix } from "../../services/notificationMatrix.js";

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

describe("M4c.12 — der Anstoss zur Freigabe kommt an, am realen Schema", () => {
  let pool;
  let client;
  let nutzer = null;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id FROM users LIMIT 1");
    nutzer = rows[0]?.id || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && nutzer) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && nutzer) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  /** Schreibt eine Benachrichtigung, wie `dispatch` es tut. */
  const melden = (typ, stufe = "info") => client.query(
    `INSERT INTO notifications (user_id, type, severity, title)
     VALUES ($1, $2, $3, 'Probe M4c.12') RETURNING id`,
    [nutzer, typ, stufe]);

  it("es gibt einen Nutzer, an den gemeldet werden kann", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Nutzer im Bestand");
    assert.ok(nutzer);
  });

  it("die Meldung zur offenen Freigabe entsteht — vorher scheiterte sie mit 23514", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    const typ = getMatrix()["worker.skills_awaiting_release"]?.type;
    assert.equal(typ, "worker_marktpraesenz", "die Matrix fuehrt einen anderen Typ");
    const { rows } = await melden(typ);
    assert.ok(rows[0]?.id,
      "die Benachrichtigung entsteht nicht — dann erfaehrt die Zeitarbeitsfirma nie, "
      + "dass es etwas freizugeben gibt, und die Kraft bleibt am Markt unsichtbar");
  });

  it("JEDER Typ der Matrix laesst sich wirklich schreiben", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    /*
     * Der entdeckende Teil, und er geht weiter als die statische Probe: dort
     * wird die Positivliste aus den MIGRATIONEN rekonstruiert, hier fragt die
     * DATENBANK selbst. Weichen die beiden ab — eine Migration, die nie lief,
     * ein von Hand gesetzter CHECK —, sagt es nur diese Probe.
     */
    const typen = [...new Set(Object.values(getMatrix())
      .map((cfg) => cfg?.type).filter((t2) => typeof t2 === "string"))];
    assert.ok(typen.length >= 35, `nur ${typen.length} Typen in der Matrix gefunden`);
    const abgewiesen = [];
    for (const typ of typen) {
      await client.query("SAVEPOINT einzeln");
      try {
        await melden(typ);
      } catch (e) {
        abgewiesen.push(`${typ} (${e.code})`);
        await client.query("ROLLBACK TO SAVEPOINT einzeln");
      }
    }
    assert.deepEqual(abgewiesen, [],
      "Diese Typen weist die Datenbank ab — ihre Meldungen entstehen NIE, und der "
      + "Aufrufer schluckt den Fehler:\n  " + abgewiesen.join("\n  "));
  });

  it("JEDE Dringlichkeit der Matrix laesst sich wirklich schreiben", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    /* Der Fall aus Welle G4b: vier Notdienst-Eintraege trugen 'urgent', und
       ausgerechnet der dringlichste Fall der Plattform kam nie an. */
    const stufen = [...new Set(Object.values(getMatrix())
      .map((cfg) => cfg?.severity).filter(Boolean))];
    const abgewiesen = [];
    for (const stufe of stufen) {
      await client.query("SAVEPOINT einzeln");
      try {
        await melden("worker_marktpraesenz", stufe);
      } catch (e) {
        abgewiesen.push(`${stufe} (${e.code})`);
        await client.query("ROLLBACK TO SAVEPOINT einzeln");
      }
    }
    assert.deepEqual(abgewiesen, [],
      "Diese Dringlichkeiten weist die Datenbank ab:\n  " + abgewiesen.join("\n  "));
  });

  it("ein erfundener Typ wird sehr wohl abgewiesen — die Probe hat einen Gegenstand", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    /*
     * Die Gegenprobe, ohne die alles darueber leer gruen sein koennte: waere der
     * CHECK versehentlich entfernt, gingen ALLE Typen durch — auch die
     * erfundenen — und die Proben darueber saehen bestanden aus, obwohl die
     * Positivliste gar nicht mehr existiert.
     */
    await client.query("SAVEPOINT erfunden");
    await assert.rejects(
      melden("gibt_es_garantiert_nicht"),
      (e) => e.code === "23514",
      "ein erfundener Typ wird angenommen — der CHECK auf notifications.type fehlt");
    await client.query("ROLLBACK TO SAVEPOINT erfunden");
  });
});
