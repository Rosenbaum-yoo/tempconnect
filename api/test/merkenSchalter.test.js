/**
 * P9 Spur B / Welle B1 — aus dem Merken-Knopf wird ein Schalter.
 *
 * WAS VORHER WAR
 * Der Knopf schickte `interaction_type: "save"`, deaktivierte sich und beschriftete
 * sich um. Es gab kein Zurueck, kein Neuladen zeigte den Zustand, und auf
 * Bedarfs-Karten ging der Aufruf an den Kapazitaets-Endpunkt — 404, stumm
 * verschluckt. Ein Knopf, der aussieht, als haette er gewirkt.
 *
 * DIE FALLE, DIE DAS SCHLIMMSTE WAR
 * `createInteraction` entdoppelt ueber 10 Minuten. Fuer Ereignisse (Frage,
 * Kontakt) ist das richtig, fuer einen Schalter toedlich: merken, entfernen,
 * erneut merken haette den zweiten Klick verschluckt — der Schalter liesse sich
 * nicht wieder einschalten. Genau das prueft der DB-gestuetzte Teil unten.
 *
 * Run: node --test --test-force-exit test/merkenSchalter.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ce from "../services/capacityExchangeService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const r of routes) {
      const hit = r.match instanceof RegExp ? r.match.test(sql) : sql.includes(r.match);
      if (hit) {
        const rows = typeof r.rows === "function" ? r.rows({ sql, params }) : (r.rows || []);
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const findCall = (calls, needle) => calls.find((c) => c.sql.includes(needle));

/* ── 1. Genau ein Ziel ─────────────────────────────────────────────────── */

describe("P9/B1 · Eine Merkung hat genau ein Ziel", () => {
  it("weder Kapazitaet noch Bedarf wird abgewiesen", async () => {
    await assert.rejects(() => ce.merkeEintrag(trackingPool(), "u1", {}), /MERKEN_GENAU_EIN_ZIEL/);
    await assert.rejects(() => ce.entferneMerkung(trackingPool(), "u1", {}), /MERKEN_GENAU_EIN_ZIEL/);
  });

  it("beides gleichzeitig ebenfalls", async () => {
    await assert.rejects(
      () => ce.merkeEintrag(trackingPool(), "u1", { capacityPostId: "c1", demandRequestId: "d1" }),
      /MERKEN_GENAU_EIN_ZIEL/,
      "die Tabelle erzwingt das ohnehin (one_target_chk) — hier faellt es frueher und verstaendlicher auf"
    );
  });
});

/* ── 2. Setzen ist idempotent, Entfernen ist eigenbezogen ──────────────── */

describe("P9/B1 · Setzen und Entfernen", () => {
  it("Merken laeuft ueber ON CONFLICT, nicht ueber ein Zeitfenster", async () => {
    const pool = trackingPool([{ match: "INSERT INTO capacity_interactions", rows: [{ id: "i1" }] }]);
    const r = await ce.merkeEintrag(pool, "u1", { capacityPostId: "c1" });

    assert.deepEqual(r, { gemerkt: true, neu: true });
    const ins = findCall(pool.calls, "INSERT INTO capacity_interactions");
    assert.match(ins.sql, /ON CONFLICT DO NOTHING/,
      "ohne das waere ein zweites Merken ein Fehler statt folgenlos");
    assert.ok(!/INTERVAL '10 minutes'/.test(ins.sql),
      "die Zeit-Entdopplung gehoert zu Ereignissen, nicht zu einem Zustand — sie wuerde "
      + "ein erneutes Merken kurz nach dem Entfernen verschlucken");
  });

  it("ein bereits gemerkter Eintrag ist kein Fehler", async () => {
    const pool = trackingPool([{ match: "INSERT INTO capacity_interactions", rows: [], rowCount: 0 }]);
    const r = await ce.merkeEintrag(pool, "u1", { capacityPostId: "c1" });
    assert.deepEqual(r, { gemerkt: true, neu: false },
      "der gewuenschte Zustand ist erreicht — das ist ein Erfolg");
  });

  it("Entfernen trifft nur die eigene Merkung", async () => {
    const pool = trackingPool([{ match: "DELETE FROM capacity_interactions", rows: [], rowCount: 1 }]);
    const r = await ce.entferneMerkung(pool, "u1", { demandRequestId: "d1" });

    assert.deepEqual(r, { gemerkt: false, entfernt: true });
    const del = findCall(pool.calls, "DELETE FROM capacity_interactions");
    assert.match(del.sql, /company_user_id = \$3/,
      "ohne diese Bedingung koennte jemand fremde Merklisten leeren");
    assert.match(del.sql, /interaction_type = 'save'/,
      "andere Interaktionen (Frage, Kontakt) sind Historie und duerfen nicht mitgeloescht werden");
    assert.match(del.sql, /IS NOT DISTINCT FROM/,
      "NULL-sicher: ein Bedarfsziel hat capacity_post_id = NULL");
  });

  it("nichts zu entfernen ist auch ein Erfolg", async () => {
    const pool = trackingPool([{ match: "DELETE FROM capacity_interactions", rows: [], rowCount: 0 }]);
    const r = await ce.entferneMerkung(pool, "u1", { capacityPostId: "c1" });
    assert.deepEqual(r, { gemerkt: false, entfernt: false });
  });
});

/* ── 3. Der bestehende Speicherweg bleibt der Speicherweg ──────────────── */

describe("P9/B1 · `save` laeuft weiter ueber die bestehende Interaktion", () => {
  it("createInteraction leitet 'save' auf den Zustands-Pfad um", async () => {
    const pool = trackingPool([
      { match: "INSERT INTO capacity_interactions", rows: [{ id: "i1" }] },
      { match: "SELECT * FROM capacity_interactions", rows: [{ id: "i1", interaction_type: "save" }] }
    ]);
    const r = await ce.createInteraction(pool, "c1", "u1", { interaction_type: "save" });
    assert.equal(r.interaction_type, "save");
    assert.ok(!/INTERVAL '10 minutes'/.test(findCall(pool.calls, "INSERT INTO capacity_interactions").sql));
  });

  it("andere Interaktionstypen behalten ihre Zeit-Entdopplung", async () => {
    const pool = trackingPool([{ match: "INSERT INTO capacity_interactions", rows: [{ id: "i2" }] }]);
    await ce.createInteraction(pool, "c1", "u1", { interaction_type: "question", message: "Frage?" });
    assert.match(findCall(pool.calls, "INSERT INTO capacity_interactions").sql, /INTERVAL '10 minutes'/,
      "eine doppelt abgeschickte Frage soll weiterhin nicht zweimal ankommen");
  });

  it("auch Bedarfe koennen gemerkt werden", async () => {
    const pool = trackingPool([
      { match: "INSERT INTO capacity_interactions", rows: [{ id: "i3" }] },
      { match: "SELECT * FROM capacity_interactions", rows: [{ id: "i3", interaction_type: "save" }] }
    ]);
    const r = await ce.createDemandInteraction(pool, "d1", "u1", { interaction_type: "save" });
    assert.ok(r, "auf Bedarfs-Karten lief der Knopf vorher ins Leere");
  });
});

/* ── 4. Der Feed liefert den Zustand mit ───────────────────────────────── */

describe("P9/B1 · Der Zustand kommt aus derselben Abfrage", () => {
  const quelle = fs.readFileSync(
    path.join(__dirname, "..", "services", "capacityExchangeService.js"), "utf8"
  );

  it("Kapazitaeten und Bedarfe tragen beide ein `gemerkt`", () => {
    assert.match(quelle, /\$\{supplyGemerkt\} AS gemerkt/,
      "sonst kennt die Karte ihren Zustand nach dem Neuladen nicht");
    assert.match(quelle, /ci_merk\.demand_request_id = dr\.id[\s\S]{0,200}AS gemerkt/,
      "die Gegenseite darf nicht vergessen werden — sonst merkt nur eine Marktseite");
  });

  it("keine Abfrage je Karte", async () => {
    // 50 Karten duerfen nicht 50 Nachschlaege ausloesen. Gezaehlt wird, wie oft
    // ueberhaupt auf `capacity_interactions` zugegriffen wird: der Merk-Zustand
    // faehrt in der Feed-Abfrage mit, nicht daneben.
    const karten = Array.from({ length: 50 }, (_, i) => ({
      id: `c${i}`, supplier_company_id: "s1", status: "active", feed_type: "supply", gemerkt: false
    }));
    const pool = trackingPool([
      { match: "COUNT(*)::int AS cnt", rows: [{ cnt: 50 }] },
      { match: "AS gemerkt", rows: karten }
    ]);

    await ce.browseFeed(pool, { viewer_user_id: "u1", viewer_role: "company", limit: 50 });

    const merkAbfragen = pool.calls.filter(
      (c) => /FROM capacity_interactions/.test(c.sql) && !/AS gemerkt/.test(c.sql)
    );
    assert.ok(merkAbfragen.length <= 1,
      `${merkAbfragen.length} zusaetzliche Abfragen auf capacity_interactions — `
      + "der Merk-Zustand gehoert in die Feed-Abfrage");
  });
});

/* ── 5. Am echten Bestand ──────────────────────────────────────────────── */

describe("P9/B1 · Der Schalter schaltet wirklich",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("merken, entfernen, sofort erneut merken — genau die 10-Minuten-Falle", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [post] } = await client.query("SELECT id FROM capacity_posts LIMIT 1");
      const { rows: [nutzer] } = await client.query(
        `SELECT id FROM users
          WHERE id NOT IN (SELECT company_user_id FROM capacity_interactions
                            WHERE interaction_type = 'save' AND capacity_post_id = $1)
          LIMIT 1`, [post?.id || null]
      );
      if (!post || !nutzer) { await client.query("ROLLBACK"); return; }

      const zaehle = async () => Number((await client.query(
        `SELECT COUNT(*)::int AS n FROM capacity_interactions
          WHERE capacity_post_id = $1 AND company_user_id = $2 AND interaction_type = 'save'`,
        [post.id, nutzer.id]
      )).rows[0].n);

      await ce.merkeEintrag(client, nutzer.id, { capacityPostId: post.id });
      assert.equal(await zaehle(), 1, "merken");

      await ce.merkeEintrag(client, nutzer.id, { capacityPostId: post.id });
      assert.equal(await zaehle(), 1, "zweimal merken bleibt einmal gemerkt");

      const weg = await ce.entferneMerkung(client, nutzer.id, { capacityPostId: post.id });
      assert.equal(weg.entfernt, true);
      assert.equal(await zaehle(), 0, "entfernen");

      // Ohne Migration 172 haette die 10-Minuten-Entdopplung hier verschluckt.
      await ce.merkeEintrag(client, nutzer.id, { capacityPostId: post.id });
      assert.equal(await zaehle(), 1,
        "sofortiges erneutes Merken muss wirken — sonst ist der Schalter kaputt");

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("niemand kann fremde Merkungen entfernen", async () => {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [post] } = await client.query("SELECT id FROM capacity_posts LIMIT 1");
      const { rows: nutzer } = await client.query("SELECT id FROM users LIMIT 2");
      if (!post || nutzer.length < 2) { await client.query("ROLLBACK"); return; }
      const [a, b] = nutzer;

      await client.query(
        `DELETE FROM capacity_interactions
          WHERE capacity_post_id = $1 AND interaction_type = 'save' AND company_user_id IN ($2,$3)`,
        [post.id, a.id, b.id]
      );
      await ce.merkeEintrag(client, a.id, { capacityPostId: post.id });

      const fremd = await ce.entferneMerkung(client, b.id, { capacityPostId: post.id });
      assert.equal(fremd.entfernt, false, "B darf die Merkung von A nicht entfernen");

      const { rows: [uebrig] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM capacity_interactions
          WHERE capacity_post_id = $1 AND company_user_id = $2 AND interaction_type = 'save'`,
        [post.id, a.id]
      );
      assert.equal(uebrig.n, 1, "die Merkung von A steht noch");

      await client.query("ROLLBACK");
    } finally {
      client.release();
      await pool.end();
    }
  });
});

/* ── 6. Migration ──────────────────────────────────────────────────────── */

/*
 * Im API-Container ist nur `api/` gemountet — `sql/` gibt es dort nicht. Ohne
 * diese Weiche meldet die Suite dort einen Fehler, der nach einer fehlenden
 * Migration aussieht, obwohl nur die Datei nicht sichtbar ist.
 */
const MIGRATION = path.join(REPO_ROOT, "sql/migrations/172_merken_ist_ein_zustand.sql");
const migrationLesbar = fs.existsSync(MIGRATION);

describe("P9/B1 · Migration 172",
  { skip: !migrationLesbar && "sql/ nicht verfuegbar (API-Container)" }, () => {
  it("legt fuer beide Ziele einen eindeutigen Schluessel an", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    assert.match(sql, /capacity_interactions_merken_kapazitaet_idx/);
    assert.match(sql, /capacity_interactions_merken_bedarf_idx/);
    assert.match(sql, /WHERE interaction_type = 'save'/,
      "der Index muss partiell sein — andere Interaktionen duerfen sich wiederholen");
    assert.match(sql, /DELETE FROM capacity_interactions a/,
      "ohne Entdopplung koennte der Index auf einer Bestandsdatenbank nicht angelegt werden");
  });
});
