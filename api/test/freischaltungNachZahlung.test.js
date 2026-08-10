/**
 * P9 Spur C / Welle C2 — nach der Zahlung genau ein gueltiger Zustand.
 *
 * OWNER-ENTSCHEIDUNG C-E1 (2026-08-09): Freischaltung erfolgt AUTOMATISCH nach
 * bezahlter Abwicklung, ohne Freigabe im Staff-Center. Der Betreiber-Kill-Switch
 * (`access_suspended_at`) bleibt davon unberuehrt.
 *
 * DER DEFEKT, DEN DIESE WELLE GEFUNDEN HAT
 * `activatePlan` hat bei jeder Planaenderung nur EINGEFUEGT. Die alte Zeile blieb
 * auf 'active': im Bestand 341 Zeilen fuer 312 Nutzer. Sichtbar war nichts — die
 * Plan-Aufloesung nimmt ueberall die neueste Zeile. Die monatliche Folgerechnung
 * waehlt aber nach `status = 'active'` und haette 290 Zeilen bei 263 Nutzern
 * aufgegriffen: 27 Kunden mit ZWEI Rechnungen fuer denselben Monat. Ein Fehler,
 * den erst der erste echte Abrechnungslauf gezeigt haette — beim Kunden.
 *
 * Run: node --test --test-force-exit test/freischaltungNachZahlung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activatePlan } from "../services/paymentService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

function trackingPool() {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const findCall = (calls, needle) => calls.find((c) => c.sql.includes(needle));

/* ── 1. Der Ablauf ─────────────────────────────────────────────────────── */

describe("P9/C2 · Die Freischaltung schliesst das alte Abo", () => {
  it("erst schliessen, dann anlegen — und zwar in dieser Reihenfolge", async () => {
    const pool = trackingPool();
    await activatePlan(pool, "u1", "PRO");

    const zu = findCall(pool.calls, "UPDATE subscriptions");
    const neu = findCall(pool.calls, "INSERT INTO subscriptions");
    assert.ok(zu, "das bestehende Abo wird nicht geschlossen — es blieben zwei aktive Zeilen");
    assert.ok(neu, "es wird kein neues Abo angelegt");
    assert.ok(pool.calls.indexOf(zu) < pool.calls.indexOf(neu),
      "andersherum verletzte der INSERT den eindeutigen Index aus Migration 173");
  });

  it("laeuft in einer Transaktion", async () => {
    const pool = trackingPool();
    await activatePlan(pool, "u1", "PRO");
    assert.ok(findCall(pool.calls, "BEGIN"),
      "bricht es dazwischen ab, stuende der Kunde ohne aktives Abo da — nach bezahlter Rechnung");
  });

  it("schliesst auch ueberfaellige und gekuendigte Abos", async () => {
    const pool = trackingPool();
    await activatePlan(pool, "u1", "PLUS");
    const zu = findCall(pool.calls, "UPDATE subscriptions");
    assert.match(zu.sql, /IN \('active', 'past_due', 'canceling'\)/,
      "ein past_due-Abo daneben wuerde weiter angemahnt, obwohl der Kunde neu bezahlt hat");
    assert.match(zu.sql, /cancel_source = COALESCE\(cancel_source, 'plan_replaced'\)/,
      "ohne Grund ist spaeter nicht erkennbar, warum das Abo endete");
  });

  it("die Plan-Normalisierung bleibt unveraendert", async () => {
    for (const [eingabe, erwartet] of [
      ["DEMO", "FREE"], ["ENTERPRISE", "INDIVIDUELL"], ["INDIVIDUAL", "INDIVIDUELL"], ["pro", "PRO"]
    ]) {
      const pool = trackingPool();
      await activatePlan(pool, "u1", eingabe);
      assert.equal(findCall(pool.calls, "INSERT INTO subscriptions").params[1], erwartet);
    }
  });

  it("bezahlte Plaene laufen einen Monat, freie zwei Wochen", async () => {
    const bezahlt = trackingPool();
    await activatePlan(bezahlt, "u1", "PRO");
    assert.match(findCall(bezahlt.calls, "INSERT INTO subscriptions").sql, /INTERVAL '1 month'/);

    const frei = trackingPool();
    await activatePlan(frei, "u1", "DEMO");
    assert.match(findCall(frei.calls, "INSERT INTO subscriptions").sql, /INTERVAL '14 days'/);
  });
});

/* ── 2. Kein zweiter Weg an der Regel vorbei ───────────────────────────── */

describe("P9/C2 · Alle Wege benutzen dieselbe Freischaltung", () => {
  it("der Pilotpfad legt kein eigenes Abo mehr an", () => {
    const quelle = fs.readFileSync(
      path.join(__dirname, "..", "services", "pilotPolicyService.js"), "utf8"
    );
    assert.ok(!/INSERT INTO subscriptions/.test(quelle),
      "eine zweite Kopie der Logik erzeugt genau die Dubletten, die C2 beseitigt");
    assert.match(quelle, /activatePlan\(pool,/,
      "der Pilotpfad muss denselben Weg gehen");
  });

  it("die Registrierungspfade brechen nicht an der neuen Regel", () => {
    // Diese vier legen fuer NEUE Nutzer ein DEMO-Abo an. Bei einer
    // Wiederanlage (SSO/SCIM) gaebe es sonst einen harten Fehler statt eines
    // Nichtstuns.
    for (const datei of ["authService.js", "userService.js", "ssoService.js", "scimService.js"]) {
      const quelle = fs.readFileSync(path.join(__dirname, "..", "services", datei), "utf8");
      assert.match(quelle, /ON CONFLICT \(user_id\) WHERE status = 'active' DO NOTHING/,
        `${datei} kann am eindeutigen Index scheitern`);
    }
  });
});

/* ── 3. Am echten Bestand ──────────────────────────────────────────────── */

describe("P9/C2 · Zweimal freischalten hinterlaesst ein Abo",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("nach zwei Zahlungen ist genau ein Abo aktiv — und der Rechnungslauf sieht es einmal", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [u] } = await client.query("SELECT id FROM users LIMIT 1");
      if (!u) { await client.query("ROLLBACK"); return; }

      const aktive = async () => Number((await client.query(
        "SELECT COUNT(*)::int AS n FROM subscriptions WHERE user_id = $1 AND status = 'active'", [u.id]
      )).rows[0].n);

      await activatePlan(client, u.id, "BASIS");
      assert.equal(await aktive(), 1, "nach der ersten Zahlung");

      await activatePlan(client, u.id, "PRO");
      assert.equal(await aktive(), 1,
        "nach der zweiten Zahlung — vorher waeren es zwei gewesen, und der "
        + "Rechnungslauf haette beide abgerechnet");

      const { rows: [plan] } = await client.query(
        `SELECT plan FROM subscriptions WHERE user_id = $1 AND status = 'active'`, [u.id]
      );
      assert.equal(plan.plan, "PRO", "der zuletzt bezahlte Plan gilt");

      // Genau die Auswahl, die der monatliche Rechnungslauf trifft.
      const { rows: [faellig] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM subscriptions
          WHERE user_id = $1 AND status = 'active' AND trial_mode = FALSE AND plan <> 'DEMO'`,
        [u.id]
      );
      assert.equal(faellig.n, 1, "eine Rechnung je Kunde und Monat");

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("der eindeutige Index existiert und greift", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [vorhanden] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM pg_indexes
          WHERE indexname = 'subscriptions_ein_aktives_je_nutzer_idx'`
      );
      assert.equal(vorhanden.n, 1, "Migration 173 nicht eingespielt");

      const { rows: [mit] } = await client.query(
        "SELECT user_id FROM subscriptions WHERE status = 'active' LIMIT 1"
      );
      if (!mit) { await client.query("ROLLBACK"); return; }

      await assert.rejects(
        () => client.query(
          `INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end)
           VALUES ($1, 'PLUS', 'active', NOW(), NOW() + INTERVAL '1 month')`, [mit.user_id]
        ),
        /subscriptions_ein_aktives_je_nutzer_idx/,
        "ein zweites aktives Abo muss die Datenbank ablehnen — sonst kann jeder "
        + "kuenftige Schreibpfad die Doppelrechnung wieder einfuehren"
      );

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });
});

/* ── 4. Migration ──────────────────────────────────────────────────────── */

const MIGRATION = path.join(REPO_ROOT, "sql/migrations/173_ein_aktives_abo_je_nutzer.sql");
describe("P9/C2 · Migration 173",
  { skip: !fs.existsSync(MIGRATION) && "sql/ nicht verfuegbar (API-Container)" }, () => {
  it("bereinigt den Bestand und sichert die Regel", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    assert.match(sql, /CREATE UNIQUE INDEX[\s\S]{0,200}WHERE status = 'active'/);
    assert.match(sql, /ORDER BY s2\.created_at DESC/,
      "es muss dieselbe Regel gelten wie in der Anwendung: die neueste Zeile gewinnt — "
      + "sonst aendert die Bereinigung Kunden still den Plan");
    assert.ok(!/DELETE FROM subscriptions/.test(sql),
      "die Historie wird geschlossen, nicht geloescht");
  });
});
