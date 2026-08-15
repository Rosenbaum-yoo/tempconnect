#!/usr/bin/env node
/**
 * Mutation-Triage — wertet die ueberlebenden Mutanten je Datei x Art aus und
 * prueft, dass jeder einzelne Fall eine Einstufung traegt.
 *
 * WARUM DAS EIN SKRIPT IST UND KEINE TABELLE IN EINER DOKU
 * Der Bericht (`ergebnis.json`) nennt 112 Ueberlebende, aufgeschluesselt nur
 * global nach Art. Ohne Aufschluesselung je Datei laesst sich die Reihenfolge der
 * Aufraeum-Wellen nicht begruenden — man raet, und Raten heisst hier: die 45
 * billigen Textmutanten zuerst erschlagen und die teuren stehen lassen. Dann
 * steigt der Prozentwert und die Aussage sinkt.
 *
 * Deshalb: eine Einstufung je Fall (`triage.json`), maschinell gegen den Bericht
 * gehalten. Faellt ein Fall durch, ist die Doku nicht mehr belegbar — und der
 * Lauf rot.
 *
 * Kategorien (aus docs/features/P12_MUTATION_AUFRAEUMEN.md):
 *   A — muss einen Test bekommen: koennte Zugriff, Geld, Nachweis oder
 *       Mandantengrenze verschieben
 *   B — bewusst ohne Test, mit Begruendung: Text, Protokoll, Formatierung
 *   C — Testluecke ohne Risiko: testbar, lohnt aber nicht (oder aequivalent)
 *
 * Die Verknuepfung Bericht <-> Einstufung laeuft ueber die POSITION im Feld
 * `ueberlebende`, nicht ueber Datei+Zeile: mehrere Mutanten teilen sich dieselbe
 * Zeile (z. B. zwei Regex-Anker in Zeile 28), Datei+Zeile ist also kein
 * Schluessel. Die Pruefung vergleicht zusaetzlich Datei, Zeile und Mutator je
 * Position — verschiebt sich der Bericht, wird es rot statt still falsch.
 *
 * Aufruf:  node scripts/mutation-triage.js
 * Exit 0 = jeder Fall eingestuft, Bericht und Einstufung deckungsgleich
 * Exit 1 = Luecke oder Abweichung (Meldung nennt die Position)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DOK_DIR = join(import.meta.dirname, "..", "..", "docs", "qualitaet", "mutation", "2026-08-14-rbac");
export const ERGEBNIS_PFAD = join(DOK_DIR, "ergebnis.json");
export const TRIAGE_PFAD = join(DOK_DIR, "triage.json");
export const TRIAGE_MD_PFAD = join(DOK_DIR, "TRIAGE.md");

export const KATEGORIEN = ["A", "B", "C"];

/**
 * Mutatoren, die die Direktive als "Entscheidungslogik" zaehlt. Rein mechanisch —
 * daraus stammt die Zahl 28 im Bericht (20 ConditionalExpression + 8 LogicalOperator).
 *
 * WICHTIG: Diese Menge ist NICHT dasselbe wie das Feld `entscheidungszweig` in der
 * Einstufung. Beides auseinanderzuhalten ist der halbe Sinn dieser Auswertung:
 *
 *   - Die Art sagt, wie Stryker den Knoten nennt. Ein `orgId || null` INNERHALB einer
 *     Protokoll-Nutzlast ist eine ConditionalExpression und entscheidet trotzdem nichts.
 *   - Das Feld sagt, ob die Mutation in einer Verzweigung sitzt, die Verhalten steuert.
 *     Das kann auch ein StringLiteral sein — `newRoleKey !== "owner"` entscheidet ueber
 *     den Letzter-Owner-Schutz, und mutiert wird dort der Vergleichswert.
 *
 * Deshalb wird die Art hier nur gezaehlt, nie gegen das Urteil erzwungen: eine Pruefung
 * "Mutator X muss entscheidungszweig=true haben" wuerde beide Begriffe verschmelzen und
 * genau die Faelle falsch zaehlen, wegen derer M0 ueberhaupt noetig war.
 */
export const ART_ENTSCHEIDUNGSLOGIK = new Set(["ConditionalExpression", "LogicalOperator"]);

export function lade(pfad) {
  return JSON.parse(readFileSync(pfad, "utf8"));
}

/**
 * Die Testdateien, die der Mutations-Lauf wirklich ausfuehrt — aus der
 * Konfiguration gelesen, nicht abgeschrieben. Eine Testdatei, die hier fehlt,
 * laeuft im Mutations-Lauf nicht mit: die Suite bliebe gruen und der Mutant
 * ueberlebte trotzdem. Genau diese Luecke soll niemand versehentlich aufreissen.
 */
export function MUTATIONS_TESTDATEIEN() {
  const konf = lade(join(import.meta.dirname, "..", "stryker.rbac.conf.json"));
  return (konf.commandRunner?.command || "").split(/\s+/).filter((w) => w.endsWith(".test.js"));
}

/**
 * Haelt Einstufung gegen Bericht. Gibt die Liste der Verstoesse zurueck
 * (leer = sauber). Wirft nie — der Aufrufer entscheidet ueber die Reaktion.
 */
export function pruefeTriage(ergebnis = lade(ERGEBNIS_PFAD), triage = lade(TRIAGE_PFAD)) {
  const verstoesse = [];
  const ueberlebende = ergebnis.ueberlebende || [];
  const faelle = triage.faelle || [];

  if (faelle.length !== ueberlebende.length) {
    verstoesse.push(
      `Anzahl weicht ab: Bericht hat ${ueberlebende.length} Ueberlebende, Einstufung hat ${faelle.length} Faelle.`
    );
  }

  const gesehen = new Set();
  for (const [i, fall] of faelle.entries()) {
    const ort = `Fall nr ${fall.nr ?? `<ohne nr, Position ${i}>`}`;

    if (typeof fall.nr !== "number") {
      verstoesse.push(`${ort}: nr fehlt oder ist keine Zahl.`);
      continue;
    }
    if (gesehen.has(fall.nr)) {
      verstoesse.push(`${ort}: nr doppelt vergeben.`);
      continue;
    }
    gesehen.add(fall.nr);

    const roh = ueberlebende[fall.nr];
    if (!roh) {
      verstoesse.push(`${ort}: keine Entsprechung im Bericht (nr ausserhalb 0..${ueberlebende.length - 1}).`);
      continue;
    }
    /*
     * ZWEI ANKER, NICHT EINER.
     *
     * `zeile_bericht` verankert den Fall an der MESSUNG vom 2026-08-14 — die ist
     * Geschichte und bewegt sich nie. `zeile` zeigt auf den HEUTIGEN Code und
     * wandert, sobald jemand Zeilen einfuegt (nachgefuehrt von
     * scripts/mutation-neuverankern.js).
     *
     * Bis zum 2026-08-15 war das dasselbe Feld. Das ging gut, solange am
     * Produktionscode nichts geaendert wurde — und brach in dem Moment, in dem
     * die drei Befunde M0-B6 bis M0-B8 Kommentare ergaenzten. Wer beide Rollen
     * in ein Feld legt, muss sich zwischen einem falschen Archiv und einem
     * blinden Gate entscheiden.
     */
    const berichtZeile = fall.zeile_bericht ?? fall.zeile;
    if (roh.datei !== fall.datei || roh.zeile !== berichtZeile || roh.mutator !== fall.mutator) {
      verstoesse.push(
        `${ort}: Bericht sagt ${roh.datei}:${roh.zeile} (${roh.mutator}), ` +
          `Einstufung sagt ${fall.datei}:${berichtZeile} (${fall.mutator}). ` +
          `Der Bericht hat sich verschoben — Einstufung neu zuordnen, nicht anpassen.`
      );
    }

    if (!KATEGORIEN.includes(fall.kategorie)) {
      verstoesse.push(`${ort}: Kategorie '${fall.kategorie}' ist keine von ${KATEGORIEN.join("/")}.`);
    }
    if (!fall.begruendung || fall.begruendung.trim().length < 40) {
      verstoesse.push(
        `${ort}: Begruendung fehlt oder ist zu kurz. Eine Einstufung ohne Begruendung ist eine Behauptung.`
      );
    }
    if (typeof fall.entscheidungszweig !== "boolean") {
      verstoesse.push(`${ort}: entscheidungszweig fehlt (true/false).`);
    }

    if (fall.kategorie === "A") {
      if (!["hoch", "mittel"].includes(fall.risiko)) {
        verstoesse.push(`${ort}: A ohne Risikostufe (hoch/mittel).`);
      }
      if (!fall.kill_durch || fall.kill_durch.trim().length < 20) {
        verstoesse.push(
          `${ort}: A ohne kill_durch. Ein A-Fall ohne benannten Test ist ein Vorsatz, kein Plan.`
        );
      }
      // Erledigt-Vermerk: erst gueltig, wenn er auf eine echte Testdatei zeigt.
      // Ein Haken ohne Beleg waere schlimmer als kein Haken — er beendet die Suche.
      if (fall.erledigt) {
        const { welle, test, am } = fall.erledigt;
        if (!welle || !test || !am) {
          verstoesse.push(`${ort}: erledigt braucht welle, test und am.`);
        } else if (!existsSync(join(import.meta.dirname, "..", test))) {
          verstoesse.push(`${ort}: erledigt verweist auf '${test}' — diese Testdatei gibt es nicht.`);
        } else if (!MUTATIONS_TESTDATEIEN().includes(test)) {
          verstoesse.push(
            `${ort}: '${test}' steht nicht im commandRunner von stryker.rbac.conf.json. ` +
              `Der Test laeuft im Mutations-Lauf nicht mit und toetet dort nichts.`
          );
        }
      }
    } else if (fall.erledigt) {
      verstoesse.push(`${ort}: nur A-Faelle werden erledigt — ${fall.kategorie} bekommt keinen Test.`);
    } else if (fall.kill_durch) {
      verstoesse.push(`${ort}: ${fall.kategorie} traegt kill_durch — dann ist es ein A.`);
    }
  }

  for (let nr = 0; nr < ueberlebende.length; nr++) {
    if (!gesehen.has(nr)) {
      const roh = ueberlebende[nr];
      verstoesse.push(
        `Fall nr ${nr} (${roh.datei}:${roh.zeile}, ${roh.mutator}) ist nicht eingestuft. ` +
          `Gate M0 verlangt eine Kategorie fuer JEDEN Fall.`
      );
    }
  }

  return verstoesse;
}

/** Aufschluesselung je Datei: Art, Kategorie, Entscheidungszweig. */
export function werteAus(ergebnis = lade(ERGEBNIS_PFAD), triage = lade(TRIAGE_PFAD)) {
  const proDatei = new Map();
  const proArt = new Map();

  for (const fall of triage.faelle || []) {
    const roh = (ergebnis.ueberlebende || [])[fall.nr];
    if (!roh) continue;

    if (!proDatei.has(roh.datei)) {
      proDatei.set(roh.datei, {
        datei: roh.datei,
        score: ergebnis.dateien?.[roh.datei]?.score ?? null,
        gesamt: 0,
        A: 0,
        B: 0,
        C: 0,
        A_hoch: 0,
        A_erledigt: 0,
        zweig: 0,
        zweig_offen: 0,
        art_logik: 0,
        arten: new Map(),
      });
    }
    const d = proDatei.get(roh.datei);
    d.gesamt++;
    d[fall.kategorie]++;
    if (fall.kategorie === "A" && fall.risiko === "hoch") d.A_hoch++;
    if (fall.kategorie === "A" && fall.erledigt) d.A_erledigt++;
    if (fall.entscheidungszweig) {
      d.zweig++;
      if (fall.kategorie === "A") d.zweig_offen++;
    }
    if (ART_ENTSCHEIDUNGSLOGIK.has(roh.mutator)) d.art_logik++;
    d.arten.set(roh.mutator, (d.arten.get(roh.mutator) || 0) + 1);
    proArt.set(roh.mutator, (proArt.get(roh.mutator) || 0) + 1);
  }

  const dateien = [...proDatei.values()].sort((a, b) => b.A - a.A || b.A_hoch - a.A_hoch);
  return {
    dateien,
    arten: [...proArt.entries()].sort((a, b) => b[1] - a[1]),
    summe: dateien.reduce(
      (s, d) => ({
        gesamt: s.gesamt + d.gesamt,
        A: s.A + d.A,
        B: s.B + d.B,
        C: s.C + d.C,
        A_hoch: s.A_hoch + d.A_hoch,
        A_erledigt: s.A_erledigt + d.A_erledigt,
        zweig: s.zweig + d.zweig,
        art_logik: s.art_logik + d.art_logik,
      }),
      { gesamt: 0, A: 0, B: 0, C: 0, A_hoch: 0, A_erledigt: 0, zweig: 0, art_logik: 0 }
    ),
    /** Reihenfolge der Wellen M1..Mn: nach A-Faellen, nicht nach Score. */
    reihenfolge: dateien.filter((d) => d.A > 0).map((d) => d.datei),
  };
}

/**
 * Optional: haelt den archivierten Auszug gegen den ROHBERICHT (75 MB, nicht
 * versioniert). Nur moeglich, solange der Lauf noch auf der Maschine liegt —
 * genau dann aber die staerkste Pruefung, die es gibt: sie beweist, dass
 * `ergebnis.json` und `triage.json` denselben Lauf beschreiben wie das Original
 * und nicht eine Abschrift, die sich verschoben hat.
 *
 * Ohne Rohbericht wird uebersprungen, nicht rot: das Archiv muss auch ohne die
 * 75 MB pruefbar bleiben, sonst waere die Archivierung sinnlos.
 */
export function pruefeGegenRohbericht(triage = lade(TRIAGE_PFAD), ergebnis = lade(ERGEBNIS_PFAD)) {
  const roh = join(import.meta.dirname, "..", "reports", "mutation", "rbac", "mutation.json");
  if (!existsSync(roh)) return { vorhanden: false, verstoesse: [] };

  const bericht = JSON.parse(readFileSync(roh, "utf8"));
  const verstoesse = [];
  const ueberlebende = [];

  for (const [datei, f] of Object.entries(bericht.files)) {
    for (const m of f.mutants) {
      if (m.status === "Survived") {
        ueberlebende.push({ datei, id: m.id, zeile: m.location.start.line, spalte: m.location.start.column, mutator: m.mutatorName });
      }
    }
  }

  if (ueberlebende.length !== ergebnis.gesamt.ueberlebt) {
    verstoesse.push(
      `Rohbericht nennt ${ueberlebende.length} Ueberlebende, das Archiv ${ergebnis.gesamt.ueberlebt}.`
    );
  }

  const schluessel = new Set(ueberlebende.map((u) => `${u.datei}|${u.zeile}|${u.spalte}|${u.mutator}`));
  for (const fall of triage.faelle || []) {
    if (fall.spalte === undefined) continue;
    const k = `${fall.datei}|${fall.zeile}|${fall.spalte}|${fall.mutator}`;
    if (!schluessel.has(k)) {
      verstoesse.push(`Fall nr ${fall.nr}: ${k} kommt im Rohbericht nicht als Ueberlebender vor.`);
    }
  }

  return { vorhanden: true, verstoesse, ueberlebende: ueberlebende.length };
}

/**
 * Das Gate einer Welle: haelt den Bericht des Wellen-Laufs gegen die Einstufung.
 *
 * Die Frage einer Welle ist nicht "ist der Score gestiegen", sondern: **lebt noch
 * ein A-Fall?** Diese Pruefung beantwortet sie mechanisch — inklusive der beiden
 * Faelle, die man von Hand uebersieht:
 *   - ein A-Fall, der weiterlebt, obwohl ein Test fuer ihn geschrieben wurde
 *     (der Test prueft dann das Ergebnis statt die Mutation),
 *   - ein Ueberlebender, den die Einstufung gar nicht kennt (neuer Mutant, weil
 *     sich der Quelltext bewegt hat — in P12 verboten, also ein Warnsignal).
 *
 * @param {string} ziel z. B. "services/rbacService.js"
 */
export function pruefeWelle(ziel, triage = lade(TRIAGE_PFAD)) {
  const kurz = ziel.split("/").pop().replace(/\.js$/, "");
  const pfad = join(import.meta.dirname, "..", "reports", "mutation", "welle", kurz, "mutation.json");
  if (!existsSync(pfad)) {
    return { vorhanden: false, hinweis: `Kein Wellen-Bericht unter reports/mutation/welle/${kurz}/.` };
  }

  const bericht = JSON.parse(readFileSync(pfad, "utf8"));
  const lebt = new Set();
  for (const [datei, f] of Object.entries(bericht.files)) {
    for (const m of f.mutants) {
      if (m.status === "Survived") {
        lebt.add(`${datei}|${m.location.start.line}|${m.location.start.column}|${m.mutatorName}`);
      }
    }
  }

  const faelle = (triage.faelle || []).filter((f) => f.datei === ziel);
  const schluessel = (f) => `${f.datei}|${f.zeile}|${f.spalte}|${f.mutator}`;

  const aLebtNoch = faelle.filter((f) => f.kategorie === "A" && lebt.has(schluessel(f)));
  const aTot = faelle.filter((f) => f.kategorie === "A" && !lebt.has(schluessel(f)));
  const bcTot = faelle.filter((f) => f.kategorie !== "A" && !lebt.has(schluessel(f)));

  const bekannt = new Set(faelle.map(schluessel));
  const unbekannt = [...lebt].filter((k) => k.startsWith(`${ziel}|`) && !bekannt.has(k));

  return {
    vorhanden: true,
    ziel,
    a_gesamt: faelle.filter((f) => f.kategorie === "A").length,
    a_tot: aTot,
    a_lebt_noch: aLebtNoch,
    /** B/C-Faelle, die ein Test nebenbei mit erschlagen hat — kostenlos mitgenommen. */
    bc_tot: bcTot,
    /** Ueberlebende, die die Einstufung nicht kennt. */
    unbekannt,
    bestanden: aLebtNoch.length === 0 && unbekannt.length === 0,
  };
}

/** Ausgabe des Wellen-Gates; beendet den Prozess mit 0 (bestanden) oder 1. */
function gateAusgeben(triage) {
  const idx = process.argv.indexOf("--welle");
  const ziel = process.argv[idx + 1];
  if (!ziel) {
    console.error("--welle braucht eine Datei, z. B. --welle services/rbacService.js");
    process.exit(1);
  }

  const w = pruefeWelle(ziel, triage);
  if (!w.vorhanden) {
    console.error(`\n${w.hinweis}\nZuerst messen: node scripts/mutation-welle.js ${ziel}\n`);
    process.exit(1);
  }

  console.log(`\n── Gate der Welle: ${ziel} ──\n`);
  console.log(`  A-Faelle gesamt:         ${w.a_gesamt}`);
  console.log(`  davon jetzt getoetet:    ${w.a_tot.length}`);
  console.log(`  davon noch am Leben:     ${w.a_lebt_noch.length}`);
  console.log(`  B/C nebenbei erschlagen: ${w.bc_tot.length}`);

  if (w.a_lebt_noch.length) {
    console.error(`\n  Diese A-Faelle leben trotz Test weiter:`);
    for (const f of w.a_lebt_noch) {
      console.error(`    nr ${f.nr}  ${f.datei}:${f.zeile}:${f.spalte}  ${f.mutator}`);
      console.error(`      erwartet war: ${f.kill_durch}`);
    }
    console.error(`\n  Ein Test, der gruen ist und den Mutanten leben laesst, prueft das Ergebnis`);
    console.error(`  statt die Mutation. Den Test schaerfen — nicht die Einstufung senken.`);
  }

  if (w.unbekannt.length) {
    console.error(`\n  Ueberlebende, die die Einstufung nicht kennt (${w.unbekannt.length}):`);
    for (const k of w.unbekannt) console.error(`    ${k.replace(/\|/g, ":")}`);
    console.error(`  Hat sich der Quelltext bewegt? P12 verbietet das ausdruecklich.`);
  }

  console.log(w.bestanden ? "\n  Gate bestanden: kein A-Fall lebt mehr.\n" : "\n  Gate NICHT bestanden.\n");
  process.exit(w.bestanden ? 0 : 1);
}

function tabelle(zeilen) {
  const breiten = zeilen[0].map((_, i) => Math.max(...zeilen.map((z) => String(z[i]).length)));
  return zeilen
    .map((z) => z.map((w, i) => (i === 0 ? String(w).padEnd(breiten[i]) : String(w).padStart(breiten[i]))).join("  "))
    .join("\n");
}

function main() {
  const ergebnis = lade(ERGEBNIS_PFAD);
  const triage = lade(TRIAGE_PFAD);

  // Das Wellen-Gate ist eine eigene Frage und beantwortet sie allein — die
  // Gesamtuebersicht davor waere hier nur Rauschen.
  if (process.argv.includes("--welle")) {
    gateAusgeben(triage);
    return;
  }

  const verstoesse = pruefeTriage(ergebnis, triage);
  const a = werteAus(ergebnis, triage);

  console.log(`\nMutation-Triage — Grundlage: ${triage.grundlage}\n`);

  console.log("Je Datei (sortiert nach A-Faellen — das ist die Wellen-Reihenfolge):\n");
  console.log(
    tabelle([
      ["Datei", "Score", "Ueberlebt", "A", "erledigt", "offen", "davon hoch", "B", "C", "im Zweig"],
      ...a.dateien.map((d) => [
        d.datei,
        d.score === null ? "-" : `${d.score}%`,
        d.gesamt,
        d.A,
        d.A_erledigt,
        d.A - d.A_erledigt,
        d.A_hoch,
        d.B,
        d.C,
        d.zweig,
      ]),
      [
        "GESAMT",
        "",
        a.summe.gesamt,
        a.summe.A,
        a.summe.A_erledigt,
        a.summe.A - a.summe.A_erledigt,
        a.summe.A_hoch,
        a.summe.B,
        a.summe.C,
        a.summe.zweig,
      ],
    ])
  );
  console.log(
    `\n  erledigt = A-Faelle mit einem Test, der genau diese Mutation toetet (${a.summe.A_erledigt}/${a.summe.A})` +
      "\n  im Zweig = beurteilt: sitzt in einer Verzweigung, die Verhalten steuert" +
      `\n  Zur Einordnung: mechanisch (Conditional/Logical) sind es ${a.summe.art_logik} — so entstand die Zahl 28 im Bericht.`
  );

  const offeneWellen = a.dateien.filter((d) => d.A > d.A_erledigt);
  if (offeneWellen.length) {
    console.log(`\nNaechste Welle: ${offeneWellen[0].datei} (${offeneWellen[0].A - offeneWellen[0].A_erledigt} offen)`);
  } else if (a.summe.A) {
    console.log("\nAlle A-Faelle haben einen Test. Gate der Mutation-Direktive: geschlossen.");
  }

  console.log("\nJe Art:\n");
  console.log(tabelle([["Art", "Anzahl"], ...a.arten.map(([k, v]) => [k, v])]));

  console.log("\nReihenfolge der Aufraeum-Wellen:");
  a.reihenfolge.forEach((d, i) => console.log(`  M${i + 1}  ${d}`));

  const roh = process.argv.includes("--roh") ? pruefeGegenRohbericht(triage, ergebnis) : null;
  if (roh) {
    console.log(
      roh.vorhanden
        ? `\nGegen den Rohbericht geprueft: ${roh.ueberlebende} Ueberlebende, ${roh.verstoesse.length} Abweichung(en).`
        : "\nRohbericht liegt nicht vor (75 MB, nicht versioniert) — Pruefung uebersprungen."
    );
    verstoesse.push(...roh.verstoesse);
  }

  if (verstoesse.length) {
    console.error(`\n${verstoesse.length} Verstoss/Verstoesse:\n`);
    for (const v of verstoesse) console.error(`  - ${v}`);
    console.error("");
    process.exit(1);
  }

  console.log(`\nAlle ${a.summe.gesamt} Faelle eingestuft, Bericht und Einstufung deckungsgleich.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
