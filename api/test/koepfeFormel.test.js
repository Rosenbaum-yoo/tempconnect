/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.4 — DIE MARKTZAHL ZAEHLT MENSCHEN, NICHT ANGEBOTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe zu M4c: Volumen entsteht durch DARSTELLUNGEN, nie durch
 * mehrfache Verfuegbarkeit. Das Beispiel im Plan: "128 verfuegbare Kraefte" darf
 * nicht entstehen, weil 32 Menschen je vier Faehigkeiten tragen.
 *
 * Bis M4c.4 summierten alle fuenf Aggregate die Kopfzahl der ANGEBOTE. Solange
 * jeder Mensch hoechstens ein Angebot hatte, war das dasselbe. Seit M4c.1 traegt
 * eine Kraft mit vier Faehigkeiten FUENF Darstellungen — vier Einzelangebote und
 * ein Gesamtangebot.
 *
 * Diese Datei prueft OHNE Datenbank: die Form der Formel, ihre Verwendung in
 * allen fuenf Aggregaten, und dass die Abfragen die Spalte mitfuehren, ohne die
 * die Gruppe keine Menschen zaehlen kann. Den Beweis der WIRKUNG fuehrt
 * `test/integration/marktzahlZaehltMenschen.flow.test.js` gegen die echte
 * Datenbank — und die Lehre aus M4c.15 gilt: eine Zusicherung, die nur mit
 * Datenbank laeuft, ist im Tor keine.
 *
 * Run: node --test test/koepfeFormel.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verfuegbareKoepfeSql } from "../services/koepfeFormel.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const quelle = (rel) => fs.readFileSync(path.join(HIER, "..", rel), "utf8");
/* Ohne Kommentare: eine Probe, die ihre eigene Begruendung liest, misst sich
   selbst — dieselbe Falle wie beim DO-NOTHING-Waechter in marktSichtbarkeit. */
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("M4c.4 · die Formel selbst", () => {
  const f = verfuegbareKoepfeSql("rest_sql", "cp.worker_profile_id");

  it("personengebundene Angebote zaehlen den MENSCHEN, nicht die Zeilen", () => {
    /* Der Kern: COUNT(DISTINCT ...) statt SUM(...). Ohne DISTINCT zaehlte eine
       Kraft mit vier Faehigkeiten fuenfmal — vier Einzelangebote und ihr
       Gesamtangebot. */
    assert.ok(f.includes("COUNT(DISTINCT cp.worker_profile_id)"),
      "die Menschen werden nicht ueber COUNT(DISTINCT ...) gezaehlt");
    assert.ok(!/SUM\(rest_sql\)/.test(f),
      "die Kopfzahl personengebundener Zeilen wird noch summiert — ein Mensch zaehlt mehrfach");
  });

  it("pauschale Angebote zaehlen ihre FREIE Kopfzahl — dort nennt niemand einen Menschen", () => {
    /* Die alten `legacy`-Eintraege und "pauschal N Helfer ohne konkrete
       Personen" (Mig 146 erlaubt sie ausdruecklich) tragen kein Profil. Dort IST
       die Kopfzahl die Zahl der Menschen. Gemessen am 2026-09-26: von 32
       beworbenen Koepfen waren 31 pauschal. */
    assert.ok(f.includes("WHEN cp.worker_profile_id IS NULL THEN rest_sql ELSE 0 END"),
      "pauschale Angebote werden nicht mit ihrer freien Kopfzahl gezaehlt");
    assert.ok(f.includes("COALESCE(SUM("),
      "ohne COALESCE ist die Summe einer leeren Gruppe NULL und die ganze Zahl NULL");
  });

  it("die beiden Teile werden ADDIERT, nicht ersetzt", () => {
    /* Ohne den zweiten Summanden verschwaenden die pauschalen Angebote aus der
       Marktzahl — heute waeren das 31 von 32 Koepfen. Ohne den ersten waeren es
       die personengebundenen. */
    assert.match(f, /COUNT\(DISTINCT cp\.worker_profile_id\)\s*\+\s*COALESCE\(SUM\(/,
      "die beiden Teile sind nicht durch + verbunden");
    assert.ok(f.trim().endsWith("::int"), "das Ergebnis ist keine ganze Zahl");
  });

  it("ein Mensch kann nicht in BEIDEN Summanden auftauchen", () => {
    /* Der eine zaehlt `IS NOT NULL` (implizit ueber DISTINCT), der andere
       ausdruecklich `IS NULL`. Die Mengen schliessen einander aus — nur deshalb
       ist die Summe eine Zahl und keine Schaetzung. */
    const zweiter = f.slice(f.indexOf("COALESCE(SUM("));
    assert.ok(zweiter.includes("IS NULL"),
      "der zweite Summand grenzt sich nicht auf Zeilen OHNE Profil ein");
    assert.ok(!zweiter.includes("IS NOT NULL"),
      "der zweite Summand nimmt personengebundene Zeilen mit — sie zaehlten doppelt");
  });

  it("die Schranken lassen nur Ausdruecke und Spalten ein", () => {
    for (const boese of ["1); DROP TABLE capacity_posts; --", "'x'", "rest -- weg", "a;b"]) {
      assert.throws(() => verfuegbareKoepfeSql(boese), /KOEPFE_REST_UNGUELTIG/, `Rest durchgelassen: ${boese}`);
    }
    for (const boese of ["cp", "cp.a.b", "'x'.y", "cp.a OR TRUE", "$1"]) {
      assert.throws(() => verfuegbareKoepfeSql("rest", boese), /KOEPFE_SPALTE_UNGUELTIG/,
        `Spalte durchgelassen: ${boese}`);
    }
    assert.doesNotThrow(() => verfuegbareKoepfeSql("GREATEST(cp.headcount - 0, 0)", "je.worker_profile_id"));
  });
});

describe("M4c.4 · alle fuenf Aggregate benutzen sie", () => {
  const dienst = ohneKommentare(quelle("services/capacityDiscoveryService.js"));

  it("keines summiert mehr die Kopfzahl der Angebote", () => {
    /* Die Rueckmutation, um die es geht: `SUM(rest)` statt der Formel. Sie war
       an fuenf Stellen — ein Aggregat, das zurueckfaellt, faellt allein zurueck,
       und niemandem fiele auf, dass GENAU DIESE Zahl wieder Angebote zaehlt. */
    assert.ok(!/SUM\(\$\{REMAINING_HEADCOUNT_SQL\}\)/.test(dienst),
      "ein Aggregat summiert wieder die Kopfzahl der Angebote statt Menschen zu zaehlen");
    assert.ok(!/SUM\(je\.rest\)/.test(dienst),
      "das Faehigkeits-Aggregat summiert wieder Zeilen");
  });

  it("die Formel steht an jeder Stelle, an der `total_headcount` entsteht", () => {
    const stellen = [...dienst.matchAll(/AS total_headcount/g)];
    /* Vier Aggregate rechnen selbst; das fuenfte (`marktLuecke`) liest die Zahl
       von `aggregateByRole` und von den Bedarfen — der Bedarf ist eine gesuchte
       Kopfzahl und KEINE Zahl von Menschen im Markt. */
    assert.ok(stellen.length >= 5, `nur ${stellen.length} Stellen mit total_headcount gefunden`);
    const mitFormel = [...dienst.matchAll(/\$\{verfuegbareKoepfeSql\([^)]*\)\} AS total_headcount/g)];
    assert.equal(mitFormel.length, 5,
      `${mitFormel.length} von den Angebots-Aggregaten benutzen die Formel, erwartet 5`);
  });

  it("das Faehigkeits-Aggregat fuehrt das Profil durch die innere Auswahl", () => {
    /* `aggregateBySkill` entfaltet `skill_tags` und gruppiert danach. Ohne die
       Spalte in der inneren Auswahl kann die Gruppe keine Menschen zaehlen — und
       dann zaehlte eine Kraft unter JEDER ihrer Faehigkeiten doppelt: einmal
       fuer ihr Einzelangebot, einmal fuer ihr Gesamtangebot, das alle
       Faehigkeiten traegt. */
    const inner = dienst.slice(dienst.indexOf("SELECT TRIM(t.skill)"), dienst.indexOf(") je"));
    assert.ok(inner.includes("cp.worker_profile_id"),
      "die innere Auswahl fuehrt das Profil nicht mit");
    assert.ok(dienst.includes('verfuegbareKoepfeSql("je.rest", "je.worker_profile_id")'),
      "das Faehigkeits-Aggregat zaehlt nicht ueber die mitgefuehrte Profil-Spalte");
  });

  it("die Formel kommt aus dem geteilten Modul, nicht als Abschrift", () => {
    assert.ok(/import \{ verfuegbareKoepfeSql \} from "\.\/koepfeFormel\.js"/.test(dienst),
      "die Formel wird nicht importiert — dann steht sie als Abschrift da");
    assert.ok(!/COUNT\(DISTINCT cp\.worker_profile_id\)/.test(dienst),
      "es steht eine eigene Fassung der Formel im Dienst");
  });
});
