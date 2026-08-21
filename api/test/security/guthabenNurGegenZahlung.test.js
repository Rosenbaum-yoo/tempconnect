/**
 * Guthaben gibt es nur gegen Zahlung — Befund P1-22, geschlossen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER VORHER STAND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis zum 2026-08-21 stand an dieser Stelle ein STOLPERDRAHT
 * (`guthabenStolperdraht.test.js`). Er hielt einen schlafenden Defekt fest:
 * `POST /credits/purchase` schrieb ein bepreistes Paket gut, ohne jeden
 * Bezahlschritt — harmlos nur deshalb, weil `spendCredits` keinen Aufrufer
 * hatte und Guthaben nirgends ausgegeben werden konnten.
 *
 * Der Draht sollte reissen, sobald jemand `spendCredits` verdrahtet. Er ist
 * nicht gerissen — er wurde eingeholt: die Owner-Entscheidung lautete Stripe,
 * und die Gutschrift haengt jetzt an einer gepruefte Zahlung. Damit ist seine
 * Aufgabe erledigt, und an seine Stelle treten die Zusicherungen, die den
 * gebauten Zustand halten.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE DREI ZUSICHERUNGEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. Die Route schreibt NICHTS — sie erzeugt nur eine Sitzung.
 *   2. Ohne Stripe gibt es keinen Ersatzweg, sondern 503. (Ein Ersatzweg WAR
 *      der Befund.)
 *   3. Die Gutschrift prueft den tatsaechlich gezahlten Betrag und laesst sich
 *      nicht zweimal ausloesen.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { mockReq, mockRes, noop, baseDeps } from "../helpers/security-mocks.js";
import { spionPool } from "../helpers/orgGrenzenSpion.js";
import { createCreditsRouter } from "../../routes/credits.js";
import * as creditService from "../../services/creditService.js";
import { findHandlerExact } from "../helpers/security-mocks.js";

const API = path.resolve(import.meta.dirname ?? ".", "..", "..");
const PAKET = {
  id: "paket-1", name: "Starter", credits: 100, price_eur: "9.99",
  bonus_pct: 0, is_active: true
};

function deps(pool, config = {}) {
  return { ...baseDeps(pool), config };
}

describe("P1-22 · Die Route schreibt nichts mehr gut", () => {
  it("ohne Stripe antwortet sie 503 statt kostenlos zu liefern", async () => {
    /* DER KERN DES BEFUNDES. Ein Ersatzweg, der ohne Zahlung gutschreibt, ist
       genau das, was hier jahrelang stand. Wer Stripe nicht einrichtet, kann
       keine Guthaben verkaufen — er darf sie aber auch nicht verschenken. */
    const pool = spionPool({ zeile: PAKET });
    const router = createCreditsRouter(deps(pool));           // kein STRIPE_SECRET_KEY
    const handler = findHandlerExact(router, "post", "/credits/purchase");

    const res = mockRes();
    await handler(
      mockReq({ session: { userId: "u1" }, body: { package_id: "paket-1" } }),
      res, noop
    );
    for (let i = 0; i < 3; i++) await new Promise((f) => setImmediate(f));

    assert.equal(res._status, 503, "ohne Zahlungsanbieter kein Kauf");
    assert.equal(res._json?.error, "PAYMENT_NOT_CONFIGURED");
    assert.deepStrictEqual(
      pool.schreibvorgaenge.map((c) => c.sql.slice(0, 50)), [],
      "und vor allem: keine Gutschrift"
    );
  });

  it("die Route kennt keinen Weg mehr zur Gutschrift", async () => {
    /* Verhalten laesst sich nur pruefen, wo ein Weg existiert. Dass es KEINEN
       gibt, ist eine Aussage ueber den Quelltext — und die wichtigste hier:
       `earnCredits` darf von der Route aus nicht erreichbar sein. */
    const quelle = await readFile(path.join(API, "routes", "credits.js"), "utf8");
    for (const verboten of ["earnCredits", "grantPurchasedPackage", "purchasePackage"]) {
      assert.ok(
        !new RegExp(String.raw`\b${verboten}\s*\(`).test(quelle),
        `routes/credits.js ruft \`${verboten}\` — die Gutschrift gehoert ` +
        "ausschliesslich in den signaturgeprueften Webhook."
      );
    }
  });
});

describe("P1-22 · Die Gutschrift prueft die Zahlung", () => {
  function poolMitPaket(extra) {
    return spionPool({ zeile: PAKET, antwort: extra });
  }

  it("zu wenig gezahlt: keine Gutschrift", async () => {
    /* Ohne diese Pruefung koennte eine manipulierte Sitzung das teure Paket zum
       Preis des billigen freischalten — dasselbe Schutzmuster wie bei der
       INDIVIDUELL-Aktivierung. */
    const pool = poolMitPaket();
    const ergebnis = await creditService.grantPurchasedPackage(pool, {
      userId: "u1", packageId: "paket-1", referenz: "kauf-1", bezahltCent: 100
    });

    assert.equal(ergebnis.error, "AMOUNT_MISMATCH");
    assert.equal(ergebnis.erwartet_cent, 999);
    assert.deepStrictEqual(
      pool.schreibvorgaenge.map((c) => c.sql.slice(0, 40)), [],
      "ein zu geringer Betrag darf nichts gutschreiben"
    );
  });

  it("kein Betrag uebermittelt: keine Gutschrift", async () => {
    const pool = poolMitPaket();
    const ergebnis = await creditService.grantPurchasedPackage(pool, {
      userId: "u1", packageId: "paket-1", referenz: "kauf-1", bezahltCent: null
    });
    assert.equal(ergebnis.error, "AMOUNT_MISMATCH");
    assert.deepStrictEqual(pool.schreibvorgaenge.map((c) => c.sql.slice(0, 40)), []);
  });

  it("ohne Kauf-Referenz gar nichts", async () => {
    /* Die Referenz ist der Anker der Einmaligkeit (Migration 186). Ohne sie
       waere die Gutschrift beliebig oft ausloesbar. */
    const pool = poolMitPaket();
    const ergebnis = await creditService.grantPurchasedPackage(pool, {
      userId: "u1", packageId: "paket-1", referenz: null, bezahltCent: 999
    });
    assert.equal(ergebnis.error, "INCOMPLETE");
    assert.deepStrictEqual(pool.schreibvorgaenge.map((c) => c.sql.slice(0, 40)), []);
  });

  it("Gegenprobe: der bezahlte Kauf wird gutgeschrieben", async () => {
    /* Ohne sie waere eine Funktion, die IMMER ablehnt, ebenfalls gruen — und der
       Kunde haette bezahlt, ohne etwas zu bekommen. */
    const pool = poolMitPaket();
    const ergebnis = await creditService.grantPurchasedPackage(pool, {
      userId: "u1", packageId: "paket-1", referenz: "kauf-1", bezahltCent: 999
    });

    assert.ok(ergebnis.ok, `erwartet: gutgeschrieben, bekommen: ${JSON.stringify(ergebnis)}`);
    assert.equal(ergebnis.credits_added, 100);
    const gutschrift = pool.schreibvorgaenge.find((c) => /credit_transactions/i.test(c.sql));
    assert.ok(gutschrift, "es muss eine Buchung geben");
    assert.ok(
      gutschrift.params.some((p) => String(p) === "kauf-1"),
      "und sie muss die Kauf-Referenz tragen — sonst greift die Einmaligkeit nicht"
    );
  });

  it("der Bonus wird mitgerechnet", async () => {
    const pool = spionPool({ zeile: { ...PAKET, credits: 500, bonus_pct: 10, price_eur: "39.99" } });
    const ergebnis = await creditService.grantPurchasedPackage(pool, {
      userId: "u1", packageId: "paket-1", referenz: "kauf-2", bezahltCent: 3999
    });
    assert.equal(ergebnis.credits_added, 550);
  });

  it("eine wiederholte Zustellung wirkt nicht doppelt", async () => {
    /* Stripe stellt Webhooks WIEDERHOLT zu — das ist die Zusicherung des
       Anbieters, kein Fehler. Der Riegel liegt in der Datenbank (Migration 186);
       hier wird geprueft, dass der Dienst ihn richtig deutet: eine zweite
       Zustellung ist ERFOLG ohne Wirkung, kein Fehler. */
    const pool = spionPool({
      zeile: PAKET,
      antwort: (sql) => {
        if (/INSERT INTO credit_transactions/i.test(String(sql))) {
          const err = new Error("duplicate key value violates unique constraint");
          err.code = "23505";
          throw err;
        }
        return undefined;
      }
    });
    const ergebnis = await creditService.grantPurchasedPackage(pool, {
      userId: "u1", packageId: "paket-1", referenz: "kauf-1", bezahltCent: 999
    });

    assert.ok(ergebnis.ok, "eine Wiederholung darf den Webhook nicht scheitern lassen");
    assert.equal(ergebnis.bereits_gutgeschrieben, true);
  });

  it("ein Paket ohne gueltigen Preis kommt nicht in die Bezahlstrecke", async () => {
    /* Sonst entstuende die kostenlose Gutschrift auf einem anderen Weg neu. */
    const pool = spionPool({ zeile: { ...PAKET, price_eur: null } });
    const ergebnis = await creditService.startPurchase(pool, "paket-1");
    assert.equal(ergebnis.error, "PACKAGE_PRICE_INVALID");
  });
});
