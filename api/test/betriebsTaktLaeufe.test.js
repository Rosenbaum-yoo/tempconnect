/**
 * Die fuenf gemeinsamen Laeufe (M1.9, Owner-Entscheid 2026-09-04).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis zum 2026-09-04 hatten diese fuenf Ablaeufe genau einen Ausloeser: einen
 * internen HTTP-Endpunkt, den niemand rief. Jetzt haben sie zwei — den Endpunkt
 * und einen eingeplanten Takt. Damit entsteht eine neue Klasse von Fehlern, und
 * sie ist teuer:
 *
 *   Der Takt umgeht den Kill-Switch. `RECURRING_BILLING_ENABLED` und
 *   `DUNNING_ENABLED` sind per Vorgabe AUS. Beim ersten Lauf ohne diese Pruefung
 *   entstuenden Folgerechnungen fuer ALLE faelligen Zeitraeume rueckwirkend, und
 *   Mahnpost ginge an echte zahlende Kunden. Ein Schalter, der nur am Endpunkt
 *   sitzt, waere ab dem Tag der Einplanung wirkungslos.
 *
 * Deshalb sitzt der Schalter im gemeinsamen Ablauf, und deshalb steht die erste
 * Probe hier: sie faehrt den Lauf mit einem Datenbankzugang, der bei JEDER
 * Benutzung wirft. Ein `disabled`-Ergebnis, das trotzdem eine Abfrage abgesetzt
 * hat, waere kein Schalter, sondern eine Beschriftung.
 *
 * Run: node --test --test-force-exit test/betriebsTaktLaeufe.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LAEUFE, recurringBilling, dunningSweep, invoiceOverdueScan
} from "../services/betriebsTaktLaeufe.js";

/** Ein Zugang, der jede Benutzung als Fehler meldet. */
function verweigernderPool(grund) {
  return {
    query: () => { throw new Error(grund); },
    connect: () => { throw new Error(grund); }
  };
}

/** Ein Zugang, der jede Abfrage mitschreibt und eine feste Antwort gibt. */
function zaehlenderPool(antwort) {
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql: String(sql), params: params || [] });
      return antwort(String(sql)) || { rows: [], rowCount: 0 };
    }
  };
}

describe("M1.9 · der Kill-Switch haelt auch den Takt", () => {
  it("recurring-billing ruehrt die Datenbank nicht an, solange der Schalter aus ist", async () => {
    const pool = verweigernderPool("Die Datenbank wurde benutzt, obwohl der Schalter aus ist");
    const ergebnis = await recurringBilling(pool, { config: { RECURRING_BILLING_ENABLED: false } });

    assert.equal(ergebnis.disabled, true);
    assert.equal(ergebnis.reason, "RECURRING_BILLING_ENABLED=false");
    /* Dass hier kein Fehler flog, IST die Zusicherung: der Lauf ist vor dem
     * ersten Datenbankzugriff umgekehrt. */
  });

  it("dunning-sweep verschickt nichts, solange der Schalter aus ist", async () => {
    const pool = verweigernderPool("Die Datenbank wurde benutzt, obwohl der Schalter aus ist");
    let versandVersuche = 0;
    const ergebnis = await dunningSweep(pool, {
      config: { DUNNING_ENABLED: false },
      sendMail: () => { versandVersuche += 1; return true; }
    });

    assert.equal(ergebnis.disabled, true);
    assert.equal(ergebnis.reason, "DUNNING_ENABLED=false");
    assert.equal(versandVersuche, 0,
      "Es wurde ein Versand versucht, obwohl die Mahnstrecke abgeschaltet ist");
  });

  it("ein fehlender config-Block schaltet AUS, nicht EIN", async () => {
    /* Die Richtung, in die ein Versehen fallen muss. Wer den Lauf ohne `config`
     * aufruft — ein neuer Ausloeser, ein Test, ein Skript — darf damit nicht
     * versehentlich Rechnungen erzeugen. `undefined` ist kein "ja". */
    const pool = verweigernderPool("Ohne config wurde die Datenbank benutzt");
    assert.equal((await recurringBilling(pool)).disabled, true);
    assert.equal((await recurringBilling(pool, {})).disabled, true);
    assert.equal((await dunningSweep(pool)).disabled, true);
    assert.equal((await dunningSweep(pool, { config: {} })).disabled, true);
  });
});

describe("M1.9 · eingeschaltet und ohne Versandweg ist ein FEHLER, kein stiller Lauf", () => {
  it("dunning-sweep wirft, wenn der Schalter an ist und kein Mailer da", async () => {
    /*
     * Die gefaehrlichste Kombination der ganzen Welle, und sie sieht harmlos aus.
     *
     * `runDunningSweep` gibt ohne Mailer `{ note: "NO_MAILER" }` zurueck und
     * markiert bewusst nichts — richtig, damit keine Erinnerung als verschickt
     * gilt, die es nicht ist. Fuer den TAKT waere das aber ein GELUNGENER Lauf:
     * Job `completed`, Herzschlag gruen, Kachel "laeuft". Die Mahnstrecke waere
     * eingeschaltet, stumm, und nichts wuerde es zeigen — bis jemand sich fragt,
     * warum seit Wochen keiner zahlt.
     */
    const pool = verweigernderPool("Die Datenbank haette gar nicht befragt werden duerfen");
    await assert.rejects(
      () => dunningSweep(pool, { config: { DUNNING_ENABLED: true } }),
      /kein Versandweg/,
      "Ein eingeschalteter Mahnlauf ohne Mailer muss scheitern, nicht gruen durchlaufen");
  });

  it("mit Versandweg laeuft er weiter bis zur Datenbank", async () => {
    /* Die Gegenprobe: der Wurf darf nicht dauerhaft im Weg stehen. Mit Mailer
     * kommt der Lauf bis zur ersten Abfrage — der verweigernde Zugang beweist
     * genau das, indem er dort wirft und nicht vorher. */
    const pool = verweigernderPool("bis zur Datenbank gekommen");
    await assert.rejects(
      () => dunningSweep(pool, { config: { DUNNING_ENABLED: true }, sendMail: async () => true }),
      /bis zur Datenbank gekommen/,
      "Mit Versandweg muss der Lauf ueber die Versandweg-Pruefung hinaus kommen");
  });
});

describe("M1.9 · ein Lauf ohne Wirkung schreibt keinen Audit-Eintrag", () => {
  it("invoice-overdue-scan: null gefundene Rechnungen, kein Eintrag", async () => {
    /* Ein Audit-Protokoll, in dem jede Nacht "0 Rechnungen faellig gesetzt"
     * steht, ist nach einem Monat unlesbar — und macht die Eintraege wertlos,
     * bei denen wirklich etwas passiert ist. */
    const pool = zaehlenderPool(() => ({ rows: [], rowCount: 0 }));
    const ergebnis = await invoiceOverdueScan(pool);

    assert.equal(ergebnis.overdue_marked, 0);
    const audit = pool.abfragen.filter((a) => /audit/i.test(a.sql));
    assert.deepStrictEqual(audit, [],
      "Ein wirkungsloser Lauf hat einen Audit-Eintrag geschrieben");
  });

  it("invoice-overdue-scan: gefundene Rechnungen, Eintrag mit der Zahl", async () => {
    const pool = zaehlenderPool((sql) =>
      /UPDATE invoices/i.test(sql) ? { rows: [], rowCount: 7 } : { rows: [], rowCount: 0 });
    const ergebnis = await invoiceOverdueScan(pool);

    assert.equal(ergebnis.overdue_marked, 7);
    const audit = pool.abfragen.filter((a) => /audit/i.test(a.sql));
    assert.equal(audit.length, 1, "genau ein Audit-Eintrag erwartet");
    /* Die ZAHL muss mitgehen — ein Eintrag "es ist etwas passiert" ohne Umfang
     * beantwortet die einzige Frage nicht, die man spaeter stellt. */
    const alsText = JSON.stringify(audit[0].params);
    assert.ok(alsText.includes("7"),
      `die Zahl 7 fehlt im Audit-Eintrag: ${alsText}`);
    assert.ok(alsText.includes("invoice.overdue_batch"),
      `die Aktion fehlt im Audit-Eintrag: ${alsText}`);
  });
});

describe("M1.9 · die Laufliste ist vollstaendig und aufrufbar", () => {
  it("jeder Name zeigt auf eine Funktion — und die Liste ist eingefroren benannt", () => {
    /*
     * Die Liste steht hier WOERTLICH, damit eine Ergaenzung auffaellt. Sie ist
     * am 2026-09-04 von fuenf auf sechs gewachsen (M3.5, die Wiedervorlage),
     * am 2026-09-19 auf sieben (N3.5, die Profil-Rangliste) und am 2026-10-01
     * auf acht (Produkt-Mitteilungen in Paketen), am selben Tag auf neun (deren
     * Empfaengerlisten nach 12 Monaten loeschen) — und dass dieser Test dabei
     * rot wurde, ist seine Aufgabe, nicht sein Fehler: ein neuer Lauf soll nicht
     * unbemerkt in die Maschinerie rutschen.
     */
    assert.deepStrictEqual(Object.keys(LAEUFE).sort(), [
      "dunning-sweep", "einladung-erinnerung", "expire-reservations",
      "invoice-overdue-scan", "produkt-update-aufbewahrung", "produkt-update-pakete",
      "profil-rangliste", "recurring-billing", "subscription-lifecycle-tick"
    ]);
    for (const [name, fn] of Object.entries(LAEUFE)) {
      assert.equal(typeof fn, "function", `${name} ist keine Funktion`);
    }
  });

  it("die Liste ist eingefroren — ein Ausloeser kann sie nicht erweitern", () => {
    /* Sonst koennte irgendein Modul zur Laufzeit einen Lauf nachtragen, den
     * weder die Registratur noch der Waechter kennt. */
    assert.ok(Object.isFrozen(LAEUFE));
  });
});
