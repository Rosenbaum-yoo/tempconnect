/**
 * P9 Spur A / Welle A1 — Wahrheitspruefung des Bounty-Katalogs.
 *
 * WARUM ES DIESEN TEST GIBT
 * A1 hat jede der 15 Bounty-Bedingungen gegen ihre Datenquelle geprueft. Der
 * Befundtyp war jedes Mal derselbe: die Bedingung rechnet korrekt, aber ihre
 * Eingabe entsteht nie oder traegt einen anderen Wert als erwartet. So ein
 * Defekt macht nichts rot — eine ausbleibende Wirkung hat keine Fehlermeldung.
 * Dieser Test haelt die vier Stellen fest, an denen A1 nachgebessert hat.
 *
 * Run: node --test --test-force-exit test/bountyKatalogWahrheit.test.js
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as bounty from "../services/bountyService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Pool, der jede Query mitschreibt und per SQL-Teilstring antwortet. */
function trackingPool(routes = []) {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    for (const r of routes) {
      const hit = r.match instanceof RegExp ? r.match.test(sql) : sql.includes(r.match);
      if (hit) {
        const rows = r.rows || [];
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  return { calls, query, connect: async () => ({ query, release: () => {} }) };
}

const findCall = (calls, needle) => calls.find((c) => c.sql.includes(needle));

describe("P9/A1 · Der Katalog hat einen Aus-Schalter", () => {
  it("prueft standardmaessig nur eingeschaltete Bounties", async () => {
    const pool = trackingPool();
    await bounty.getBountyCatalog(pool);
    assert.match(pool.calls[0].sql, /WHERE is_active/,
      "ohne Filter wuerde ein abgeschaltetes Bounty weiter bewertet und angezeigt");
  });

  it("kann den vollen Katalog auf Wunsch trotzdem liefern", async () => {
    const pool = trackingPool();
    await bounty.getBountyCatalog(pool, { includeInactive: true });
    assert.ok(!/WHERE is_active/.test(pool.calls[0].sql),
      "eine Verwaltungssicht muss auch die abgeschalteten sehen koennen");
  });

  it("ein abgeschaltetes Bounty gewaehrt keinen Rabatt mehr", async () => {
    const pool = trackingPool([{ match: "SUM(b.discount_pct)", rows: [{ total: 5 }] }]);
    await bounty.getUserDiscount(pool, "u1");
    const summe = findCall(pool.calls, "SUM(b.discount_pct)");
    assert.match(summe.sql, /b\.is_active/,
      "sonst laeuft der Rabatt weiter, obwohl das Bounty aus ist — der Schalter waere wirkungslos");
  });

  it("Migration 166 schaltet top_supplier ab statt es zu loeschen — mit Begruendung", () => {
    const datei = path.join(REPO_ROOT, "sql/migrations/166_bounty_schaltbarkeit.sql");
    assert.ok(fs.existsSync(datei), "Migration 166 fehlt");
    const sql = fs.readFileSync(datei, "utf8");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS is_active/);
    assert.match(sql, /is_active = FALSE[\s\S]*?WHERE key = 'top_supplier'/,
      "top_supplier misst reputation_score — eine Spalte, die kein Aufrufer je fuellt");
    assert.match(sql, /inactive_reason/,
      "ohne Begruendung ist spaeter nicht mehr unterscheidbar: Defekt oder Geschaeftsentscheidung");
    assert.ok(!/DELETE FROM bounties/.test(sql),
      "Loeschen wuerde die Historie in user_bounties per FK mitreissen");
  });
});

describe("P9/A1 · Fortschritt wird auch vor dem ersten Verdienen gespeichert", () => {
  it("legt fuer ein wiederkehrendes, nie verdientes Bounty eine Fortschrittszeile an", async () => {
    const katalog = [{
      id: "b-markt", key: "marketplace_active", sort_order: 1,
      threshold_type: "active_listings_6m", threshold_value: { min_listings: 5 },
      is_recurring: true, discount_pct: 2
    }];
    const pool = trackingPool([
      { match: "FROM bounties", rows: katalog },
      // 3 von 5 Kapazitaeten -> 60 % Fortschritt, aber noch nicht verdient.
      { match: "FROM capacity_posts", rows: [{ active: 3 }] }
    ]);

    await bounty.evaluateBounties(pool, "u1");

    const schreib = findCall(pool.calls, "user_bounties");
    assert.ok(schreib, "es wurde ueberhaupt nichts geschrieben");
    assert.match(schreib.sql, /INSERT INTO user_bounties/,
      "ein reines UPDATE trifft nichts, solange keine Zeile existiert — genau so blieben "
      + "nie verdiente wiederkehrende Bounties dauerhaft ohne gespeicherten Fortschritt");
    assert.match(schreib.sql, /ON CONFLICT \(user_id, bounty_id\) DO UPDATE/);
    assert.equal(schreib.params[2], 60, "60 % Fortschritt muessen ankommen, nicht 0");
    assert.ok(!/GREATEST/.test(schreib.sql),
      "ein eingefrorener Hoechststand wuerde Fortschritt behaupten, den es nicht mehr gibt");
  });
});

describe("P9/A1 · Beworbene Schwelle und geprueftes Ziel sind dieselbe Zahl", () => {
  it("Onboarding-Mentor verlangt die 3 aus dem Katalog, nicht den Default 5", async () => {
    const katalog = [{
      id: "b-mentor", key: "onboarding_mentor", sort_order: 1,
      threshold_type: "mentoring", threshold_value: { min_mentored: 3 },
      is_recurring: false, discount_pct: 2
    }];
    const pool = trackingPool([
      { match: "FROM bounties", rows: katalog },
      { match: "FROM mentoring_sessions", rows: [{ count: 3 }] }
    ]);

    const ergebnis = await bounty.evaluateBounties(pool, "u1");
    const mentor = ergebnis.find((r) => r.key === "onboarding_mentor");
    assert.equal(mentor.earned, true,
      "der Code las `min_sessions`; diesen Schluessel gibt es im Katalog nicht, "
      + "also griff still der Default 5 — beworben waren 3");
    assert.equal(mentor.progress, 100);
  });
});

describe("P9/A1 · Referral: geschriebener und gezaehlter Status sind derselbe", () => {
  const quelle = fs.readFileSync(
    path.join(REPO_ROOT, "api/services/referralProgramService.js"), "utf8"
  );
  // Von der Datenbank erlaubt (CHECK referrals_status_check).
  const ERLAUBT = ["pending", "registered", "survey_done", "active", "expired"];

  it("der Belohnungsschritt schreibt einen Status, den die Datenbank kennt", () => {
    const m = quelle.match(/UPDATE referrals SET status = '([a-z_]+)', reward_applied = TRUE/);
    assert.ok(m, "der Belohnungsschritt wurde nicht gefunden");
    assert.ok(ERLAUBT.includes(m[1]),
      `Status '${m[1]}' verletzt referrals_status_check — das UPDATE bricht ab, die Gutschrift `
      + `ist dann aber schon gebucht und reward_applied bleibt FALSE (Wiederholungssperre offen)`);
  });

  it("gezaehlt wird genau der Status, der auch geschrieben wird", () => {
    const geschrieben = quelle.match(/UPDATE referrals SET status = '([a-z_]+)', reward_applied = TRUE/)[1];
    const gezaehlt = quelle.match(/FROM referrals\s+WHERE referrer_id = \$1 AND status = '([a-z_]+)'/)[1];
    assert.equal(gezaehlt, geschrieben,
      "sonst zaehlt das Netzwerk-Builder-Bounty ein erfolgreich geworbenes Unternehmen als 0");
  });

  it("Gutschrift und Sperrvermerk laufen in einer Transaktion", () => {
    assert.match(quelle, /withTransaction\(pool, async \(client\) => \{[\s\S]*?INSERT INTO referral_rewards/,
      "getrennte Aufrufe koennen eine Gutschrift ohne gesetzte Sperre hinterlassen");
  });
});
