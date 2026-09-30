/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Z1 — PASSWORT ZURUECKSETZEN KANN WIRKEN, AM REALEN SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `users.reset_token` und `users.reset_token_expires` existierten nicht
 * (gemessen am 2026-09-27: 0 Treffer in information_schema). Der KOMPLETTE
 * Ablauf warf — von der Mail, die korrekt verschickt wird, bis zum Klick, der in
 * einer 500 endet. Wer sein Passwort vergisst, kommt nicht zurueck und meldet es
 * nicht; er geht.
 *
 * WARUM DIE VORHANDENEN PROBEN DAS NICHT GEFANGEN HABEN, und das ist die Lehre:
 * `authService.test.js` prueft, dass der SQL-TEXT `reset_token` enthaelt, gegen
 * einen Muster-Pool, der jede Abfrage annimmt. Die Zusicherung war richtig und
 * hat nichts verhindert — sie konnte die Abfrage nicht AUSFUEHREN. Genau dafuer
 * gibt es `sqlSchemaWaechter` (der den Fall auch gefuehrt hat) und diese Probe.
 *
 * Gemessen wird der ganze Zyklus in einer zurueckgerollten Transaktion:
 * setzen -> pruefen -> zuruecksetzen -> verbraucht -> abgelaufen.
 *
 * Der Uebersprung ohne Datenbank ist SICHTBAR (Lehre aus M4c.15).
 *
 * Lauf: DATABASE_URL=postgres://… node --test test/integration/passwortZuruecksetzen.flow.test.js
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as authService from "../../services/authService.js";

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

describe("Z1 — Passwort zuruecksetzen, am realen Schema", () => {
  let pool;
  let client;
  let nutzer = null;

  before(async () => {
    if (!hasDb) return;
    pool = createPool();
    client = await pool.connect();
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id, email, password_hash FROM users WHERE email IS NOT NULL LIMIT 1");
    nutzer = rows[0] || null;
  });

  after(async () => {
    try { await client?.query("ROLLBACK"); } finally {
      client?.release();
      await pool?.end();
    }
  });

  beforeEach(async () => { if (hasDb && nutzer) await client.query("SAVEPOINT probe"); });
  afterEach(async () => { if (hasDb && nutzer) await client.query("ROLLBACK TO SAVEPOINT probe"); });

  const TOKEN = "z1-probe-token-0123456789abcdef";
  const inEinerStunde = () => new Date(Date.now() + 60 * 60 * 1000);

  it("es gibt einen Nutzer, an dem sich das zeigen laesst", (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Nutzer mit E-Mail im Bestand");
    assert.ok(nutzer.id);
  });

  it("das Token laesst sich SETZEN — vorher warf genau das", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    await authService.setResetToken(client, nutzer.id, TOKEN, inEinerStunde());
    const { rows } = await client.query(
      "SELECT reset_token, reset_token_expires FROM users WHERE id = $1", [nutzer.id]);
    assert.equal(rows[0].reset_token, TOKEN, "das Token steht nicht am Konto");
    assert.ok(rows[0].reset_token_expires > new Date(), "der Verfall liegt nicht in der Zukunft");
  });

  it("ein gueltiges Token findet genau seinen Nutzer", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    await authService.setResetToken(client, nutzer.id, TOKEN, inEinerStunde());
    const gefunden = await authService.validateResetToken(client, TOKEN);
    assert.ok(gefunden, "das gesetzte Token wird nicht wiedergefunden");
    assert.equal(gefunden.id, nutzer.id, "es wird ein anderer Nutzer gefunden");
  });

  it("ein erfundenes Token findet niemanden", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    /* Die Gegenprobe. Ohne sie waere alles darueber leer gruen, wenn die Abfrage
       jeden Nutzer liefern wuerde. */
    await authService.setResetToken(client, nutzer.id, TOKEN, inEinerStunde());
    assert.equal(await authService.validateResetToken(client, "gibt-es-nicht"), null,
      "ein erfundenes Token findet einen Nutzer — dann ist das Token keine Schranke");
  });

  it("ein ABGELAUFENES Token findet niemanden", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    /* Die Frist ist der Kern eines Einmal-Tokens. Ohne sie waere eine alte Mail
       im Postfach ein dauerhafter Schluessel zum Konto. */
    await authService.setResetToken(client, nutzer.id, TOKEN, new Date(Date.now() - 1000));
    assert.equal(await authService.validateResetToken(client, TOKEN), null,
      "ein abgelaufenes Token gilt weiter");
  });

  it("nach dem Zuruecksetzen ist das Token VERBRAUCHT und das Passwort neu", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    if (!nutzer) return t.skip("kein Gegenstand");
    await authService.setResetToken(client, nutzer.id, TOKEN, inEinerStunde());
    await authService.resetPassword(client, nutzer.id, "neuer-hash-z1");

    const { rows } = await client.query(
      "SELECT password_hash, reset_token, reset_token_expires FROM users WHERE id = $1", [nutzer.id]);
    assert.equal(rows[0].password_hash, "neuer-hash-z1", "das Passwort wurde nicht gesetzt");
    assert.equal(rows[0].reset_token, null,
      "das Token bleibt stehen — dann ist es kein Einmal-Token, sondern ein Dauerschluessel");
    assert.equal(rows[0].reset_token_expires, null, "der Verfall bleibt stehen");
    assert.equal(await authService.validateResetToken(client, TOKEN), null,
      "dasselbe Token laesst sich ein zweites Mal einloesen");
  });

  it("der Index steht — sonst durchsucht jeder Versuch die ganze Nutzertabelle", async (t) => {
    if (!hasDb) return t.skip("Keine Datenbank konfiguriert");
    /* `verification_token` hat keinen Index; das ist dort ein Mangel und hier
       kein Vorbild. Ohne Index ist jeder Reset-Versuch ein vollstaendiger
       Durchlauf — das Muster "laeuft bei 10, bricht bei 300". */
    const { rows } = await client.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'users' AND indexname = 'users_reset_token_idx'`);
    assert.equal(rows.length, 1, "der Index auf reset_token fehlt");
    assert.match(rows[0].indexdef, /WHERE \(reset_token IS NOT NULL\)/,
      "der Index ist nicht teilweise — dann traegt er jede Zeile ohne offenen Reset mit");
  });
});
