/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WER EINEN WERT HINZUFÜGT, SAGT AUF WELCHER SEITE ER STEHT (U6.6)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Code kodiert Datenbankwerte als Zeichenketten: `status = 'active'`,
 * `tier <> 'BLOCKED'`, `status IN ('draft','active')`. Kommt in der Datenbank
 * ein Wert hinzu, fällt er **stillschweigend** auf die Seite, die der Code
 * gerade nicht nennt — eine Entscheidung, die niemand getroffen hat.
 *
 * Gemessen an U6.2: ein neuer `vendor_pool.status` (etwa `paused`) wäre ohne
 * weiteres „nicht im Pool". Ein pausierter Lieferant bekäme also keine neue
 * Konditionskarte mehr, und niemand hätte das entschieden. In der anderen
 * Richtung genauso: eine neue `tier`-Stufe gilt automatisch als „im Pool",
 * auch wenn sie als Sperre gedacht war.
 *
 * WARUM DIESE DATEI UND NICHT DIE DATENBANKGEBUNDENE DANEBEN. Dieselbe Prüfung
 * stand zuerst in `test/integration/wirkungDesEntfernens.flow.test.js` und
 * fragte die laufende Datenbank. Die gegenprüfende Sitzung hat darauf
 * hingewiesen, dass sie damit **im Host-Tor keine Zusicherung** ist — sie läuft
 * nur im Abbild-Lauf, und genau im Host-Tor entscheidet sich, ob jemand einen
 * Wert hinzufügen kann, ohne zu sagen, wohin er gehört. Seit U6.6 führt die
 * Momentaufnahme (`test/fixtures/schema.json`) die Wertelisten, also läuft die
 * Prüfung überall. Die DB-gebundene bleibt als Gegenprobe stehen: sie belegt,
 * dass die Momentaufnahme die Wirklichkeit trifft.
 *
 * WAS HIER NICHT STEHT: eine Liste aller 231 Wertelisten. Das wäre ein Register,
 * das bei jeder Migration rot wird, ohne etwas zu sagen. Geprüft werden die
 * Spalten, an denen eine **Regel** hängt — heute die zwei aus U6.2, und jede
 * weitere kommt dazu, wenn eine Regel entsteht.
 *
 * Run: node --test --test-force-exit test/wertelistenSindBenannt.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { POOL_AKTIVER_STATUS, POOL_GESPERRTE_STUFE } from "../services/poolMitgliedschaftSql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Pfad relativ zur TESTDATEI, nie nur zu process.cwd() — sonst skippt die Probe
   lautlos, je nachdem aus welchem Verzeichnis der Läufer gestartet wurde. */
function findeSchema() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      for (const k of [
        path.join(dir, "test", "fixtures", "schema.json"),
        path.join(dir, "api", "test", "fixtures", "schema.json")
      ]) {
        if (fs.existsSync(k) && fs.statSync(k).size > 1000) return k;
      }
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const DATEI = findeSchema();
const suite = DATEI ? describe : describe.skip;

/**
 * DIE REGELN, die auf Wertelisten stehen. Jede nennt BEIDE Seiten vollständig.
 * Eine Regel, die nur eine Seite nennt, kann nicht prüfen, ob ein neuer Wert
 * vergessen wurde — genau das ist der Zweck dieser Datei.
 */
const REGELN = [
  {
    was: "Pool-Zugehörigkeit (U6.2) — welcher status zählt als im Pool",
    tabelle: "vendor_pool",
    spalte: "status",
    dafuer: [POOL_AKTIVER_STATUS],
    dagegen: ["suspended", "removed"],
    folge: "Ein unbenannter status gilt als NICHT im Pool: der Lieferant bekommt " +
      "keine neue Konditionskarte und keinen neuen Einsatz mehr. Siehe " +
      "services/poolMitgliedschaftSql.js."
  },
  {
    was: "Pool-Zugehörigkeit (U6.2) — welche Stufe ist eine Sperre",
    tabelle: "vendor_pool",
    spalte: "tier",
    dafuer: ["PREFERRED", "SECONDARY", "TRIAL", "RESTRICTED"],
    dagegen: [POOL_GESPERRTE_STUFE],
    folge: "Eine unbenannte Stufe gilt automatisch als IM Pool — auch wenn sie " +
      "als Sperre gedacht war. Siehe services/poolMitgliedschaftSql.js."
  },
  {
    was: "Wirkungsvorschau (U6.2b) — welche Konditionskarte ist noch änderbar",
    tabelle: "rate_cards",
    spalte: "status",
    dafuer: ["draft", "active"],
    dagegen: ["expired", "archived"],
    folge: "Ein unbenannter status wird in der Wirkungsvorschau NICHT gezählt: " +
      "das Entfernen aus dem Pool nennt dann zu wenige betroffene Karten. " +
      "Siehe wirkungDesEntfernens in services/vendorPoolService.js."
  },
  {
    was: "Wirkungsvorschau (U6.2b) — welcher Einsatz läuft",
    tabelle: "assignments",
    spalte: "status",
    dafuer: ["planned", "active", "extended"],
    dagegen: ["completed", "cancelled"],
    folge: "Ein unbenannter status zählt NICHT als laufender Einsatz: die " +
      "Wirkungsvorschau nennt dann zu wenige. Siehe wirkungDesEntfernens."
  },
  {
    was: "Wirkungsvorschau (U6.2b) — welcher Rahmenvertrag hält die Partnerschaft",
    tabelle: "contracts",
    spalte: "status",
    dafuer: ["active"],
    dagegen: ["draft", "expired", "terminated"],
    folge: "Ein unbenannter status hält die Partnerschaft NICHT: bleibt_partner " +
      "wird dann falsch false, und die Vorschau kündigt eine Sperre an, die " +
      "nicht eintritt."
  }
];

suite("U6.6 · jeder erlaubte Wert ist von seiner Regel benannt", () => {
  const schema = JSON.parse(fs.readFileSync(DATEI, "utf8"));
  const listen = schema.wertelisten || {};

  it("die Momentaufnahme führt die Wertelisten überhaupt", () => {
    /*
     * NOTBREMSE, und sie ist hier besonders wichtig: fehlte der Abschnitt, wäre
     * `listen[tab]?.[spalte]` überall undefined, jede Prüfung unten würde
     * übersprungen, und die Datei liefe leer grün durch. Eine Probe, die ihren
     * Gegenstand nicht findet, muss das MELDEN, nicht stillschweigen.
     */
    assert.ok(Object.keys(listen).length > 0,
      "der Abschnitt `wertelisten` fehlt in der Momentaufnahme — " +
      "neu erzeugen mit: cd api && npm run schema:snapshot");
    assert.ok(Object.keys(listen).length >= 50,
      "nur " + Object.keys(listen).length + " Tabellen mit Werteliste — " +
      "gemessen am 2026-10-01 waren es 117. So wenige deuten auf eine " +
      "abgeschnittene Abfrage, nicht auf ein aufgeräumtes Schema.");
  });

  for (const r of REGELN) {
    it(`${r.tabelle}.${r.spalte} — ${r.was}`, () => {
      const erlaubt = listen[r.tabelle]?.[r.spalte];
      assert.ok(Array.isArray(erlaubt),
        `die Momentaufnahme kennt keine Werteliste für ${r.tabelle}.${r.spalte}. ` +
        "Entweder ist die CHECK-Regel weg (dann ist die Spalte ungeschützt und " +
        "diese Regel hat keinen Halt mehr) oder die Momentaufnahme ist veraltet " +
        "(cd api && npm run schema:snapshot).");

      const benannt = [...r.dafuer, ...r.dagegen].sort();
      const unbenannt = erlaubt.filter((w) => !benannt.includes(w));
      const erfunden = benannt.filter((w) => !erlaubt.includes(w));

      assert.deepEqual(unbenannt, [],
        `${r.tabelle}.${r.spalte} erlaubt Werte, die diese Regel nicht benennt: ` +
        JSON.stringify(unbenannt) + ".\n" + r.folge + "\n" +
        "Sag, auf welcher Seite der Wert steht — im Dienst UND in dieser Datei.");

      assert.deepEqual(erfunden, [],
        `diese Regel nennt Werte, die ${r.tabelle}.${r.spalte} gar nicht erlaubt: ` +
        JSON.stringify(erfunden) + ".\n" +
        "Eine Regel über einen unmöglichen Wert ist toter Code mit dem Anschein " +
        "von Sorgfalt.");

      /* Und die beiden Seiten dürfen sich nicht überschneiden: ein Wert auf
         beiden Listen macht die Prüfungen oben wahr und bedeutungslos. */
      const doppelt = r.dafuer.filter((w) => r.dagegen.includes(w));
      assert.deepEqual(doppelt, [],
        `diese Werte stehen auf BEIDEN Seiten: ${JSON.stringify(doppelt)} — ` +
        "damit sagt die Regel nichts.");

      /* Keine Seite darf leer sein: eine Regel, bei der alles zählt oder nichts,
         ist keine. */
      assert.ok(r.dafuer.length > 0 && r.dagegen.length > 0,
        "eine Regel braucht beide Seiten — sonst trennt sie nichts");
    });
  }

  it("die Werte des Wahrheitsmoduls stehen wirklich in der Datenbank", () => {
    /*
     * Die Gegenrichtung zu allem oben: `POOL_AKTIVER_STATUS` und
     * `POOL_GESPERRTE_STUFE` sind Zeichenketten im Code. Stimmten sie nicht mit
     * dem Schema überein, wäre die Pool-Regel eine Abfrage, die NIE zutrifft —
     * und das sieht aus wie „kein Lieferant steht im Pool", nicht wie ein Fehler.
     */
    assert.ok(listen.vendor_pool?.status?.includes(POOL_AKTIVER_STATUS),
      `POOL_AKTIVER_STATUS = '${POOL_AKTIVER_STATUS}' ist kein erlaubter ` +
      "vendor_pool.status — die Pool-Regel träfe damit NIE zu, und das sähe aus " +
      "wie ein leerer Pool statt wie ein Fehler");
    assert.ok(listen.vendor_pool?.tier?.includes(POOL_GESPERRTE_STUFE),
      `POOL_GESPERRTE_STUFE = '${POOL_GESPERRTE_STUFE}' ist keine erlaubte ` +
      "vendor_pool.tier — die Sperre wäre dann ein Vermerk ohne Wirkung");
  });

  it("jeder Eintrag IST eine Werteliste — keine Bereichsregel hat sich eingeschlichen", () => {
    /*
     * DER FILTER DES ERZEUGERS, von aussen nachgeprüft.
     *
     * Eine Rückmutation hat gezeigt, dass dieser Rückhalt fehlte: weitet man den
     * Filter im Erzeuger auf JEDEN einspaltigen CHECK, bleibt die Datei grün —
     * die fünf Spalten mit Regeln stimmen weiter, und der Rest wächst
     * unbemerkt. Ein Abschnitt, in dem Dinge stehen, die keine Wertelisten sind,
     * ist eine Momentaufnahme, der man nicht mehr trauen kann.
     *
     * GEMESSEN, statt eine Zahl zu raten: 125 einspaltige CHECKs sind KEINE
     * Werteliste, und **117 von ihnen tragen null Zeichenketten-Literale**
     * (`CHECK (accepted_count >= 0)` und Verwandte). Beim geweiteten Filter
     * landen die als `null` oder leere Liste im Abschnitt. Diese Zusicherung
     * fängt damit die ganze Bereichsregel-Familie.
     *
     * WAS SIE NICHT FÄNGT, offen gesagt: die restlichen 8 (sieben mit einem
     * Literal, eine mit sechs) sehen der Form einer Werteliste zum Verwechseln
     * ähnlich — `col <> 'x'` ist von einer Liste mit einem Wert nicht
     * unterscheidbar. Der primäre Riegel ist deshalb der Filter im Erzeuger
     * (`= ANY (ARRAY[`); das hier ist der Rückhalt, der den Bruch grob sichtbar
     * macht, nicht die vollständige Trennung.
     *
     * KEINE ZAHLENGRENZE: eine Obergrenze auf die Tabellenzahl (117 heute, 140
     * beim geweiteten Filter) würde bei jeder legitimen Migration anschlagen —
     * und eine Zahl, die bei normaler Arbeit Alarm schlägt, trainiert dem Leser
     * das Wegschauen an (so steht es schon in dokuWaechter.test.js).
     */
    const kaputt = [];
    for (const [tab, spalten] of Object.entries(listen)) {
      for (const [spalte, werte] of Object.entries(spalten)) {
        if (!Array.isArray(werte) || werte.length === 0) {
          kaputt.push(`${tab}.${spalte} = ${JSON.stringify(werte)}`);
          continue;
        }
        const nichtText = werte.filter((w) => typeof w !== "string");
        if (nichtText.length) kaputt.push(`${tab}.${spalte} enthält ${JSON.stringify(nichtText)}`);
      }
    }
    assert.deepEqual(kaputt, [],
      "diese Einträge sind keine Wertelisten:\n  " + kaputt.join("\n  ") +
      "\nDer Erzeuger nimmt nur einspaltige CHECKs mit `= ANY (ARRAY[` auf. " +
      "Steht hier etwas anderes, ist der Filter in api/scripts/schema-snapshot.js " +
      "geweitet worden — Bereichsregeln (>= 0) tragen keine Werte und landen als null.");
  });

  it("der Abschnitt ist sortiert — sonst erzeugt jede Neugenerierung einen leeren Diff", () => {
    const tabellen = Object.keys(listen);
    assert.deepEqual(tabellen, [...tabellen].sort((a, b) => a.localeCompare(b)),
      "die Tabellen im Abschnitt `wertelisten` sind nicht sortiert");
    for (const [tab, spalten] of Object.entries(listen)) {
      const namen = Object.keys(spalten);
      assert.deepEqual(namen, [...namen].sort((a, b) => a.localeCompare(b)),
        `die Spalten von ${tab} sind nicht sortiert`);
      for (const [spalte, werte] of Object.entries(spalten)) {
        assert.deepEqual(werte, [...werte].sort(),
          `die Werte von ${tab}.${spalte} sind nicht sortiert`);
      }
    }
  });
});
