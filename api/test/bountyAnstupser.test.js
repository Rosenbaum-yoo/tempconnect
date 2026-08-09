/**
 * P9 Spur A / Welle A5 — selbstlaufende Anstupser zum Bounty-Status.
 *
 * WARUM ES DIESEN TEST GIBT
 * Ein Anstupser hat zwei Arten zu versagen, und beide sind still: er kommt gar
 * nicht (Typ fehlt im CHECK oder in der Surface-Map — die Lehre aus Mig 139), oder
 * er kommt zu oft (kein Gedaechtnis, jeder Lauf schickt dieselbe Nachricht neu).
 * Das zweite merkt der Nutzer sofort und meldet sich ab; das erste merkt niemand.
 *
 * Geprueft wird deshalb beides: die Regel, WANN angestupst wird (reine Funktionen,
 * ohne Datenbank), und die Zustellung mit Gedaechtnis und Wochenlimit.
 *
 * Run: node --test --test-force-exit test/bountyAnstupser.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isoWocheDE, bestimmeAnstupser, formuliere, stupseNutzerAn,
  NAH_AB_PROZENT, MAX_MAILS_JE_WOCHE, MAIL_ANLAESSE
} from "../services/bountyNudgeService.js";

/* ── Attrappe ──────────────────────────────────────────────────────────── */

function anstupsPool({ katalog = [], vorher = [], userCreatedAt = "2020-01-01", mailsSchon = 0 } = {}) {
  const calls = [];
  const gemerkt = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("SELECT * FROM bounties")) return { rows: katalog, rowCount: katalog.length };
    if (sql.includes("FROM user_bounties ub")) return { rows: vorher, rowCount: vorher.length };
    if (sql.includes("created_at, is_verified FROM users")) {
      return { rows: [{ created_at: userCreatedAt, is_verified: true }], rowCount: 1 };
    }
    if (sql.includes("FROM bounty_nudges") && sql.includes("COUNT")) {
      return { rows: [{ n: mailsSchon }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO bounty_nudges")) {
      const schluessel = params.join("|");
      if (gemerkt.includes(schluessel)) return { rows: [], rowCount: 0 };  // ON CONFLICT DO NOTHING
      gemerkt.push(schluessel);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO notifications")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  return { calls, gemerkt, query, connect: async () => ({ query, release: () => {} }) };
}

const GRUENDER = {
  id: "b-gruender", key: "founding_member", name_de: "Gruendungsmitglied",
  description_de: "Registrierung im ersten Jahr", category: "loyalty", icon: "*",
  discount_pct: 3, threshold_type: "registration_before",
  threshold_value: { before: "2027-01-01" }, is_recurring: false, is_active: true,
  sort_order: 1, available_from: null, available_until: null
};

const rufe = (pool, needle) => pool.calls.filter((c) => c.sql.includes(needle));

/* ── 1. Die Woche ──────────────────────────────────────────────────────── */

describe("P9/A5 · Wochenschluessel", () => {
  it("bildet die ISO-Woche in deutscher Zeit", () => {
    assert.equal(isoWocheDE("2026-08-09"), "2026-W32");
    assert.equal(isoWocheDE("2026-08-10"), "2026-W33", "Montag beginnt die neue Woche");
  });

  it("ein Sonntagabend rutscht nicht in die Folgewoche", () => {
    // Genau der Fehler, den rohes UTC machen wuerde: 22:30 Ortszeit ist am
    // Sonntag bereits der naechste UTC-Tag — die Wochensperre waere ausgehebelt.
    assert.equal(
      isoWocheDE(new Date("2026-08-09T22:30:00+02:00")),
      isoWocheDE("2026-08-09")
    );
  });

  it("der Jahreswechsel bricht den Schluessel nicht", () => {
    assert.match(isoWocheDE("2027-01-01"), /^\d{4}-W\d{2}$/);
  });
});

/* ── 2. Die Regel ──────────────────────────────────────────────────────── */

describe("P9/A5 · Wann angestupst wird", () => {
  it("neu verdient", () => {
    const a = bestimmeAnstupser([], [{ key: "x", earned: true, progress: 100 }]);
    assert.deepEqual(a.map((e) => e.anlass), ["earned"]);
  });

  it("entfallen", () => {
    const a = bestimmeAnstupser(
      [{ key: "x", is_active: true }],
      [{ key: "x", earned: false, progress: 40, note: "Entfallen durch Storno am 12.08." }]
    );
    assert.equal(a[0].anlass, "lost");
    assert.match(a[0].note, /12\.08\./, "die Begruendung aus der Bedingung muss durchgereicht werden");
  });

  it("kurz davor — aber erst ab der Schwelle", () => {
    const knapp = bestimmeAnstupser([], [{ key: "x", earned: false, progress: NAH_AB_PROZENT - 1 }]);
    assert.deepEqual(knapp, [], "darunter ist es kein Anlass, sondern Laerm");
    const drueber = bestimmeAnstupser([], [{ key: "x", earned: false, progress: NAH_AB_PROZENT }]);
    assert.equal(drueber[0].anlass, "near");
  });

  it("unveraenderte Zustaende stupsen nicht an", () => {
    assert.deepEqual(
      bestimmeAnstupser([{ key: "x", is_active: true }], [{ key: "x", earned: true, progress: 100 }]),
      [], "wer sein Bounty behaelt, will darueber nicht jede Woche lesen"
    );
    assert.deepEqual(
      bestimmeAnstupser([], [{ key: "x", earned: false, progress: 10 }]),
      []
    );
  });
});

/* ── 3. Die Worte ──────────────────────────────────────────────────────── */

describe("P9/A5 · Was dort steht", () => {
  it("nennt beim Verdienen den Rabatt — er ist der Grund", () => {
    const t = formuliere("earned", GRUENDER);
    assert.match(t, /Gruendungsmitglied/);
    assert.match(t, /3 %/);
    assert.match(t, /naechsten Rechnung/, "der Nutzen gehoert in den Satz, nicht nur das Abzeichen");
  });

  it("uebernimmt beim Entfallen die Begruendung der Bedingung", () => {
    const t = formuliere("lost", GRUENDER, "Baut sich neu auf und ist ab 10.11.2026 wieder verfuegbar.");
    assert.match(t, /10\.11\.2026/,
      "die Bedingung weiss genauer als dieser Dienst, warum es entfallen ist");
  });

  it("bleibt ohne Begruendung verstaendlich", () => {
    assert.match(formuliere("lost", GRUENDER, null), /entfallen/);
    assert.match(formuliere("near", GRUENDER, null), /Fast geschafft/);
  });
});

/* ── 4. Zustellung, Gedaechtnis, Wochenlimit ───────────────────────────── */

describe("P9/A5 · Zustellung", () => {
  it("stupst einmal an und merkt es sich VOR dem Versand", async () => {
    const pool = anstupsPool({ katalog: [GRUENDER] });
    const e = await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });

    assert.equal(e.inApp, 1);
    const merker = rufe(pool, "INSERT INTO bounty_nudges");
    const meldung = rufe(pool, "INSERT INTO notifications");
    assert.ok(merker.length >= 1 && meldung.length >= 1);
    assert.ok(pool.calls.indexOf(merker[0]) < pool.calls.indexOf(meldung[0]),
      "lieber ein Anstupser zu wenig als einer zu viel, wenn der Lauf abbricht");
  });

  it("der zweite Lauf derselben Woche schickt nichts mehr", async () => {
    const pool = anstupsPool({ katalog: [GRUENDER] });
    const erst = await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });
    const zweit = await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });
    assert.equal(erst.inApp, 1);
    assert.equal(zweit.inApp, 0, "das Gedaechtnis muss den Wiederholungslauf abfangen");
  });

  it("hoechstens eine Mail je Nutzer und Woche", async () => {
    const zweiBounties = [
      GRUENDER,
      { ...GRUENDER, id: "b2", key: "zweites", name_de: "Zweites", discount_pct: 2 }
    ];
    const pool = anstupsPool({ katalog: zweiBounties });
    const e = await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });

    assert.equal(e.inApp, 2, "in der App duerfen beide erscheinen");
    assert.equal(e.mail, MAX_MAILS_JE_WOCHE,
      "im Postfach nicht — ein zweiter Anstupser derselben Woche handelt Abmeldungen ein");
  });

  it("wer diese Woche schon eine Mail hatte, bekommt keine zweite", async () => {
    const pool = anstupsPool({ katalog: [GRUENDER], mailsSchon: MAX_MAILS_JE_WOCHE });
    const e = await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });
    assert.equal(e.inApp, 1, "in der App bleibt der Hinweis erlaubt");
    assert.equal(e.mail, 0);
  });

  it("\"kurz davor\" geht nie per Mail", () => {
    assert.ok(!MAIL_ANLAESSE.includes("near"),
      "eine Mail fuer \"noch zwei Abschluesse\" ist der Anlass, mit dem man sich Abmeldungen einhandelt");
    assert.deepEqual([...MAIL_ANLAESSE].sort(), ["earned", "lost"]);
  });

  it("ein abgeschaltetes Bounty stupst nicht an", async () => {
    // Sonst bewirbt die Plattform etwas, das es nicht mehr gibt.
    const aus = { ...GRUENDER, is_active: false };
    const pool = anstupsPool({ katalog: [aus] });
    const e = await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });
    assert.equal(e.inApp, 0);
    assert.equal(rufe(pool, "INSERT INTO notifications").length, 0);
  });

  it("die Meldung verweist auf das Bounty — mit der KENNUNG, nicht dem Schluessel", async () => {
    /*
     * KORRIGIERT: Dieser Test hat zuerst geprueft, dass `entity_id` den Schluessel
     * ("founding_member") traegt — und war gruen, weil die Attrappe jede
     * Zeichenkette annimmt. `notifications.entity_id` ist aber eine UUID-Spalte;
     * am echten Lauf scheiterte der INSERT mit
     * "invalid input syntax for type uuid". Der Test hat den Defekt als Soll
     * festgeschrieben. Jetzt wird die Kennung geprueft — und dass es wirklich
     * eine UUID ist, damit der Schluessel nicht zurueckkommt.
     */
    const pool = anstupsPool({ katalog: [{ ...GRUENDER, id: "3f2b1c44-0a11-4d2e-9c33-5b6a7c8d9e01" }] });
    await stupseNutzerAn(pool, "u1", { woche: "2026-W32" });
    const meldung = rufe(pool, "INSERT INTO notifications")[0];

    assert.ok(meldung.params.includes("bounty"), "entity_type fehlt");
    assert.ok(meldung.params.includes("3f2b1c44-0a11-4d2e-9c33-5b6a7c8d9e01"),
      "entity_id muss die Kennung des Katalogeintrags sein");
    assert.ok(!meldung.params.includes("founding_member"),
      "der Schluessel gehoert nicht in eine UUID-Spalte");
    assert.ok(meldung.params.some((p) => typeof p === "string" && p.includes("/public/bounties.html")),
      "ohne Ziel ist der Anstupser eine Sackgasse");
  });

  it("scheitert der Versand, wird der Vermerk zurueckgenommen", async () => {
    // Sonst blockiert ein einzelner Fehler den Anstupser bis Montag: der Vermerk
    // stuende, die Nachricht waere nie rausgegangen.
    const pool = anstupsPool({ katalog: [GRUENDER] });
    const echteQuery = pool.query;
    pool.query = async (sql, params) => {
      if (sql.includes("INSERT INTO notifications")) throw new Error("Zustellung kaputt");
      return echteQuery(sql, params);
    };

    await assert.rejects(() => stupseNutzerAn(pool, "u1", { woche: "2026-W32" }));
    const geloescht = pool.calls.filter((c) => c.sql.includes("DELETE FROM bounty_nudges"));
    assert.equal(geloescht.length, 1,
      "ohne Ruecknahme bleibt die Wochensperre stehen, obwohl nichts zugestellt wurde");
  });
});
