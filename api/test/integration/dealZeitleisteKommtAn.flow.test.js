/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z3 — DIE ZEITLEISTE EINES DEALS KOMMT AN, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `getDealProgress` las die Zeitleiste aus `state_transitions` — einer Tabelle,
 * die es nicht gibt — und filterte dabei auf `entity_type = 'DEAL'`, einen Wert,
 * den kein Schreiber je hinterlaesst (`stateMachine.logTransition` bildet `DEAL`
 * und `REQUEST` beide auf `'request'` ab). Zwei Fehler in EINER Abfrage.
 *
 * Und der Fehler war STUMM: der Wurf lief in ein catch mit `logger.debug`, die
 * Zeitleiste blieb `[]`. Ein Deal, der dreimal die Hand gewechselt hatte, sah
 * aus wie einer, bei dem nie etwas passiert ist.
 *
 * WARUM DIESE DATEI NOETIG IST, und das ist die Lehre der Welle: die
 * Muster-Pool-Proben in `dealProgressHelper.test.js` waren GRUEN. Sie lieferten
 * vorgefertigte Zeilen auf eine Abfrage, die in Wahrheit warf. Ein Muster-Pool
 * kann SQL nicht AUSFUEHREN — er beweist den Vertrag, nicht die Ausfuehrbarkeit.
 *
 * Gemessen wird in einer zurueckgerollten Transaktion an echten Audit-Zeilen:
 *   - die Abfrage laeuft und findet einen Wechsel wieder
 *   - DIE DOPPELSCHREIBUNG WIRD ENTDOPPELT: jeder Wechsel steht zweimal im Log
 *     (`state_machine.transition` UND `request.status_change`) — die Zeitleiste
 *     darf ihn genau einmal zeigen
 *   - mehrere Wechsel kommen in zeitlicher Reihenfolge
 *   - `timeline_available` sagt die Wahrheit
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15).
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/dealZeitleisteKommtAn.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as dealProgressHelper from "../../services/dealProgressHelper.js";

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

describe("Z3 — die Zeitleiste eines Deals, am realen Schema", () => {
  let pool;
  let client;
  let anfrage = null;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    /* Eine BESTEHENDE Anfrage nehmen, statt eine zu erfinden: so sind alle
       Fremdschluessel gueltig. Sie wird nicht veraendert — nur Audit-Zeilen
       kommen hinzu, und alles rollt zurueck. */
    const { rows } = await client.query(
      "SELECT id, status FROM requests ORDER BY created_at DESC LIMIT 1");
    anfrage = rows[0] || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && anfrage) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && anfrage) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  /* Schreibt den Wechsel so, wie ihn die beiden echten Schreiber schreiben:
     `stateMachine.logTransition` und `routes/requests.js` — also ZWEIMAL. */
  const wechselProtokollieren = async (von, nach, verschiebungSekunden = 0) => {
    for (const aktion of ["state_machine.transition", "request.status_change"]) {
      await client.query(
        /* Die Typen ausdruecklich besetzen: in `jsonb_build_object` kann Postgres
           den Typ eines Platzhalters nicht ableiten (42P18) — gelernt genau
           hier, beim ersten Lauf dieser Probe. */
        `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, details, created_at)
         VALUES ($1, 'request', $2, NULL,
                 jsonb_build_object('from', $3::text, 'to', $4::text),
                 NOW() + ($5::text || ' seconds')::interval)`,
        [aktion, anfrage.id, von, nach, String(verschiebungSekunden)]
      );
    }
  };

  it("es gibt eine Anfrage, an der sich das zeigen laesst", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anfrage) return t.skip("keine Anfrage im Bestand");
    assert.ok(anfrage.id);
  });

  it("die Abfrage LAEUFT und meldet sich als verfuegbar", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anfrage) return t.skip("kein Gegenstand");
    const stand = await dealProgressHelper.getDealProgress(client, anfrage.id);
    assert.ok(stand, "die Anfrage wird nicht gefunden");
    assert.equal(stand.timeline_available, true,
      "die Zeitleiste meldet sich als nicht ladbar — dann wirft die Abfrage weiterhin");
    assert.ok(Array.isArray(stand.timeline));
  });

  it("EIN Wechsel, ZWEIMAL protokolliert, steht GENAU EINMAL in der Zeitleiste", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anfrage) return t.skip("kein Gegenstand");
    const vorher = await dealProgressHelper.getDealProgress(client, anfrage.id);
    await wechselProtokollieren("SENT", "ACCEPTED");
    const nachher = await dealProgressHelper.getDealProgress(client, anfrage.id);

    const neu = nachher.timeline.filter((s) => s.from === "SENT" && s.to === "ACCEPTED");
    assert.equal(neu.length, 1,
      "der Wechsel steht " + neu.length + "x in der Zeitleiste. Beide Schreiber protokollieren "
      + "denselben Wechsel — ohne Entdopplung waere aus dem behobenen Fehler ein neuer geworden.");
    assert.equal(nachher.timeline.length, vorher.timeline.length + 1,
      "die Zeitleiste ist um mehr oder weniger als eine Station gewachsen");
    assert.equal(neu[0].label, "Angenommen",
      "die Station traegt keine lesbare Bezeichnung");
  });

  it("mehrere Wechsel kommen in zeitlicher Reihenfolge", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anfrage) return t.skip("kein Gegenstand");
    await wechselProtokollieren("SENT", "ACCEPTED", 0);
    await wechselProtokollieren("ACCEPTED", "FILLED", 60);
    await wechselProtokollieren("FILLED", "FINALIZED", 120);
    const stand = await dealProgressHelper.getDealProgress(client, anfrage.id);
    const kette = stand.timeline.filter((s) => ["ACCEPTED", "FILLED", "FINALIZED"].includes(s.to))
      .map((s) => s.to);
    assert.deepEqual(kette, ["ACCEPTED", "FILLED", "FINALIZED"],
      "die Stationen stehen nicht in der Reihenfolge, in der sie geschehen sind: " + JSON.stringify(kette));
  });

  it("ein Wechsel einer ANDEREN Anfrage taucht nicht auf", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!anfrage) return t.skip("kein Gegenstand");
    /* Die Gegenprobe. Ohne sie waere alles darueber auch dann gruen, wenn die
       Abfrage gar nicht an die Anfrage gebunden waere — und eine Zeitleiste, die
       fremde Wechsel zeigt, ist auf einer Deal-Seite ein Datenleck, nicht ein
       Anzeigefehler. */
    await client.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, actor_id, details)
       VALUES ('state_machine.transition', 'request', $1, NULL,
               jsonb_build_object('from', 'SENT', 'to', 'DECLINED'))`,
      ["00000000-0000-0000-0000-000000000099"]
    );
    const stand = await dealProgressHelper.getDealProgress(client, anfrage.id);
    assert.equal(stand.timeline.some((s) => s.to === "DECLINED"), false,
      "der Wechsel einer fremden Anfrage steht in dieser Zeitleiste");
  });

  it("`state_transitions` existiert weiterhin nicht — der Befund bleibt behoben", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'state_transitions'`);
    assert.deepEqual(rows, [],
      "die Tabelle ist aufgetaucht — dann gibt es zwei Zeitleisten, und die Frage ist, welche stimmt");
  });
});
