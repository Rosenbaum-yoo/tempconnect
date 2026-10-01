#!/usr/bin/env node
/**
 * Welle W3 — der Generator. Erste Stufe: die Zahlen im Register.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES IHN GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `docs/PLATTFORM_REGISTER.md` nennt zu jeder Zahl den Befehl, der sie erzeugt.
 * Der Doku-Waechter (`api/test/dokuWaechter.test.js`, Z1) rechnet die
 * STRUKTURELLEN Zahlen nach — Router, Services, Migrationen — und wird rot,
 * wenn sie nicht mehr stimmen. Eine Zahl hat er dabei bewusst ausgelassen, mit
 * dieser Begruendung:
 *
 *   "BEWUSST NICHT GEPRUEFT: die Zahl der Testdateien. Sie aendert sich mit
 *    jedem neuen Test — dieser Waechter hat sie beim ersten Lauf selbst rot
 *    werden lassen, weil er sich mitzaehlt. Eine Zahl, die bei jeder normalen
 *    Arbeit Alarm schlaegt, trainiert dem Leser das Wegschauen an. Sie gehoert
 *    in den Generator (Welle W3), der sie fortschreibt, statt in eine Pruefung,
 *    die sie einfriert."
 *
 * Das Argument war richtig, und die Folge war absehbar: am 2026-08-22 stand im
 * Register "340 Backend-Testdateien", tatsaechlich waren es 359 — 19 daneben,
 * an drei Stellen, in einem Dokument, das laut eigenem Vorwort an Investoren
 * geht. Niemand hatte etwas falsch gemacht. Es hat nur niemand nachgezaehlt.
 *
 * Dieses Skript ist die Stelle, die nachzaehlt. Damit wird aus der Zahl wieder
 * etwas Pruefbares: `api/test/dokuGenerator.test.js` haelt das Register gegen
 * eine frische Rechnung, und die Fehlermeldung nennt EINEN Befehl als Loesung.
 * Ein Alarm mit Ein-Befehl-Fix trainiert kein Wegschauen an — ein Alarm ohne
 * Fix tut es.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ER ANFASST — UND WAS NIEMALS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nur, was ausdruecklich ihm gehoert. Jeder erzeugte Wert steht im Markdown
 * zwischen zwei unsichtbaren Marken:
 *
 *     <!--zahl:backend-testdateien-->359<!--/zahl-->
 *
 * Der Generator ersetzt ausschliesslich den Text ZWISCHEN diesen Marken. Er
 * kennt keine Ueberschriften, keine Absaetze, keine Tabellen — er kann
 * handgeschriebenen Text gar nicht erreichen. Das ist strenger als die
 * Vorgabe aus P11 ("kuratierte Bloecke bleiben unangetastet") und aus demselben
 * Grund: ein Generator, der einmal einen geschriebenen Satz gefressen hat, wird
 * nie wieder benutzt. Dieselbe Zahl darf in beliebig vielen Saetzen stehen —
 * jede Marke wird gepflegt, der Satz drumherum bleibt frei formulierbar.
 *
 * Laufen zwei Laeufe ohne Codeaenderung, entsteht kein Diff: aendert sich kein
 * Wert, wird die Datei ueberhaupt nicht geschrieben (Gate W3, Idempotenz).
 * Deshalb bleibt auch das Datum unter der Tabelle stehen — es wandert nur mit,
 * wenn sich wirklich etwas geaendert hat, und behauptet nie einen Lauf, der
 * nichts gefunden hat.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BENUTZUNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node api/scripts/doku-generieren.js            schreibt (nur bei Aenderung)
 *   node api/scripts/doku-generieren.js --pruefen  schreibt nichts, Exit 1 bei Drift
 *
 * `--pruefen` ist die Form fuer CI und fuer den Test. Sie fasst die Datei nicht
 * an und sagt zeilengenau, welcher Wert wie weit daneben liegt.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { todayDE } from "../utils/dateDE.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen UND auf Inhalt pruefen — dieselbe Vorsicht wie in den
 * Waechtern: Docker legt Mount-Ziele als leere Verzeichnisse an, und eine
 * Wurzel, die nur so aussieht, laesst jede Zaehlung auf 0 fallen. Ein
 * Generator, der 0 schreibt, richtet mehr Schaden an als einer, der gar nicht
 * laeuft.
 */
function findeWurzel() {
  for (const start of [process.cwd(), HIER]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const register = path.join(dir, "docs", "PLATTFORM_REGISTER.md");
      const tests = path.join(dir, "api", "test");
      if (
        fs.existsSync(register) && fs.statSync(register).size > 5000 &&
        fs.existsSync(tests) && fs.readdirSync(tests).some((f) => f.endsWith(".test.js"))
      ) {
        return dir;
      }
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const zaehle = (wurzel, rel, passt) => {
  const dir = path.join(wurzel, rel);
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).filter(passt).length;
};

/**
 * Die ableitbaren Werte. Je Eintrag: die Marke im Markdown, der Befehl aus der
 * Herkunfts-Spalte des Registers (damit Doku und Rechnung dasselbe sagen) und
 * die Rechnung selbst.
 *
 * Bewusst NICHT hier: Zahlen mit einer Ermessensentscheidung darin —
 * "Datenbanktabellen" ist um einen Treffer aus einem deutschen Kommentar
 * bereinigt, "Nutzerflaechen" zaehlt drei Vite-Einstiegsdateien nicht als
 * Flaeche mit. Was ein Mensch entschieden hat, darf ein Skript nicht
 * ueberschreiben; solche Zahlen bleiben handgepflegt und gehoeren in eine
 * Pruefung, nicht in eine Fortschreibung.
 */
export const WERTE = [
  {
    marke: "backend-testdateien",
    titel: "Backend-Testdateien",
    befehl: "ls api/test/*.test.js | wc -l",
    rechne: (w) => zaehle(w, "api/test", (f) => f.endsWith(".test.js")),
  },
  {
    marke: "e2e-testdateien",
    titel: "E2E-Testdateien",
    befehl: "ls e2e/tests/ | wc -l",
    rechne: (w) => zaehle(w, "e2e/tests", () => true),
  },
  {
    /*
     * Z3 (2026-09-27): DIESE ZAHL FEHLTE, und ihr Fehlen war nicht harmlos. Das
     * Register sagte "belegt sind nur die N Testdateien" und meinte damit
     * `api/test/*.test.js` — die datenbankgebundenen Ablaufproben unter
     * `api/test/integration/` zaehlten NICHT mit. Genau sie sind aber die, die
     * das Schema beweisen: ein Muster-Pool kann SQL nicht ausfuehren, und alle
     * Befunde der Welle Z (Spalten, die es nicht gibt) waren an ihm vorbei
     * gruen. Ein Register, das die Proben nicht fuehrt, die den Beweis tragen,
     * beschreibt seinen eigenen Nachweis zu klein.
     */
    marke: "ablaufproben",
    titel: "Ablauf-Proben (datenbankgebunden)",
    befehl: "ls api/test/integration/*.flow.test.js | wc -l",
    rechne: (w) => zaehle(w, "api/test/integration", (f) => f.endsWith(".flow.test.js")),
  },
  {
    /*
     * U6.2a (2026-10-01): DIESE ZAHL STAND ZWISCHEN ZWEI WAECHTERN.
     *
     * Sie war handgepflegt und wurde von `dokuWaechter.test.js` geprueft, aber
     * NICHT fortgeschrieben. Ergebnis beim Anlegen einer einzigen neuen
     * Dienstdatei (`poolMitgliedschaftSql.js`): der Generator meldete "alle 3
     * erzeugten Zahlen stimmen" — waehrend eine vierte Zahl in DERSELBEN Datei
     * veraltet war und nur der volle Prueflauf es sah. Zwei Haltungen zu einer
     * Zahl in einer Datei, und die eine deckte die andere zu.
     *
     * Es ist kein Ermessenswert: `ls api/services/ | wc -l` hat keine Ausnahme
     * und keine Bereinigung. Damit gehoert sie hierher, nicht in die
     * Handpflege. Die Pruefung in dokuWaechter bleibt stehen — sie ist jetzt
     * die Gegenprobe zur Fortschreibung, nicht ihr Ersatz.
     */
    marke: "servicedateien",
    titel: "Service-Dateien",
    befehl: "ls api/services/ | wc -l",
    rechne: (w) => zaehle(w, "api/services", (f) => f.endsWith(".js")),
  },
  {
    /*
     * U6.7a (2026-10-01): DIESELBE NAHT WIE BEI DEN DIENSTDATEIEN, einen Tag
     * spaeter wieder zugeschnappt. Die Zahl war handgepflegt und wurde von
     * `dokuWaechter.test.js` geprueft, aber nicht fortgeschrieben: eine einzige
     * neue Migration (227) liess das volle Tor rot werden, und zwar erst nach
     * zwanzig Minuten Laufzeit.
     *
     * Der SATZ um die Zahl bleibt handgepflegt - er nennt die hoechste vergebene
     * Nummer und die doppelt belegten, und das ist eine Ermessensfrage. Die ZAHL
     * ist keine: `ls sql/migrations/*.sql | wc -l` hat keine Ausnahme.
     * NUMBERING.md ist keine Migration und zaehlt nicht mit, weil sie nicht auf
     * .sql endet.
     */
    marke: "migrationsdateien",
    titel: "Migrationsdateien",
    befehl: "ls sql/migrations/*.sql | wc -l",
    rechne: (w) => zaehle(w, "sql/migrations", (f) => f.endsWith(".sql")),
  },
];

/** `<!--zahl:id-->WERT<!--/zahl-->` — Leerzeichen in den Marken sind erlaubt. */
const marke = (id) =>
  new RegExp(`(<!--\\s*zahl:${id}\\s*-->)([\\s\\S]*?)(<!--\\s*/zahl\\s*-->)`, "g");

/**
 * Rechnet alle Werte nach und vergleicht sie mit dem, was im Text steht.
 * Liefert je Marke: Ist-Wert im Dokument, Soll-Wert, Anzahl der Fundstellen.
 */
export function pruefe(wurzel, text) {
  const befunde = [];
  for (const w of WERTE) {
    const soll = w.rechne(wurzel);
    const stellen = [...text.matchAll(marke(w.marke))].map((m) => m[2].trim());
    befunde.push({
      ...w,
      soll,
      stellen,
      abweichend: soll === null || stellen.length === 0
        ? true
        : stellen.some((s) => s !== String(soll)),
    });
  }
  return befunde;
}

/**
 * Ersetzt ausschliesslich den Text zwischen den Marken.
 *
 * Exportiert, weil genau hier die Zusage steht, die der Generator geben muss:
 * alles ausserhalb der Marken bleibt Zeichen fuer Zeichen erhalten. Eine
 * Zusage, die man nicht einzeln pruefen kann, ist keine — `dokuGenerator.test.js`
 * laesst handgeschriebenen Text zehn Laeufe ueberstehen.
 */
export function fortschreiben(text, befunde) {
  let neu = text;
  for (const b of befunde) {
    if (b.soll === null) continue;
    neu = neu.replace(marke(b.marke), (_, auf, __, zu) => `${auf}${b.soll}${zu}`);
  }
  return neu;
}

function main() {
  const nurPruefen = process.argv.includes("--pruefen") || process.argv.includes("--check");
  const wurzel = findeWurzel();

  if (!wurzel) {
    console.error("[doku] Keine Wurzel gefunden — erwartet docs/PLATTFORM_REGISTER.md und api/test/.");
    process.exit(2);
  }

  const pfad = path.join(wurzel, "docs", "PLATTFORM_REGISTER.md");
  const text = fs.readFileSync(pfad, "utf8");
  const befunde = pruefe(wurzel, text);

  const ohneMarke = befunde.filter((b) => b.stellen.length === 0);
  if (ohneMarke.length) {
    console.error("[doku] Diese Werte haben im Register keine Marke — sie werden nirgends gepflegt:");
    for (const b of ohneMarke) console.error(`        ${b.titel}  (erwartet <!--zahl:${b.marke}-->…<!--/zahl-->)`);
    process.exit(2);
  }

  const drift = befunde.filter((b) => b.abweichend);

  if (!drift.length) {
    console.log(`[doku] Alle ${befunde.length} erzeugten Zahlen stimmen — nichts zu schreiben.`);
    return;
  }

  for (const b of drift) {
    console.log(`[doku] ${b.titel}: im Register ${[...new Set(b.stellen)].join("/")} ` +
      `→ nachgerechnet ${b.soll}   (${b.befehl})`);
  }

  if (nurPruefen) {
    console.error(`[doku] ${drift.length} Zahl(en) veraltet. Beheben mit: node api/scripts/doku-generieren.js`);
    process.exit(1);
  }

  /* Das Datum wandert nur mit, wenn sich wirklich etwas geaendert hat. Sonst
   * behauptete es einen Lauf, der nichts gefunden hat — und zerstoerte die
   * Idempotenz (Gate W3: zweiter Lauf ohne Codeaenderung = kein Diff). */
  let neu = fortschreiben(text, drift);
  neu = neu.replace(marke("stand"), (_, auf, __, zu) => `${auf}${todayDE()}${zu}`);

  if (neu === text) {
    console.log("[doku] Keine Marke getroffen — Datei unveraendert.");
    return;
  }

  fs.writeFileSync(pfad, neu);
  console.log(`[doku] docs/PLATTFORM_REGISTER.md fortgeschrieben (${drift.length} Zahl(en), Stand ${todayDE()}).`);
}

/* Nur ausfuehren, wenn direkt aufgerufen — der Test importiert WERTE/pruefe. */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
