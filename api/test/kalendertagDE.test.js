/**
 * Welle F3 — der Waechter gegen rohe UTC-Datumsschnitte.
 *
 * WARUM ES IHN GIBT
 * Welle F1 hat 33 Kalendertag-Fehler kartiert, F2 sie behoben. Ohne Waechter
 * waechst genau dasselbe nach: `.toISOString().slice(0,10)` ist die naheliegende
 * Schreibweise, sie sieht harmlos aus, und sie ist in einem DACH-Produkt fast
 * immer falsch.
 *
 * DIE URSACHE, verifiziert
 * `node-postgres` parst DATE-Spalten als LOKALE Mitternacht
 * (postgres-date/index.js:17), und der Container laeuft auf TZ=Europe/Berlin.
 * Lokale Mitternacht Berlin ist 22:00 bzw. 23:00 UTC des VORTAGS. Ein
 * UTC-Schnitt auf so einen Wert liefert deshalb GANZTAEGIG den falschen Tag —
 * nicht nur nachts, wie zunaechst vermutet.
 *
 * WAS DAS KOSTET (Beispiele aus der Kartierung)
 *   - Stundenzettel-CSV zeigt die Abrechnungswoche einen Tag zu frueh und
 *     landet so in der Lohnabrechnung
 *   - ein heute gueltiger Stundensatz wird nicht gefunden, ein gestern
 *     ausgelaufener noch angewendet
 *   - der letzte gearbeitete Tag vor der Abmeldung wird abgewiesen — nicht
 *     erfasste Arbeitsstunden
 *
 * DER RICHTIGE WEG
 *   Backend:  todayDE() / dateOnlyDE(wert)   aus api/utils/dateDE.js
 *   Frontend: TCDate.todayDE() / TCDate.isoDateDE(wert) / TCDate.mondayDE(wert)
 *             aus frontend/public/js/dateDE.js
 *
 * UEBERTRAGBAR: dieselbe Pruefung gehoert in jedes Folgeprojekt mit
 * DACH-Kalendertagen.
 *
 * Run: node --test --test-force-exit test/kalendertagDE.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { applyTypeParsers, DATE_OID } from "../db/typeParsers.js";
import { todayDE, dateOnlyDE } from "../utils/dateDE.js";
import { monatsfenster } from "../services/monatsplanService.js";

const pgTypen = pg.types;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen UND auf Inhalt pruefen. Blosse Existenz reicht nicht: Docker
 * legt Mount-Ziele als leere Verzeichnisse an, und ein leeres Verzeichnis macht
 * jede Pruefung lautlos gruen. Diese Falle ist in dieser Codebasis dreimal
 * zugeschnappt — einmal davon bei einem Waechter, den ich gerade erst dagegen
 * geschrieben hatte.
 */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "api/utils/dateDE.js"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const vorhanden = Boolean(ROOT);
const suite = vorhanden ? describe : describe.skip;

/** Die Schreibweisen, die einen Kalendertag aus einem Zeitpunkt schneiden. */
const MUSTER = [
  /\.toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*substring\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*substr\(\s*0\s*,\s*10\s*\)/,
  /\.toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/
];

/*
 * BEWUSSTE AUSNAHMEN — jede mit Begruendung.
 *
 * Hier ist UTC richtig und gewollt. Die Liste ist absichtlich kurz und
 * namentlich: eine Ausnahme ohne Begruendung waere eine Hintertuer, durch die
 * der naechste Fehler zurueckkommt.
 */
const AUSNAHMEN = [
  { datei: "api/utils/dateDE.js",
    grund: "der Helfer selbst — er rechnet den Schnitt korrekt um" },
  { datei: "frontend/public/js/dateDE.js",
    grund: "das Browser-Gegenstueck, gleiche Begruendung" },
  { datei: "api/test/",
    grund: "Testdateien duerfen den falschen Fall absichtlich herstellen, um ihn zu pruefen" },
  { datei: "e2e/",
    grund: "End-to-End-Tests, gleiche Begruendung" }
];

function istAusgenommen(rel) {
  return AUSNAHMEN.some((a) => rel === a.datei || rel.startsWith(a.datei));
}

/*
 * GRUNDLINIE — Stand nach Welle F2 (2026-08-13), CRLF-Korrektur 2026-08-15.
 *
 * Diese Zahl ist KEIN Ziel, sondern eine Obergrenze. Sie umfasst die Stellen,
 * die F1 ausdruecklich als harmlos eingestuft hat: technische UTC-Buckets,
 * Zeitstempel, Idempotenz-Schluessel. Die 33 echten Kalendertag-Fehler sind in
 * F2 behoben.
 *
 * 2026-08-15: Grundlinie 39 → 36 nach Bugfix im Kommentarstripper (CRLF).
 * Der Stripper /\/\/.*$/ schlug auf Windows-Repos lautlos fehl, weil `.` kein
 * `\r` matcht und `$` nicht hinter das `\r` ansteuern kann. Dadurch wurden
 * 4 Kommentarzeilen (F2-Erlaeuterungskommentare mit toISOString-Beispielen)
 * faelschlich als Fundstellen gezaehlt. Der Fix (replace(/\r$/, "")) gibt den
 * korrekten Stand zurueck.
 *
 * Wer sie ANHEBT, muss das im Commit begruenden. Wer Stellen behebt, senkt sie.
 */
const GRUNDLINIE = 36;

/** Sammelt Quelldateien, ohne node_modules und Build-Ausgaben. */
function dateien(unter, endungen) {
  const basis = path.join(ROOT, unter);
  if (!fs.existsSync(basis)) return [];
  const out = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (endungen.some((x) => e.name.endsWith(x))) out.push(p);
    }
  };
  lauf(basis);
  return out;
}

function fundstellen() {
  const treffer = [];
  const quellen = [
    ...dateien("api/services", [".js"]),
    ...dateien("api/routes", [".js"]),
    ...dateien("api/utils", [".js"]),
    ...dateien("api/jobs", [".js"]),
    ...dateien("frontend/public", [".js", ".html"])
  ];

  for (const datei of quellen) {
    const rel = path.relative(ROOT, datei).replace(/\\/g, "/");
    if (istAusgenommen(rel)) continue;

    const zeilen = fs.readFileSync(datei, "utf8").split("\n");
    zeilen.forEach((zeile, i) => {
      // Kommentare erklaeren das Problem oft — sie sind kein Fehler.
      // \r entfernen: CRLF-Repos liefern nach split('\n') ein \r am Zeilenende,
      // das `$` in `/\/\/.*$/` nicht ansteuern kann (`.` matcht kein \r) —
      // der Kommentarstreifen schlaegt lautlos fehl und Muster in Kommentaren
      // werden faelschlich als Treffer gewertet.
      const ohneKommentar = zeile.replace(/\r$/, "").replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      if (MUSTER.some((m) => m.test(ohneKommentar))) {
        treffer.push(rel + ":" + (i + 1));
      }
    });
  }
  return treffer;
}

suite("Welle F3 — kein roher UTC-Schnitt auf Kalendertagen", () => {

  it("die Helfer sind da, wo sie hingehoeren", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "api/utils/dateDE.js")),
      "das Backend braucht todayDE/dateOnlyDE");
    assert.ok(fs.existsSync(path.join(ROOT, "frontend/public/js/dateDE.js")),
      "das Frontend braucht sein eigenes Gegenstueck — sonst wird der Helfer je Seite kopiert");
  });

  /*
   * WARUM EINE GRUNDLINIE UND KEIN VERBOT
   *
   * Ein pauschales Verbot waere falsch: nicht jeder UTC-Schnitt ist ein Fehler.
   * Zeitstempel, Idempotenz-Schluessel und bewusst UTC-konsistente
   * Analytics-Buckets duerfen und sollen so bleiben. Die Kartierung (F1) hat
   * genau das getrennt — 33 echte Fehler, 29 Stellen belegt harmlos.
   *
   * Jede harmlose Stelle einzeln in eine Ausnahmeliste zu schreiben, wuerde
   * genau die Muellhalde erzeugen, vor der der Test unten warnt: eine Liste, die
   * niemand mehr liest und durch die der naechste echte Fehler
   * unbemerkt durchrutscht.
   *
   * Deshalb eine Zahl, die nur SINKEN darf. Das laesst die harmlosen Stellen in
   * Ruhe, faengt aber jeden neuen Schnitt — und macht sichtbar, wenn jemand die
   * Grundlinie anhebt, statt sie zu senken.
   */
  it("die Zahl roher Schnitte waechst nicht", () => {
    const treffer = fundstellen();
    assert.ok(
      treffer.length <= GRUNDLINIE,
      `Es gibt jetzt ${treffer.length} rohe UTC-Datumsschnitte, die Grundlinie ist ` +
      `${GRUNDLINIE}. Neu hinzugekommen ist mindestens einer.\n\n` +
      `In einem DACH-Produkt ist ein UTC-Schnitt auf einem Kalendertag der Vortag — ` +
      `bei Werten aus DATE-Spalten sogar ganztaegig, weil node-postgres sie als ` +
      `lokale Mitternacht liefert.\n` +
      `Richtig: todayDE()/dateOnlyDE(wert) im Backend, ` +
      `TCDate.todayDE()/TCDate.isoDateDE(wert) im Frontend.\n` +
      `Ist UTC hier ausnahmsweise gewollt (Zeitstempel, Idempotenz, bewusster ` +
      `UTC-Bucket), sag das im Code mit einem Kommentar — und hebe die Grundlinie ` +
      `NICHT an, ohne es im Commit zu begruenden.\n\n` +
      `Aktuelle Fundstellen:\n  ${treffer.join("\n  ")}`
    );
  });

  it("gesunkene Grundlinie wird nachgezogen", () => {
    /*
     * Die Gegenrichtung: wer Stellen behebt, soll die Grundlinie senken. Sonst
     * verliert sie ihre Wirkung — eine zu hohe Zahl faengt nichts mehr.
     * Toleranz von 3, damit nicht jede einzelne Behebung diesen Test rot macht.
     */
    const treffer = fundstellen();
    assert.ok(
      treffer.length >= GRUNDLINIE - 3,
      `Nur noch ${treffer.length} Fundstellen, die Grundlinie steht auf ${GRUNDLINIE}. ` +
      `Bitte GRUNDLINIE in diesem Test auf ${treffer.length} senken — eine zu hohe ` +
      `Grundlinie faengt nichts mehr.`
    );
  });

  it("jede Ausnahme traegt eine Begruendung", () => {
    // Eine Ausnahmeliste ohne Begruendungen verkommt zur Muellhalde.
    for (const a of AUSNAHMEN) {
      assert.ok(a.grund && a.grund.length > 20,
        `Ausnahme ${a.datei} hat keine tragfaehige Begruendung`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Die EINE Zeile, an der jeder Kalendertag der Plattform haengt.

   `db/typeParsers.js` setzt den pg-Parser fuer DATE (OID 1082) auf
   Durchreichen, damit eine Datumsspalte als "2026-04-01" in der Antwort steht
   statt als "2026-03-31T22:00:00.000Z". `pg` haelt Typparser MODULWEIT — der
   Import in `db/pool.js` wirkt deshalb fuer jeden Pool im Prozess.

   Genau das macht ihn gefaehrlich: die Zeile sieht aus wie ein unbenutzter
   Import. Wer sie beim Aufraeumen entfernt, dreht in EINEM Schritt jedes Datum
   der ganzen Plattform auf den Vortag zurueck — Vertragsende, Sperrdatum,
   Abrechnungswoche. Kein Test schlaegt an, der nicht genau hierauf zeigt.

   GEFUNDEN 2026-08-31 beim Bauen von K3.5: eine Messung mit einem SELBST
   gebauten `pg.Pool` (ohne diesen Import) lieferte Zeitstempel und sah aus wie
   ein Produktfehler. War keiner — aber sie hat gezeigt, wie duenn die
   Absicherung dieser Zeile ist.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Kalendertag · der Typparser haengt an einer einzigen Zeile", () => {
  const poolPfad = path.join(ROOT, "api", "db", "pool.js");
  const parserPfad = path.join(ROOT, "api", "db", "typeParsers.js");

  it("db/pool.js laedt die Typparser — sonst kippt jedes Datum der Plattform", () => {
    assert.ok(fs.existsSync(poolPfad), "api/db/pool.js muss es geben");

    /* OHNE KOMMENTARE PRUEFEN. Beim Rueckmutieren dieser Probe ist sie genau
     * hier durchgefallen — auf die Falle, vor der diese Datei weiter oben selbst
     * warnt: die auskommentierte Zeile `// import "./typeParsers.js";` enthaelt
     * den gesuchten Text weiterhin, und ein Muster ohne Kommentarstreifen haelt
     * sie fuer einen gueltigen Import. Ein Waechter, der ein Auskommentieren
     * nicht bemerkt, bewacht nichts. */
    const quelle = fs.readFileSync(poolPfad, "utf8")
      .split(/\r?\n/)
      .map((zeile) => zeile.replace(/\/\/.*$/, ""))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    assert.match(
      quelle,
      /import\s+["'](\.\/)?typeParsers\.js["']/,
      "ohne diesen Import liefert JEDE DATE-Spalte wieder einen UTC-Zeitpunkt — "
        + "und jede UTC-Formatierung zeigt den Vortag"
    );
  });

  it("der Parser setzt DATE auf Durchreichen und laesst Zeitpunkte in Ruhe", () => {
    const quelle = fs.readFileSync(parserPfad, "utf8");
    assert.match(quelle, /setTypeParser\(\s*DATE_OID\s*,/,
      "DATE (OID 1082) muss unveraendert durchgereicht werden");
    assert.ok(
      !/setTypeParser\(\s*(1114|1184)\b/.test(quelle),
      "timestamp und timestamptz sind echte Zeitpunkte — die UTC-Serialisierung "
        + "ist dort richtig und darf nicht mitgeaendert werden"
    );
    assert.ok(
      !/setTypeParser\(\s*1700\b/.test(quelle),
      "numeric bleibt Zeichenkette — Geldbetraege verlieren sonst Praezision"
    );
  });

  it("die Zusage gilt fuer JEDEN Pool im Prozess, nicht nur den der App", () => {
    /* Der Beweis am lebenden Objekt: nach dem Import steht der Parser fuer die
     * DATE-OID auf Durchreichen — unabhaengig davon, wer den Pool gebaut hat.
     * Genau diese Eigenschaft ist der Grund, warum EIN Import genuegt. */
    assert.equal(pgTypen.getTypeParser(DATE_OID)("2026-04-01"), "2026-04-01",
      "ein Kalendertag muss als Kalendertag herauskommen");
    assert.equal(applyTypeParsers(), false,
      "der Aufruf ist idempotent — ein zweiter Aufruf darf nichts mehr setzen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Greift Europe/Berlin ueberhaupt? — die Frage hinter allen anderen

   `dateDE.js` bittet um `timeZone: "Europe/Berlin"`. DASS die Bitte erfuellt
   wird, haengt an der ICU-Datenbank, die in Node steckt — nicht an der
   Systemzeitzone. Gemessen 2026-09-01 im API-Container: `TZ=Europe/Berlin` ist
   gesetzt, aber `date` meldet UTC, weil dem Abbild die tzdata fehlt. Node hat
   volles ICU (77.1) und rechnet trotzdem richtig.

   DAS IST EINE DUENNE STELLE. Ein Abbild mit `--with-intl=small-icu`, ein
   schlankeres Basis-Abbild, ein Node-Wechsel — und `Intl` faellt still auf UTC
   zurueck. Es gaebe keinen Fehler, keine Warnung: jeder Kalendertag der
   Plattform ruecke nur nachts um einen Tag. Vertragsende, Sperrdatum,
   Abrechnungswoche.

   Die beiden Zeitpunkte unten sind so gewaehlt, dass sie GENAU DANN falsch
   werden: 23:30 UTC ist in Berlin bereits der Folgetag — im Winter (+1) wie im
   Sommer (+2). Faellt die Zeitzone weg, liefern sie den Vortag.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("Kalendertag · Europe/Berlin muss wirklich greifen, nicht nur erbeten sein", () => {
  it("volles ICU ist vorhanden — sonst kennt Node die Zeitzone gar nicht", () => {
    assert.ok(process.versions.icu,
      "ohne ICU-Daten faellt jede Zeitzonen-Angabe still auf UTC zurueck");
    const zonen = Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" })
      .resolvedOptions().timeZone;
    assert.equal(zonen, "Europe/Berlin",
      "die Zeitzone wurde nicht uebernommen — Intl rechnet dann in UTC");
  });

  it("die Zeitzone ist AUSDRUECKLICH gesetzt, nicht vom Rechner geerbt", () => {
    /* DIESE PROBE GAB ES ZUERST NICHT, und beim Rueckmutieren ist genau das
     * aufgefallen: `timeZone: undefined` blieb unbemerkt gruen. Der Grund ist
     * unangenehm — `Intl` faellt dann auf die SYSTEMZEITZONE zurueck, und die
     * ist auf diesem Rechner zufaellig Europe/Berlin. Im Container ohne tzdata,
     * auf einem UTC-Server oder in CI waere sie es nicht, und jeder Kalendertag
     * ruecke nachts um einen Tag.
     *
     * Der Unterschied zwischen "ausdruecklich Berlin" und "zufaellig Berlin"
     * ist im laufenden Prozess nicht messbar. Deshalb ein KINDPROZESS mit
     * TZ=UTC: dort trennt sich beides. */
    const skript =
      "import { dateOnlyDE } from './utils/dateDE.js';"
      + "console.log(dateOnlyDE(new Date('2026-03-31T23:30:00Z')));";
    const ergebnis = spawnSync(
      process.execPath, ["--input-type=module", "-e", skript],
      { cwd: path.join(ROOT, "api"), env: { ...process.env, TZ: "UTC" },
        encoding: "utf8" }
    );
    assert.equal(ergebnis.status, 0,
      "der Kindprozess ist gescheitert:\n" + (ergebnis.stderr || "").slice(0, 400));
    assert.equal((ergebnis.stdout || "").trim(), "2026-04-01",
      "mit TZ=UTC kam der Vortag heraus — die Zeitzone wird also vom Rechner "
        + "geerbt statt in dateDE.js ausdruecklich gesetzt");
  });

  it("23:30 UTC ist in Berlin schon der Folgetag — im WINTER", () => {
    // 31.01.2026, 23:30 UTC = 01.02.2026, 00:30 Berlin (MEZ, +1)
    assert.equal(dateOnlyDE(new Date("2026-01-31T23:30:00Z")), "2026-02-01",
      "ohne Zeitzone stuende hier der 31.01. — ein Tag zu frueh");
  });

  it("23:30 UTC ist in Berlin schon der Folgetag — im SOMMER", () => {
    // 31.03.2026, 23:30 UTC = 01.04.2026, 01:30 Berlin (MESZ, +2)
    assert.equal(dateOnlyDE(new Date("2026-03-31T23:30:00Z")), "2026-04-01",
      "ohne Zeitzone stuende hier der 31.03. — ein Tag zu frueh");
  });

  it("die Sommerzeit-Umstellung selbst verschiebt keinen Kalendertag", () => {
    /* In der Nacht zum 29.03.2026 springt Berlin von 02:00 auf 03:00. Ein
     * Zeitpunkt kurz davor und kurz danach gehoert zu DEMSELBEN Kalendertag —
     * eine Rechnung, die Stunden addiert statt Tage, faellt hier auf. */
    assert.equal(dateOnlyDE(new Date("2026-03-29T00:30:00Z")), "2026-03-29");
    assert.equal(dateOnlyDE(new Date("2026-03-29T01:30:00Z")), "2026-03-29");
    assert.equal(dateOnlyDE(new Date("2026-03-29T22:30:00Z")), "2026-03-30",
      "22:30 UTC ist im Sommer bereits 00:30 des Folgetages");
  });

  it("todayDE liefert einen Kalendertag, keinen Zeitstempel", () => {
    assert.match(todayDE(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("der Monatsplan haengt an genau diesem Helfer", () => {
    /* Ohne Argument nimmt `monatsfenster` den laufenden Monat aus `todayDE()`.
     * Kippte die Zeitzone, waere am Monatsersten vor 01:00 bzw. 02:00 der
     * VORMONAT aufgeschlagen — und niemand saehe, warum. */
    const f = monatsfenster();
    assert.equal(f.monat, todayDE().slice(0, 7));
    assert.equal(f.von, f.monat + "-01");
  });
});
