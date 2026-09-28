/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE ARBEITSANWEISUNG ZEIGT NICHT AUF ERLEDIGTES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `docs/UEBERGABE.md` enthaelt die Reihenfolge der offenen Arbeit, und sie ist
 * eine ANWEISUNG: "die bauende Sitzung geht von oben nach unten". Wer oben
 * anfaengt, arbeitet also das ab, was dort als Posten 1 steht.
 *
 * Am 2026-09-28 standen die Posten EINS BIS VIER alle vier noch als offen,
 * obwohl sie zwischen dem 20. und 22. September abgearbeitet worden waren:
 *
 *   Posten 1  U0.2/U2.4       erledigt 2026-09-20
 *   Posten 2  W5 + W4.2       erledigt 2026-09-21
 *   Posten 3  S1 + S4         erledigt 2026-09-21
 *   Posten 4  N8.1            erledigt 2026-09-22
 *
 * Eine Sitzung, die der Anweisung folgt, greift dann vier erledigte Posten
 * nacheinander auf. Eine davon hat genau das getan: sie hat die Standortgrenze
 * von vorne gemessen, bis ein Kommentar im Dienst die Messung von 2026-09-20
 * erwaehnte. Der Umweg war vollstaendig vermeidbar.
 *
 * DAS IST DIE TEUERSTE SORTE DOKU-FAEULNIS, weil sie nicht wie ein Fehler
 * aussieht, sondern wie Arbeit. Ein toter Link faellt auf; ein Posten, der auf
 * Erledigtes zeigt, wird abgearbeitet.
 *
 * DIE KOPPLUNG WAR IMMER DA — sie wurde nur nie gezogen: jeder Eintrag in
 * `docs/PILOT_GO_LIVE_TODOS.md` nennt seine Herkunft woertlich, etwa
 * "Quelle: Owner-Reihenfolge 2026-09-20, Posten 4". Diese Datei zieht sie.
 * (Dieselbe Lehre wie P1-15 beim Suchindex: dort stand die Regel seit Langem als
 * Notiz im Quelltext und hat nichts verhindert — eine Kopplung schon.)
 *
 * Run: node --test --test-force-exit test/reihenfolgeIstAktuell.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* Relativ zu DIESER Datei, nie zu process.cwd() — sonst findet die Probe je nach
   Startverzeichnis nichts und ist lautlos gruen. */
const WURZEL = path.resolve(__dirname, "..", "..");
const UEBERGABE = path.join(WURZEL, "docs", "UEBERGABE.md");
const TODOS = path.join(WURZEL, "docs", "PILOT_GO_LIVE_TODOS.md");

const vorhanden = fs.existsSync(UEBERGABE) && fs.existsSync(TODOS);
const uebergabe = vorhanden ? fs.readFileSync(UEBERGABE, "utf8") : "";
const todos = vorhanden ? fs.readFileSync(TODOS, "utf8") : "";

/* ── Die Reihenfolge-Tabelle ───────────────────────────────────────────────── */

export function reihenfolgeTabelle(text) {
  const von = text.indexOf("## Die Reihenfolge der offenen Arbeit");
  if (von === -1) return null;
  const bis = text.indexOf("\n## ", von + 10);
  return text.slice(von, bis === -1 ? text.length : bis);
}

/* Eine Postenzeile: "| 4 | **N8.1** — … |" oder "| 1b | … |".
   Erledigte sind durchgestrichen ("~~4~~") und zaehlen nicht als offen. */
export function offenePosten(tabelle) {
  const out = new Map();
  for (const zeile of tabelle.split("\n")) {
    const m = /^\|\s*(~~)?\s*(\d+[a-z]?)\s*(~~)?\s*\|/.exec(zeile);
    if (!m) continue;
    if (m[1] || zeile.includes("ERLEDIGT")) continue;
    out.set(m[2], zeile.trim());
  }
  return out;
}

/* ── Die erledigten Eintraege, die eine Postennummer nennen ────────────────── */

export function erledigtePosten(text) {
  const out = new Map();
  const zeilen = text.split("\n");
  for (let i = 0; i < zeilen.length; i++) {
    if (!zeilen[i].startsWith("### ")) continue;
    /* Der Kopf eines Eintrags: Titelzeile plus die naechsten Zeilen bis zur
       naechsten Leerzeile nach der Quelle. Vier Zeilen reichen im Bestand. */
    const kopf = zeilen.slice(i, i + 5).join(" ");
    if (!/\*\*Status:\*\*\s*erledigt/i.test(kopf)) continue;
    /*
     * "Owner-Reihenfolge 2026-09-20, Posten 4" — auch "Posten 4 und 5" und
     * "Posten 1b".
     *
     * DAS SUFFIX FEHLTE ZUERST, und der Fehler ist lehrreich: die erste Fassung
     * las nur Ziffern. Als diese Welle ihren EIGENEN Eintrag schrieb ("Posten
     * 1b"), blieb die Probe gruen, obwohl Posten 1b offen in der Reihenfolge
     * stand — sie hat also genau den Fall durchgelassen, fuer den sie gebaut
     * wurde. Aufgefallen ist es nur, weil die Welle ihre eigene Wache
     * herausgefordert hat statt ihr zu glauben.
     *
     * Die Reihenfolge nummeriert mit Suffix (1b, 1c, 5b), seit es
     * Zwischenposten gibt. Wer nur `\d+` liest, uebersieht sie alle.
     */
    const re = /Owner-Reihenfolge[^,;.]*,\s*Posten\s+((?:\d+[a-z]?)(?:\s*(?:,|und)\s*\d+[a-z]?)*)/gi;
    let m;
    while ((m = re.exec(kopf))) {
      for (const nr of m[1].split(/\s*(?:,|und)\s*/).map((s) => s.trim()).filter(Boolean)) {
        if (!out.has(nr)) out.set(nr, zeilen[i].trim());
      }
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WAS DIESE PROBE NICHT KANN, gemessen an den Rueckmutationen
 *
 * Sie haengt an der Quellenangabe. Wer in einem erledigten Eintrag die Zeile
 * "Quelle: Owner-Reihenfolge …, Posten N" weglaesst, entzieht ihr die Kopplung —
 * der Posten bleibt dann offen stehen und niemand wird rot. Eine Rueckmutation
 * hat das bestaetigt.
 *
 * Dagegen hilft nur die Gewohnheit, die der Bestand ohnehin hat: JEDER Eintrag
 * in PILOT_GO_LIVE_TODOS.md nennt seine Herkunft. Die Notbremse oben
 * (mindestens drei erkannte Quellenangaben) faengt den Totalausfall, nicht den
 * Einzelfall — das ist der ehrliche Stand und keine Nachlaessigkeit.
 *
 * Und noch etwas, aus derselben Messung: die ERSTE Fassung dieser
 * Rueckmutationen tauschte nur `~~4~~` gegen `4` und liess das Wort ERLEDIGT in
 * derselben Zeile stehen. Alle vier blieben gruen — nicht weil der Waechter
 * blind war, sondern weil die Mutation ihren Gegenstand gar nicht hergestellt
 * hatte. Eine Rueckmutation, die den Urzustand nur halb wiederherstellt,
 * beweist nichts und suggeriert eine Luecke, die es nicht gibt.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ── Begruendete Ausnahmen ─────────────────────────────────────────────────── */
/* Ein Posten, der TEILWEISE erledigt ist, bleibt offen — dann steht er hier mit
   Grund. Die Liste ist zurzeit leer, und das ist eine Aussage. */
const TEILWEISE = new Map([
  ["1b", "Welle Z — die Schema-Schulden. Z16–Z20 sind am 2026-09-28 abgeschlossen " +
         "(beide Bestandslisten leer, 36 Rueckmutationen gefangen), aber DREI Punkte " +
         "bleiben und sie gehoeren alle dem Owner: Z10 (Passwort- und " +
         "Bestaetigungs-Token im Klartext — eine Sicherheitsentscheidung, die eine " +
         "arbeitende Sitzung nicht treffen darf), Z11 (vier verwaiste Tabellen " +
         "loeschen) und die Frage, WANN die Reputation neu gerechnet wird (P1-14). " +
         "Der Posten bleibt offen, bis der Owner sie beantwortet hat — deshalb steht " +
         "er hier und ist nicht durchgestrichen."]
]);

const tabelle = vorhanden ? reihenfolgeTabelle(uebergabe) : null;
const offen = tabelle ? offenePosten(tabelle) : new Map();
const erledigt = vorhanden ? erledigtePosten(todos) : new Map();

describe("Die Reihenfolge der offenen Arbeit ist aktuell", () => {
  it("beide Dokumente sind da und werden gelesen", () => {
    /* Notbremse: ohne sie meldet diese Datei gruen, wenn ein Pfad nicht stimmt —
       und ein Waechter, der nichts liest, ist schlimmer als keiner. */
    assert.ok(vorhanden, `docs/UEBERGABE.md oder docs/PILOT_GO_LIVE_TODOS.md fehlt`);
    assert.ok(tabelle, "der Abschnitt 'Die Reihenfolge der offenen Arbeit' wurde nicht gefunden");
    assert.ok(offen.size >= 5, `nur ${offen.size} offene Posten erkannt — stimmt das Tabellenformat noch?`);
    assert.ok(erledigt.size >= 3,
      `nur ${erledigt.size} erledigte Posten mit Quellenangabe erkannt — nennen die Eintraege ihre Postennummer noch?`);
  });

  it("kein offener Posten ist anderswo als erledigt verbucht", () => {
    const kollision = [...offen.keys()].filter((nr) => erledigt.has(nr) && !TEILWEISE.has(nr));
    assert.deepEqual(
      kollision, [],
      `\n\n${kollision.length} Posten der Arbeitsanweisung sind bereits erledigt:\n\n` +
      kollision.map((nr) =>
        `  Posten ${nr}\n` +
        `    steht offen in docs/UEBERGABE.md:\n      ${offen.get(nr).slice(0, 110)}\n` +
        `    ist erledigt in docs/PILOT_GO_LIVE_TODOS.md:\n      ${erledigt.get(nr)}`
      ).join("\n\n") +
      `\n\nWer der Anweisung folgt ("von oben nach unten"), arbeitet das ab. Den Posten\n` +
      `durchstreichen (~~N~~) und auf den Eintrag verweisen — oder, wenn nur ein TEIL\n` +
      `erledigt ist, mit Grund in TEILWEISE eintragen. Beides ist besser als eine\n` +
      `Anweisung, die wie Arbeit aussieht und keine ist.\n`
    );
  });

  it("jede TEILWEISE-Ausnahme ist noch ein echter Fall", () => {
    const verwaist = [...TEILWEISE.keys()].filter((nr) => !offen.has(nr) || !erledigt.has(nr));
    assert.deepEqual(verwaist, [],
      `diese Ausnahmen treffen nicht mehr zu — streichen: ${verwaist.join(", ")}`);
  });

  it("erkennt den Fall von 2026-09-28 in einer Nachbildung wieder", () => {
    /*
     * Die Selbstprobe. Ohne sie ist "keine Kollision" wertlos: eine Probe, die
     * nichts findet, weil sie nichts finden KANN, sieht genauso aus wie eine,
     * bei der alles stimmt. Nachgebildet ist der echte Stand vom 2026-09-28.
     */
    const nachTabelle = [
      "## Die Reihenfolge der offenen Arbeit *(Owner-Auftrag)*",
      "| # | Was | Warum hier |",
      "|---|---|---|",
      "| 1 | **U0.2 + U2.4** — Standortgrenze | Moeglicher Sicherheitsbefund |",
      "| 4 | **N8.1** — Katalog statt Freitext | Alles darueber baut darauf auf |",
      "| 9 | **E7** — Beispielansicht | Der erste Eindruck |"
    ].join("\n");
    const nachTodos = [
      "### 2026-09-20 — Die Standortgrenze, entdeckend geprueft (U0.2 / U2.4)",
      "",
      "**Status:** erledigt · **Kategorie:** Rollen-/Sichtbarkeitslogik ·",
      "**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 1",
      "",
      "### 2026-09-22 — Katalog statt Freitext (N8.1)",
      "",
      "**Status:** erledigt · **Kategorie:** Produktausbau ·",
      "**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 4"
    ].join("\n");

    const o = offenePosten(reihenfolgeTabelle(nachTabelle));
    const e = erledigtePosten(nachTodos);
    assert.deepEqual([...o.keys()].filter((n) => e.has(n)).sort(), ["1", "4"],
      "die Probe wuerde den Stand vom 2026-09-28 NICHT bemerken");

    /* Und die Gegenprobe: ein durchgestrichener Posten zaehlt nicht mehr als
       offen, sonst waere die Behebung nicht moeglich. */
    const behoben = nachTabelle
      .replace("| 1 | **U0.2", "| ~~1~~ | ~~**U0.2")
      .replace("| 4 | **N8.1", "| ~~4~~ | ~~**N8.1");
    const o2 = offenePosten(reihenfolgeTabelle(behoben));
    assert.deepEqual([...o2.keys()].filter((n) => e.has(n)), [],
      "ein durchgestrichener Posten wird immer noch als offen gelesen");

    /*
     * Der SUFFIX-Fall, und er hat sich selbst gemeldet: die erste Fassung las
     * nur Ziffern und liess "Posten 1b" durch — genau den Eintrag, den diese
     * Welle fuer sich selbst geschrieben hat. Ohne diese Zusicherung laesst sich
     * das Regex still auf Ziffern zuruecksetzen.
     */
    const mitSuffix = erledigtePosten([
      "### 2026-09-28 — Welle Z (Z16-Z20)",
      "",
      "**Status:** erledigt · **Kategorie:** Bug-Pattern ·",
      "**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 1b"
    ].join("\n"));
    assert.ok(mitSuffix.has("1b"),
      "ein Posten mit Buchstaben-Suffix (1b, 1c, 5b) wird nicht erkannt");

    /* Mehrere Nummern in einer Angabe. */
    const mehrere = erledigtePosten([
      "### 2026-01-01 — Sammel",
      "",
      "**Status:** erledigt ·",
      "**Quelle:** Owner-Reihenfolge 2026-09-20, Posten 3 und 4"
    ].join("\n"));
    assert.deepEqual([...mehrere.keys()].sort(), ["3", "4"]);

    /* Und ein Eintrag OHNE Status 'erledigt' darf nichts ausloesen. */
    const offenerEintrag = nachTodos.replace(/erledigt/g, "in Arbeit");
    assert.equal(erledigtePosten(offenerEintrag).size, 0,
      "ein Eintrag 'in Arbeit' wird faelschlich als erledigt gelesen");
  });
});
