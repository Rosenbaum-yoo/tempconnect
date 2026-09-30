/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER WAECHTER GEGEN DIE ERFUNDENE MIGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES IHN GIBT — und das ist ein Befund, nicht eine Vorsichtsmassnahme.
 *
 * `api/docs/TIMESHEETS.md` fuehrte einen Abschnitt "Migration 031: Digital
 * Signature Columns" mit sechs Spalten und einem Index. Gemessen am 2026-09-27:
 * `031` ist `031_rls_prep.sql`, und KEINE Migration des Projekts nennt
 * `worker_signed_at`. Weder die Spalten noch der Index haben je existiert.
 *
 * Der Punkt ist die Richtung der Wirkung: der CODE WURDE GEGEN DIESE DOKU
 * GESCHRIEBEN. `signTimesheet` schrieb in `worker_signed_at`, die Kennzahl
 * `signed_count` las daraus — beides warf bei jedem Aufruf, und weil die Spalte
 * in einem FILTER stand, warf die ganze Abfrage, nicht nur die Kennzahl. Eine
 * Doku, die eine Migration erfindet, ist keine veraltete Notiz. Sie ist eine
 * Bauanleitung ins Leere, und der naechste Mensch (oder Agent) folgt ihr.
 *
 * WAS DIESER WAECHTER PRUEFT — und warum genau das
 *
 * Die naheliegende Pruefung waere "jede genannte Migrationsnummer existiert als
 * Datei". Gemessen waere sie ZWEIMAL falsch: sie haette 17 Dokumente angeklagt,
 * die voellig zu Recht auf GEPLANTE Migrationen verweisen (111, 117), und sie
 * haette den echten Fehler NICHT gefunden — die Nummer 031 existiert ja, sie
 * tut nur etwas anderes. Deshalb:
 *
 *   (A) Jeder Abschnitt "## Migration NNN: <Titel>" muss halten, was er
 *       behauptet: die Datei muss es geben, und jeder in Backticks genannte
 *       Bezeichner (Spalte, Tabelle, Index) muss in dieser Migration vorkommen.
 *   (B) Jede irgendwo genannte Migrationsnummer muss als Datei existieren —
 *       oder als GEPLANT im Register unten stehen, mit Grund.
 *   (C) Das Register darf nicht verrotten: was inzwischen existiert, muss
 *       heraus.
 *   (D) Der Waechter prueft zuerst SEINEN GEGENSTAND: findet er keine
 *       Abschnitte, ist er blind und nicht gruen.
 *
 * Ein durchgestrichener Abschnitt (`~~Migration NNN~~`) ist ABSICHTLICH
 * ausgenommen: er dokumentiert eine widerlegte Behauptung, verspricht also
 * nichts. Genau so steht die Stelle in TIMESHEETS.md heute.
 *
 * UEBERTRAGBAR: dieselbe Pruefung gehoert in jedes Folgeprojekt. Sie kostet
 * nichts und faengt einen Fehler, der sonst erst auffaellt, wenn ein Kunde vor
 * einer 500 steht.
 *
 * Run: node --test --test-force-exit test/dokuMigrationen.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* Pfade immer relativ zu DIESER Datei — sonst haengt das Ergebnis am
   Startverzeichnis und die Probe skippt je nach Aufruf lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..", "..");
const MIGDIR = path.join(WURZEL, "sql", "migrations");

/* ════════════════════════════════════════════════════════════════════════════
   REGISTER: Nummern, die es absichtlich (noch) nicht gibt
   ════════════════════════════════════════════════════════════════════════════
   Jeder Eintrag nennt den Grund. Wer eine Nummer hier eintraegt, ohne sie
   belegen zu koennen, verschiebt einen Befund in eine Liste. */
const GEPLANT = {
  "111": "Nummernluecke, KEINE verlorene Migration. Gemessen am 2026-09-27: die "
       + "Buchhaltung `_migrations` fuehrt keinen Eintrag 111, es wurde also nie "
       + "etwas unter dieser Nummer angewandt — nichts ist verloren, die Nummer "
       + "wurde uebersprungen. Dass das Alltag war, zeigt die Gegenrichtung: "
       + "SIEBEN Nummern sind DOPPELT belegt (064, 070, 074, 075, 086, 130, 140). "
       + "Damit ist die seit der Finalisierungsphase offene Frage OE-05 "
       + "('Bewusst uebersprungen oder Fehler?', docs/releases/FINALIZATION_SCOPE.md) "
       + "faktisch beantwortet; die Dokumente docs/releases/OPEN_BLOCKERS.md (P2-04) "
       + "und sql/migrations/NUMBERING.md fuehren die Messung.",
  "117": "Geplant, nicht gebaut: RLS auf ~60 weitere Tabellen. Steht in "
       + "docs/enterprise-readiness/TENANT_ISOLATION_EVIDENCE.md und "
       + "docs/security/SECURITY_OVERVIEW.md ausdruecklich als Roadmap mit "
       + "'Owner-Entscheidung ausstehend'. Ein Vorausverweis auf eine "
       + "Entscheidung ist erlaubt — er behauptet nichts Bestehendes."
};

/* ── Migrationsdateien einlesen ──────────────────────────────────────────── */
const dateienJeNummer = new Map();
for (const name of fs.readdirSync(MIGDIR).filter((n) => /^\d{3}_.*\.sql$/.test(n))) {
  const nr = name.slice(0, 3);
  if (!dateienJeNummer.has(nr)) dateienJeNummer.set(nr, []);
  dateienJeNummer.get(nr).push(name);
}
const HOECHSTE = Math.max(...[...dateienJeNummer.keys()].map(Number));

const textJeNummer = new Map();
const migrationsText = (nr) => {
  if (!textJeNummer.has(nr)) {
    textJeNummer.set(nr, (dateienJeNummer.get(nr) || [])
      .map((n) => fs.readFileSync(path.join(MIGDIR, n), "utf8")).join(String.fromCharCode(10)).toLowerCase());
  }
  return textJeNummer.get(nr);
};

/* ── Dokumente einlesen ─────────────────────────────────────────────────── */
function markdowns(wurzel) {
  if (!fs.existsSync(wurzel)) return [];
  const raus = [];
  const gehen = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const voll = path.join(p, e.name);
      if (e.isDirectory()) gehen(voll);
      else if (e.name.endsWith(".md")) raus.push(voll);
    }
  };
  gehen(wurzel);
  return raus;
}

const DOKUMENTE = [
  ...markdowns(path.join(WURZEL, "docs")),
  ...markdowns(path.join(WURZEL, "api", "docs")),
  ...markdowns(MIGDIR)
];
const rel = (p) => path.relative(WURZEL, p).split(path.sep).join("/");

/* Abschnittsueberschrift: "## Migration 031: Digital Signature Columns".
   Durchgestrichene (`~~`) sind ausgenommen — sie dokumentieren eine widerlegte
   Behauptung. */
const UEBERSCHRIFT = /^(#{2,4})\s+(~~)?\s*Migration\s+0*(\d{1,3})\s*[:–-]/i;
/* Bezeichner in Backticks: nur Kleinschreibung mit Unterstrich, optional
   tabelle.spalte. Dateinamen wie `timesheetService.js` fallen dadurch heraus. */
const BEZEICHNER = /`([a-z][a-z0-9_]{2,}(?:\.[a-z][a-z0-9_]*)?)`/g;
/* Nennung einer Nummer. Die Vorausschau schliesst "Migration 0,5-1 Tag" aus —
   eine Aufwandsschaetzung ist keine Migrationsnummer (gemessen in
   docs/PILOT_GO_LIVE_TODOS.md). */
const NENNUNG = /\bMig(?:ration|\.)?\s+0*(\d{1,3})(?![.,]\d)\b/gi;
/* EINE Stelle normalisiert, nicht zwei. Meine erste Fassung hat im Aufrufer
   gepolstert und in der Gegenprobe rohe Treffer verglichen — die Gegenprobe
   wurde rot und hatte recht: zwei Ablesungen derselben Sache laufen
   auseinander. */
const nummernAus = (text) => [...String(text).matchAll(NENNUNG)]
  .map((m) => String(m[1]).padStart(3, "0"));

function abschnitte() {
  const raus = [];
  for (const pfad of DOKUMENTE) {
    const zeilen = fs.readFileSync(pfad, "utf8").split(String.fromCharCode(10));
    for (let i = 0; i < zeilen.length; i++) {
      const m = zeilen[i].match(UEBERSCHRIFT);
      if (!m) continue;
      const ebene = m[1].length;
      let ende = i + 1;
      while (ende < zeilen.length) {
        const h = zeilen[ende].match(/^(#+)\s/);
        if (h && h[1].length <= ebene) break;
        ende++;
      }
      raus.push({
        datei: rel(pfad),
        nummer: String(m[3]).padStart(3, "0"),
        gestrichen: !!m[2],
        koerper: zeilen.slice(i + 1, ende).join(String.fromCharCode(10))
      });
    }
  }
  return raus;
}

describe("Waechter: die Doku erfindet keine Migration", () => {
  it("(D) der Waechter findet ueberhaupt Abschnitte — sonst ist er blind, nicht gruen", () => {
    const alle = abschnitte();
    assert.ok(alle.length >= 3,
      "nur " + alle.length + " Abschnitte 'Migration NNN: …' gefunden. Entweder ist die "
      + "Ueberschriftserkennung kaputt, oder die Doku hat ihre Migrationsabschnitte "
      + "verloren — beides macht die Pruefungen darunter wertlos.");
    assert.ok(DOKUMENTE.length >= 50, "nur " + DOKUMENTE.length + " Dokumente gelesen");
    assert.ok(dateienJeNummer.size >= 200, "nur " + dateienJeNummer.size + " Migrationsnummern gelesen");
  });

  it("(A) jeder Abschnitt 'Migration NNN' haelt, was er behauptet", () => {
    const befunde = [];
    for (const a of abschnitte()) {
      if (a.gestrichen) continue;
      if (!dateienJeNummer.has(a.nummer)) {
        befunde.push(a.datei + ": Abschnitt 'Migration " + a.nummer + "' — DIESE DATEI GIBT ES NICHT");
        continue;
      }
      const sql = migrationsText(a.nummer);
      const fehlend = [];
      for (const b of a.koerper.matchAll(BEZEICHNER)) {
        const teile = b[1].toLowerCase().split(".");
        if (!teile.every((s) => sql.includes(s))) fehlend.push(b[1]);
      }
      if (fehlend.length) {
        befunde.push(a.datei + ": Abschnitt 'Migration " + a.nummer + "' ("
          + dateienJeNummer.get(a.nummer).join(", ") + ") verspricht, was dort nicht steht: "
          + [...new Set(fehlend)].join(", "));
      }
    }
    assert.deepEqual(befunde, [],
      "Die Doku behauptet ueber eine Migration etwas, das nicht in ihr steht. Genau so "
      + "entstand der Z2-Befund: Code wurde gegen diese Behauptung geschrieben und warf. "
      + "Entweder die Migration nachziehen oder den Abschnitt korrigieren — und wenn die "
      + "Behauptung historisch ist, die Ueberschrift durchstreichen (~~Migration NNN~~) "
      + "und darunter sagen, was wirklich gilt.\n  " + befunde.join("\n  "));
  });

  it("(B) jede genannte Migrationsnummer existiert — oder steht als geplant im Register", () => {
    const befunde = [];
    for (const pfad of DOKUMENTE) {
      const text = fs.readFileSync(pfad, "utf8");
      for (const nr of new Set(nummernAus(text))) {
        if (dateienJeNummer.has(nr)) continue;
        if (GEPLANT[nr]) continue;
        /* Die naechste Nummer darf genannt werden: NUMBERING.md hat genau die
           Aufgabe, sie zu nennen. */
        if (Number(nr) === HOECHSTE + 1) continue;
        befunde.push(rel(pfad) + " nennt Migration " + nr);
      }
    }
    assert.deepEqual(befunde, [],
      "Ein Dokument nennt eine Migration, die es nicht gibt. Wenn sie GEPLANT ist, "
      + "gehoert sie mit Grund ins Register GEPLANT in dieser Datei; wenn sie eine "
      + "Verwechslung ist, gehoert die Nummer korrigiert.\n  " + befunde.join("\n  "));
  });

  it("(C) das Register verrottet nicht: was existiert, steht nicht mehr als geplant", () => {
    const veraltet = Object.keys(GEPLANT).filter((nr) => dateienJeNummer.has(nr));
    assert.deepEqual(veraltet, [],
      "Diese Nummern gelten im Register als geplant, existieren aber als Datei: "
      + veraltet.join(", ") + ". Ein Register, das Erledigtes weiterfuehrt, verliert "
      + "seine Aussagekraft — Eintrag streichen und den Grund an seine Stelle setzen.");
  });

  it("die Erkennung greift wirklich — Gegenprobe an erfundenem Text", () => {
    /* Klasse "Probe prueft zuerst ihren Gegenstand": ohne diese Zeilen waere
       jede Zusicherung oben auch dann gruen, wenn die Ausdruecke nichts mehr
       treffen. */
    assert.ok(UEBERSCHRIFT.test("### Migration 031: Digital Signature Columns"));
    assert.ok(UEBERSCHRIFT.test("## Migration 7 – Kurzform"));
    assert.equal(UEBERSCHRIFT.test("### ~~Migration 031: gab es nie~~ — Erklaerung"), true);
    assert.equal("### ~~Migration 031: x~~".match(UEBERSCHRIFT)[2], "~~",
      "eine durchgestrichene Ueberschrift wird nicht als gestrichen erkannt — dann klagt der Waechter die Erklaerung der Luege an");
    assert.deepEqual(nummernAus("siehe Migration 031 und Mig. 156"), ["031", "156"]);
    assert.deepEqual(nummernAus("Aufwand: Migration 0,5-1 Tag"), [],
      "eine Aufwandsschaetzung wird als Migrationsnummer gelesen — das erzeugt einen Fehlalarm, der den Waechter unglaubwuerdig macht");
    assert.deepEqual([...("`worker_signed_at` und `timesheetService.js`").matchAll(BEZEICHNER)].map((m) => m[1]),
      ["worker_signed_at"], "die Bezeichnererkennung liest Dateinamen mit oder Spalten nicht");
  });
});
