/**
 * Guthabenkauf am REALEN Schema — Befund P1-22.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIESE PROBE UNVERZICHTBAR IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Einmaligkeit der Gutschrift liegt in einem EINDEUTIGEN INDEX
 * (Migration 186). Ein Mock kennt keine Indizes — er bestaetigt jedes INSERT.
 *
 * Beim ersten Lauf hat genau das einen echten Fehler gefangen: die Gutschrift
 * lief ueber `earnCredits`, und diese Funktion erhoeht ZUERST den Saldo und
 * schreibt DANACH die Buchung. Der Index feuerte also erst, als das Guthaben
 * bereits oben war — eine wiederholte Webhook-Zustellung kam auf den DOPPELTEN
 * Stand. Die Mock-Tests waren dabei gruen.
 *
 * Repariert: die Buchung ist der ERSTE Schritt (sie traegt die Einmaligkeit),
 * und beides laeuft in EINER Transaktion.
 *
 * Stripe stellt Webhooks wiederholt zu — das ist die Zusicherung des Anbieters,
 * kein Sonderfall. Diese Probe ist damit keine Kuer, sondern der Nachweis fuer
 * den Normalbetrieb.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import * as credits from "../../services/creditService.js";

/* Bewusst OHNE `./helpers.js` — dessen `createPool` zieht den gesamten
   Express-Aufbau mit. Diese Probe ruft eine Dienstfunktion. */
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

describe("P1-22 — Guthabenkauf am realen Schema", { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {
  let pool;
  before(() => { pool = createPool(); });
  after(async () => { await pool?.end(); });

  it("zahlt, schreibt gut, und eine Wiederholung wirkt nicht doppelt", async () => {
    const db = await pool.connect();
    const maengel = [];
    const pruefe = (ok, text) => { if (!ok) maengel.push(text); };
    try {
      await db.query("BEGIN");
      let n = 0;
      const kappe = {
        query: async (...a) => {
          const marke = `sp${++n}`;
          await db.query(`SAVEPOINT ${marke}`);
          try { const r = await db.query(...a); await db.query(`RELEASE SAVEPOINT ${marke}`); return r; }
          catch (e) { await db.query(`ROLLBACK TO SAVEPOINT ${marke}`); throw e; }
        },
        /* `grantPurchasedPackage` laeuft in `withTransaction`. In der schon
           offenen Probe-Transaktion waere das ein verschachteltes BEGIN. */
        connect: async () => {
          let tiefe = 0;
          return {
            query: async (text, ...rest) => {
              const wort = String(text).trim().toUpperCase();
              if (wort.startsWith("BEGIN"))    { tiefe++; return db.query(`SAVEPOINT tx${tiefe}`); }
              if (wort.startsWith("COMMIT"))   { const t = tiefe--; return db.query(`RELEASE SAVEPOINT tx${t}`); }
              if (wort.startsWith("ROLLBACK")) { const t = tiefe--; return db.query(`ROLLBACK TO SAVEPOINT tx${t}`); }
              return db.query(text, ...rest);
            },
            release() {}
          };
        }
      };

    const marke = `p22-${process.pid}`;
    const { rows: [nutzer] } = await db.query(
      `INSERT INTO users (email, password_hash, role, company_name)
       VALUES ($1, 'x', 'company', 'P22') RETURNING id`, [`${marke}@example.test`]);
    const { rows: [paket] } = await db.query(
      `INSERT INTO credit_packages (name, credits, price_eur, bonus_pct, is_active)
       VALUES ($1, 500, 39.99, 10, TRUE) RETURNING id, credits, price_eur, bonus_pct`,
      [`Probe ${marke}`]);

    const stand = async () => {
      const { rows } = await db.query(
        "SELECT COALESCE(balance,0)::int b FROM credit_accounts WHERE user_id = $1", [nutzer.id]);
      return rows[0]?.b ?? 0;
    };

    /* ── Zu wenig gezahlt: nichts ────────────────────────────────────────── */
    const zuWenig = await credits.grantPurchasedPackage(kappe, {
      userId: nutzer.id, packageId: paket.id, referenz: `${marke}-a`, bezahltCent: 100 });
    pruefe(zuWenig.error === "AMOUNT_MISMATCH" && await stand() === 0,
      `P1-22: ein zu geringer Betrag schreibt nichts gut (Stand ${await stand()})`);

    /* ── Bezahlt: Gutschrift inklusive Bonus ─────────────────────────────── */
    const bezahlt = await credits.grantPurchasedPackage(kappe, {
      userId: nutzer.id, packageId: paket.id, referenz: `${marke}-b`, bezahltCent: 3999 });
    pruefe(bezahlt.ok && await stand() === 550,
      `P1-22: der bezahlte Kauf wird gutgeschrieben, 500 + 10% Bonus (Stand ${await stand()})`);

    /* ── Zweite Zustellung derselben Zahlung: keine Wirkung ──────────────── */
    const nochmal = await credits.grantPurchasedPackage(kappe, {
      userId: nutzer.id, packageId: paket.id, referenz: `${marke}-b`, bezahltCent: 3999 });
    pruefe(nochmal.ok && nochmal.bereits_gutgeschrieben === true && await stand() === 550,
      `P1-22: die WIEDERHOLTE Zustellung wirkt nicht doppelt (Stand ${await stand()}) — `
      + "der eindeutige Index aus Migration 186 haelt sie auf");

    /* ── Ein anderer Kauf desselben Pakets geht weiterhin ────────────────── */
    const zweiter = await credits.grantPurchasedPackage(kappe, {
      userId: nutzer.id, packageId: paket.id, referenz: `${marke}-c`, bezahltCent: 3999 });
    pruefe(zweiter.ok && !zweiter.bereits_gutgeschrieben && await stand() === 1100,
      `P1-22 Gegenprobe: ein ZWEITER Kauf wird gutgeschrieben (Stand ${await stand()}) — `
      + "die Einmaligkeit haengt an der Zahlung, nicht am Paket");

    /* ── Der Index steht wirklich ────────────────────────────────────────── */
    const { rows: idx } = await db.query(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'credit_transactions'
          AND indexname = 'credit_transactions_kauf_referenz_uniq'`);
    pruefe(!!idx[0] && /UNIQUE/.test(idx[0].indexdef) && /source = 'purchase'/.test(idx[0].indexdef),
      "P1-22: der eindeutige Index ist partiell auf `source = 'purchase'` beschraenkt");

    /* ── Andere Quellen duerfen ihre Referenz weiterhin wiederholen ──────── */
    await db.query(
      `INSERT INTO credit_transactions (user_id, amount, type, source, reference_id, description)
       VALUES ($1, 5, 'earned', 'bounty', $2, 'Probe A'), ($1, 5, 'earned', 'bounty', $2, 'Probe B')`,
      [nutzer.id, `${marke}-bounty`]);
    pruefe(true, "P1-22: `bounty` darf dieselbe Referenz mehrfach tragen — nur Kaeufe sind eindeutig");


      assert.deepStrictEqual(maengel, []);
    } finally {
      await db.query("ROLLBACK");
      db.release();
    }
  });
});
