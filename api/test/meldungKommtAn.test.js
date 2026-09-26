/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M4c.13 — JEDER TYP DER MATRIX MUSS IN DER POSITIVLISTE STEHEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER BEFUND, DEN ES NICHT WIEDER GEBEN DARF.
 *
 * `notificationMatrix` fuehrt 54 Ereignisse mit 41 verschiedenen Typen. Genau
 * EINES bildete auf einen Typ ab, den der CHECK auf `notifications.type` nicht
 * kennt: `worker.skills_awaiting_release -> worker_marktpraesenz`. Der INSERT
 * scheiterte mit 23514, und der Aufrufer schluckt den Fehler bewusst (die
 * Faehigkeiten sind gespeichert, eine gescheiterte Meldung darf das nicht
 * gefaehrden). Ergebnis: der Arbeiter traegt ein, die Zeitarbeitsfirma erfaehrt
 * es NIE, niemand gibt frei — eine plausible Mitursache dafuer, dass nur 3 von
 * 33 Kraeften eine freigegebene Faehigkeit trugen.
 *
 * WARUM DIESE PROBE OHNE DATENBANK LAEUFT, und das ist der Kern:
 *
 * Beide Seiten sind STATISCH LESBAR. Die Matrix steht im Modul, die Positivliste
 * in den Migrationen. Eine Probe, die dafuer eine Datenbank braucht, laeuft im
 * Tor nicht — und ein Befund, den nur ein Container findet, wird beim naechsten
 * neuen Typ wieder niemandem auffallen. Genau diese Lehre hat M4c.15 gekostet:
 * eine Zusicherung, die nur mit Datenbank rot werden kann, ist im Tor keine.
 *
 * DIE POSITIVLISTE WIRD AUS DEN MIGRATIONEN REKONSTRUIERT: die Grundliste aus
 * dem CREATE/ALTER mit dem ersten CHECK, danach jede Erweiterung, die ein
 * `neu TEXT[] := ARRAY[...]` anhaengt. Das ist genau der Weg, den die
 * Migrationen selbst gehen — sie lesen die bestehende Liste und ergaenzen.
 *
 * Run: node --test test/meldungKommtAn.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMatrix } from "../services/notificationMatrix.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONEN = path.join(HIER, "..", "..", "sql", "migrations");

/**
 * Alle Typen, die `notifications.type` laut Migrationen erlaubt.
 *
 * Gelesen werden zwei Formen, weil beide vorkommen:
 *   - die Grundliste: ein CHECK mit `type IN ('a', 'b', …)` oder
 *     `type = ANY (ARRAY['a', …])`
 *   - jede Erweiterung: `neu TEXT[] := ARRAY['x','y']` in einem DO-Block, der
 *     den CHECK neu setzt
 */
function erlaubteTypen() {
  const dateien = fs.readdirSync(MIGRATIONEN).filter((f) => f.endsWith(".sql")).sort();
  const typen = new Set();
  const fundstellen = new Map();
  for (const datei of dateien) {
    const roh = fs.readFileSync(path.join(MIGRATIONEN, datei), "utf8");
    /* OHNE KOMMENTARE: die Ruecknahme-Anweisungen im Kopf jeder Migration nennen
       genau die Typen, die dort NICHT mehr stehen sollen. Eine Probe, die den
       Kommentar mitliest, haelt einen entfernten Typ fuer erlaubt. */
    const sql = roh.replace(/^\s*--.*$/gm, "");
    if (!/notifications_type_check|CREATE TABLE IF NOT EXISTS notifications|ALTER TABLE notifications/.test(sql)) continue;

    for (const m of sql.matchAll(/neu\s+TEXT\[\]\s*:=\s*ARRAY\[([^\]]+)\]/g)) {
      for (const t of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
        if (!typen.has(t[1])) fundstellen.set(t[1], datei);
        typen.add(t[1]);
      }
    }
    for (const m of sql.matchAll(/type\s+IN\s*\(([^)]+)\)/gi)) {
      for (const t of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
        if (!typen.has(t[1])) fundstellen.set(t[1], datei);
        typen.add(t[1]);
      }
    }
    for (const m of sql.matchAll(/type\s*=\s*ANY\s*\(\s*ARRAY\[([^\]]+)\]/gi)) {
      for (const t of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
        if (!typen.has(t[1])) fundstellen.set(t[1], datei);
        typen.add(t[1]);
      }
    }
  }
  return { typen, fundstellen };
}

const { typen: ERLAUBT, fundstellen: WOHER } = erlaubteTypen();

/** Ereignis -> Typ, wie die Matrix es fuehrt. */
function matrixTypen() {
  const paare = [];
  for (const [ereignis, cfg] of Object.entries(getMatrix())) {
    if (cfg && typeof cfg.type === "string") paare.push([ereignis, cfg.type]);
  }
  return paare;
}

describe("M4c.13 · die Probe prueft zuerst ihren eigenen Gegenstand", () => {
  it("die Positivliste ist ueberhaupt lesbar — sonst ist die Probe leer gruen", () => {
    /*
     * DIESE ZEILE IST DER WICHTIGSTE TEIL DER DATEI.
     *
     * Beim Messen ist der Fehlalarm ZWEIMAL passiert, mir und der Nachbarsitzung:
     * ein Muster, das die Liste nicht traf, meldete "0 Typen erlaubt, 54
     * abgewiesen". Ohne diese Schranke waere die Probe danach LEER GRUEN gewesen,
     * sobald jemand das Muster kaputtmacht — sie haette nichts mehr zu
     * vergleichen und keinen Verstoss mehr finden koennen.
     */
    assert.ok(ERLAUBT.size >= 80,
      `nur ${ERLAUBT.size} erlaubte Typen aus den Migrationen gelesen — das Muster trifft die Liste nicht mehr`);
  });

  it("die Matrix ist ueberhaupt lesbar", () => {
    const paare = matrixTypen();
    assert.ok(paare.length >= 50, `nur ${paare.length} Ereignisse mit Typ in der Matrix`);
    assert.ok(new Set(paare.map(([, t]) => t)).size >= 35, "zu wenige verschiedene Typen — Matrix nicht gelesen?");
  });

  it("die Grundliste kommt aus einer Migration, nicht aus einem Kommentar", () => {
    /* Gegenprobe zur Kommentar-Falle: ein Typ, der nur in einer
       Ruecknahme-Anweisung steht, darf nicht als erlaubt gelten. */
    for (const t of ERLAUBT) {
      assert.ok(WOHER.has(t), `Typ ${t} hat keine Fundstelle`);
    }
  });
});

describe("M4c.13 · jeder Typ der Matrix steht in der Positivliste", () => {
  it("kein Ereignis bildet auf einen Typ ab, den die Datenbank abweist", () => {
    /*
     * Der entdeckende Waechter. Kein Ausnahmeverzeichnis: ein Typ, den die
     * Datenbank nicht kennt, ist kein Sonderfall, sondern eine Meldung, die
     * nicht entsteht — und der Aufrufer schluckt den Fehler.
     */
    const fehlend = matrixTypen().filter(([, t]) => !ERLAUBT.has(t));
    assert.deepEqual(fehlend, [],
      "Diese Ereignisse bilden auf einen Typ ab, den der CHECK auf notifications.type "
      + "nicht erlaubt. Der INSERT scheitert mit 23514, der Aufrufer schluckt es, und "
      + "die Meldung entsteht NIE:\n  "
      + fehlend.map(([e, t]) => `${e} -> ${t}`).join("\n  ")
      + "\n\nBeheben: eine Migration nach dem Muster von 184/221, die die bestehende "
      + "Liste AUS DEM CONSTRAINT liest und ergaenzt — nie neu hinschreibt.");
  });

  it("der Typ aus M4c.12 ist dabei — der Befund selbst", () => {
    /* Namentlich, damit die Probe nicht gruen wird, wenn jemand das Ereignis aus
       der Matrix entfernt statt den Typ zu ergaenzen. Der Anstoss zur Freigabe
       ist die Leitung, an der 30 von 33 unsichtbaren Kraeften haengen. */
    const paare = matrixTypen();
    const eintrag = paare.find(([e]) => e === "worker.skills_awaiting_release");
    assert.ok(eintrag, "das Ereignis worker.skills_awaiting_release fehlt in der Matrix");
    assert.equal(eintrag[1], "worker_marktpraesenz", "das Ereignis traegt einen anderen Typ");
    assert.ok(ERLAUBT.has("worker_marktpraesenz"),
      "worker_marktpraesenz steht nicht in der Positivliste — Migration 221 fehlt oder greift nicht");
  });
});

describe("M4c.13 · die Dringlichkeitsstufen ebenso", () => {
  it("jede Stufe der Matrix ist eine, die der CHECK auf severity erlaubt", () => {
    /*
     * Dieselbe Klasse, und sie ist hier schon einmal eingetreten: vier
     * Notdienst-Eintraege trugen 'urgent', und ausgerechnet der dringlichste
     * Fall der Plattform kam nie an (Welle G4b). Der Kopf des Matrix-Moduls
     * erzaehlt das — eine Probe daraus gab es bisher nicht.
     */
    const ERLAUBTE_STUFEN = ["info", "warning", "error", "success"];
    const falsch = Object.entries(getMatrix())
      .filter(([, cfg]) => cfg && cfg.severity && !ERLAUBTE_STUFEN.includes(cfg.severity))
      .map(([e, cfg]) => `${e} -> ${cfg.severity}`);
    assert.deepEqual(falsch, [],
      "Diese Ereignisse tragen eine Dringlichkeit, die der CHECK auf "
      + "notifications.severity (Mig 019) nicht erlaubt — der INSERT scheitert still:\n  "
      + falsch.join("\n  "));
  });
});
