/**
 * Der Stolperdraht am Guthaben-System — Befund P1-22.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS GEMESSEN WURDE (2026-08-20, bei der Bestandsaufnahme zu P1-21)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `POST /credits/purchase` traegt nur `requireAuth`. Der Weg schlaegt in
 * `creditService.purchasePackage` nach, wie viele Guthaben ein Paket enthaelt,
 * rechnet den Bonus dazu und schreibt sie ueber `earnCredits` gut — OHNE jeden
 * Bezahlschritt. Die Pakete haben Preise: in der laufenden Datenbank stehen
 * drei (9,99 / 39,99 / 129,99 EUR).
 *
 * Ein aktives Leck ist es TROTZDEM nicht, und das ist der entscheidende Teil
 * des Befundes: `spendCredits` hat KEINEN EINZIGEN AUFRUFER. Guthaben lassen
 * sich nirgends ausgeben, also ist die kostenlose Gutschrift eine Waehrung, die
 * nichts kauft. Kein Frontend ruft die Wege ueberhaupt auf.
 *
 * Es ist ein SCHLAFENDER Defekt — dieselbe Klasse wie der entfernte
 * Matching-Weg (P1-19): harmlos, solange ein Teil fehlt, und ein echtes Leck an
 * dem Tag, an dem jemand diesen Teil ergaenzt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN STOLPERDRAHT UND KEIN PATCH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Reparatur waere eine Bezahlstrecke — und CLAUDE.md verbietet genau das:
 * „Kein Code fuer Auto-Billing, solange manuelle Rechnung Default ist."
 * Die Route zu entfernen waere ebenfalls falsch: drei bepreiste Pakete stehen
 * in der Produktionsdatenbank, das Guthaben-System ist offenbar gewollt, nur
 * unfertig.
 *
 * Also weder patchen noch loeschen, sondern SICHTBAR halten: dieser Test wird
 * in dem Moment rot, in dem jemand `spendCredits` verdrahtet, ohne vorher die
 * Gutschrift an eine Zahlung zu binden. Der Defekt kann dann nicht mehr
 * unbemerkt aufwachen.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const API = path.resolve(import.meta.dirname ?? ".", "..", "..");

async function alleQuellen() {
  const raus = [];
  for (const ordner of ["routes", "services", "middleware", "utils", "jobs"]) {
    const wurzel = path.join(API, ordner);
    let eintraege;
    try { eintraege = await readdir(wurzel, { withFileTypes: true, recursive: true }); }
    catch { continue; }
    for (const e of eintraege) {
      if (!e.isFile() || !e.name.endsWith(".js")) continue;
      const p = path.join(e.parentPath ?? e.path ?? wurzel, e.name);
      raus.push({ pfad: path.relative(API, p), inhalt: await readFile(p, "utf8") });
    }
  }
  return raus;
}

describe("P1-22 · Guthaben — der schlafende Defekt bleibt schlafend", () => {
  it("die Gutschrift ist weiterhin an keine Zahlung gebunden (Befundlage)", async () => {
    /* Diese Zusicherung haelt den BEFUND fest, nicht den Wunschzustand. Wird sie
       rot, ist das eine gute Nachricht: jemand hat die Bezahlstrecke gebaut —
       dann gehoert auch dieser Test angepasst. */
    const dienst = await readFile(path.join(API, "services", "creditService.js"), "utf8");
    const zahlungsWorte = /stripe|paypal|payment_intent|checkout_session|invoice_id|zahlung/i;
    assert.ok(
      !zahlungsWorte.test(dienst),
      "creditService kennt jetzt eine Zahlung — bitte diesen Stolperdraht durch " +
      "eine echte Pruefung ersetzen (die Gutschrift muss die Zahlung voraussetzen)."
    );
  });

  it("`spendCredits` hat weiterhin keinen Aufrufer — sonst wacht der Defekt auf", async () => {
    /* DER KERN. Solange Guthaben nirgends ausgegeben werden, ist die kostenlose
       Gutschrift eine Waehrung, die nichts kauft. Wer `spendCredits` verdrahtet,
       macht daraus in derselben Sekunde einen Weg, sich bezahlte Leistung
       kostenlos zu nehmen. */
    const quellen = await alleQuellen();
    const rufer = quellen
      .filter((q) => !q.pfad.endsWith(path.join("services", "creditService.js")))
      .filter((q) => /\bspendCredits\s*\(/.test(q.inhalt))
      .map((q) => q.pfad);

    assert.deepStrictEqual(
      rufer, [],
      "Guthaben werden jetzt ausgegeben — damit ist `POST /credits/purchase` " +
      "ein Weg, sich bezahlte Leistung kostenlos zu nehmen: die Route traegt nur " +
      "`requireAuth` und schreibt das Paket ohne Bezahlschritt gut " +
      "(credits.js:30, creditService.js:67). Siehe P1-22 in " +
      "docs/PILOT_GO_LIVE_TODOS.md — erst die Zahlung binden, dann ausgeben."
    );
  });
});
