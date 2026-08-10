/**
 * Der Waechter fuer sql/migrations/NUMBERING.md.
 *
 * WARUM ES DIESEN TEST GIBT
 * NUMBERING.md nennt die naechste freie Migrationsnummer. Diese Zahl stand vom
 * 2026-07-26 bis zum 2026-08-10 auf "158", waehrend real bereits 173 vergeben
 * war — sechzehn Migrationen lang falsch. Niemand hat es gemerkt, weil nichts
 * es pruefen konnte.
 *
 * Eine handgeschriebene Zahl ueber einem wachsenden Verzeichnis veraltet
 * zwangslaeufig. Also wird sie nicht mehr gepflegt, sondern geprueft: dieser
 * Test liest das Verzeichnis und vergleicht.
 *
 * Der praktische Schaden war real: wer der Datei glaubt, vergibt eine laengst
 * benutzte Nummer. Der Runner (sql/migrate.sh) verfolgt Migrationen ueber den
 * DATEINAMEN — zwei Dateien mit derselben Nummer laufen beide, in
 * alphabetischer Reihenfolge, und die Absicht "erst A, dann B" geht verloren.
 *
 * Run: node --test --test-force-exit test/migrationsNummern.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/*
 * Container: cwd=/app mit Lese-Mount sql/migrations. Lokal: cwd=api/, der Weg
 * fuehrt ueber import.meta.url zum Repo-Wurzelverzeichnis.
 *
 * WICHTIG — nicht auf blosse Existenz pruefen: Docker legt das Ziel eines
 * Bind-Mounts auf dem Host als LEERES Verzeichnis an, hier also
 * api/sql/migrations. Wer nur `existsSync` fragt, findet dieses leere
 * Verzeichnis und prueft danach nichts mehr. Genau so entsteht eine gruene
 * Suite, die weniger prueft, als sie behauptet. Es zaehlt nur ein Verzeichnis,
 * in dem wirklich Migrationen liegen.
 */
const REL = "sql/migrations";
const MIG_MUSTER = /^\d{3}[a-z]?_.+\.sql$/;

function hatMigrationen(wurzel) {
  try {
    return fs.readdirSync(path.join(wurzel, REL)).some((f) => MIG_MUSTER.test(f));
  } catch { return false; }
}

const KANDIDATEN = [process.cwd(), path.resolve(__dirname, "..", "..")];
const ROOT = KANDIDATEN.find(hatMigrationen) || KANDIDATEN[1];
const VERZEICHNIS = path.join(ROOT, REL);

const vorhanden = hatMigrationen(ROOT);
const suite = vorhanden ? describe : describe.skip;

/*
 * Nur Dateien ab dieser Nummer werden auf Doppelvergabe geprueft. Die aelteren
 * Doppelnummern (064, 070, 074, 075, 086) sind in NUMBERING.md dokumentiert und
 * duerfen ausdruecklich NICHT umbenannt werden — sie sind laengst angewandt,
 * und der Runner erkennt sie am Dateinamen wieder.
 */
const AB_HIER_SAUBER = 158;

function migrationen() {
  return fs.readdirSync(VERZEICHNIS)
    .filter((f) => MIG_MUSTER.test(f))
    .map((f) => ({ datei: f, nummer: Number(f.slice(0, 3)), suffix: /^\d{3}([a-z])/.exec(f)?.[1] || "" }));
}

suite("NUMBERING.md wird geprueft, nicht geglaubt", () => {

  it("nennt die tatsaechlich naechste freie Nummer", () => {
    const alle = migrationen();
    assert.ok(alle.length > 0, "keine Migrationsdateien gefunden — der Pfad stimmt nicht");

    const hoechste = Math.max(...alle.map((m) => m.nummer));
    const erwartet = hoechste + 1;

    const doku = fs.readFileSync(path.join(VERZEICHNIS, "NUMBERING.md"), "utf8");
    const m = /Next migration MUST start at:\s*\*{0,2}(\d{3})\*{0,2}/.exec(doku);
    assert.ok(m, "die Zeile 'Next migration MUST start at:' fehlt in NUMBERING.md");

    assert.equal(
      Number(m[1]), erwartet,
      `NUMBERING.md sagt ${m[1]}, das Verzeichnis sagt ${erwartet} ` +
      `(hoechste vergebene Nummer: ${hoechste}). Wer der Datei glaubt, vergibt eine benutzte Nummer.`
    );
  });

  it("nennt dieselbe Nummer auch in der Checkliste", () => {
    // Zwei Stellen, eine Wahrheit — die Checkliste weiter unten wiederholt die
    // Zahl. Genau dort ist sie beim letzten Mal ebenfalls stehengeblieben.
    const doku = fs.readFileSync(path.join(VERZEICHNIS, "NUMBERING.md"), "utf8");
    const oben = /Next migration MUST start at:\s*\*{0,2}(\d{3})/.exec(doku)?.[1];
    const liste = /Use the next sequential number \(currently \*{0,2}(\d{3})/.exec(doku)?.[1];
    assert.ok(liste, "die Checkliste nennt keine Nummer mehr");
    assert.equal(liste, oben, "Kopf und Checkliste nennen verschiedene Nummern");
  });

  it("vergibt seit 158 keine Nummer doppelt", () => {
    const neue = migrationen().filter((m) => m.nummer >= AB_HIER_SAUBER);
    const gesehen = new Map();
    const doppelte = [];
    for (const m of neue) {
      const schluessel = `${m.nummer}${m.suffix}`;
      if (gesehen.has(schluessel)) doppelte.push(`${gesehen.get(schluessel)} und ${m.datei}`);
      else gesehen.set(schluessel, m.datei);
    }
    assert.deepEqual(doppelte, [],
      "der Runner verfolgt Migrationen ueber den Dateinamen — zwei Dateien mit derselben " +
      "Nummer laufen beide, in alphabetischer Reihenfolge, und die beabsichtigte Abfolge geht verloren");
  });

  it("keine Migration liest eine CHECK-Bedingung mit einem Cast-Muster", () => {
    /*
     * WAS HIER SCHIEFGING (171_bounty_anstupser.sql, gefunden am 2026-08-10)
     * Die Migration las die bestehende Typliste aus notifications_type_check
     * mit dem Muster '([a-z_]+)'::text — der Form, die sie vorfand. Dann schrieb
     * sie die Bedingung ueber format(%L::text[]) neu, und PostgreSQL rendert sie
     * danach als EINE Zeichenkette: '{a,b,c}'::text[]. Beim zweiten Lauf fand
     * das Muster nichts, die Migration brach ab — und weil der Runner die ganze
     * Kette mit exit 1 beendet und der api-Dienst auf
     * service_completed_successfully wartet, startete die API nicht mehr.
     *
     * Eine Migration, die beim zweiten Lauf scheitert, ist eine Falle: der
     * Runner ueberspringt zwar Verbuchtes, aber jede Wiederherstellung, jeder
     * Teilabbruch und jede von Hand eingespielte Datei bringt sie zurueck.
     */
    const treffer = [];
    for (const m of migrationen().filter((x) => x.nummer >= AB_HIER_SAUBER)) {
      /*
       * Kommentare zuerst entfernen. 171 beschreibt das alte Muster in ihrer
       * eigenen Begruendung — ohne diesen Schritt prueft der Test die
       * Dokumentation statt den Code und meldet ausgerechnet die reparierte
       * Datei als defekt.
       */
      const code = fs.readFileSync(path.join(VERZEICHNIS, m.datei), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter((z) => !/^\s*--/.test(z)).join("\n");
      if (!/pg_get_constraintdef/.test(code)) continue;
      // Das Muster darf sich nicht auf den Cast je Einzelwert verlassen.
      if (/\[a-z_\]\+\)''::text'/.test(code)) treffer.push(m.datei);
    }
    assert.deepEqual(treffer, [],
      "diese Migration liest eine CHECK-Bedingung ueber ein Cast-Muster, das sie " +
      "durch ihr eigenes Schreiben zerstoert — beim zweiten Lauf bricht sie ab");
  });

  it("jede neue Migration nennt ihren Rueckweg", () => {
    /*
     * Ohne Rollback-Hinweis ist eine Migration eine Einbahnstrasse. Das steht
     * so in den Projektregeln ("Keine Migrations ohne Rollback-Plan") und wird
     * hier fuer alles ab 158 wirklich geprueft.
     */
    const ohne = [];
    for (const m of migrationen().filter((x) => x.nummer >= AB_HIER_SAUBER)) {
      const text = fs.readFileSync(path.join(VERZEICHNIS, m.datei), "utf8");
      if (!/rollback/i.test(text)) ohne.push(m.datei);
    }
    assert.deepEqual(ohne, [], "diese Migrationen nennen keinen Rueckweg");
  });
});
