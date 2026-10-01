/**
 * Der Wichtigkeits-Wächter (Owner 2026-10-01): „… nach Wichtigkeit noch nicht
 * erledigte Sachen regelmäßig prüft und eine Erinnerung an mich schickt durch
 * dich — hierarchisch strukturiert eben nach Wichtigkeitsklassen A, B und C".
 *
 * Festgehalten wird:
 *  1. das echte Register (docs/WICHTIGKEIT.md) ist in Form und gegen die vier
 *     Listen, aus denen es gespeist wird, ohne Befund — jeder dort offene
 *     Posten ist eingestuft, keine offene Zeile zeigt auf Erledigtes;
 *  2. die Leser dieser Listen finden bekannte Treffer (sonst prüfte die
 *     Kopplung eine leere Menge und wäre leer grün);
 *  3. jede Prüfung schlägt an, wenn ihr Fall eintritt — an kleinen Registern;
 *  4. die Erinnerung ist hierarchisch: A vor B vor C, in der Klasse das
 *     Überfällige und das, was beim Owner liegt, zuerst;
 *  5. der Stand kommt vom Zweig mit dem jüngsten Commit am Register.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import {
  leseRegister,
  leseQuellen,
  pruefeRegister,
  erinnerung,
  klartext,
  tageZwischen,
  waehleFrischesten,
} from "../scripts/wichtigkeit.mjs";

const WURZEL = resolve(import.meta.dirname, "..", "..");
const lies = (rel) => readFileSync(join(WURZEL, rel), "utf8");
const SKRIPT = join(WURZEL, "api", "scripts", "wichtigkeit.mjs");

/* ── kleine Register zum Prüfen der Prüfungen ─────────────────────────────── */

const TABELLE = "| Nr | Was | Wer | Nächster Schritt | Seit | Frist | Quelle |\n|---|---|---|---|---|---|---|\n";
function register({ a = [], b = [], c = [], erledigt = [], livegang = "2026-12-01" } = {}) {
  return [
    livegang ? `**Livegang:** ${livegang}` : "",
    "", "## A — muss vor dem Livegang stehen", "", TABELLE + a.join("\n"),
    "", "## B — wichtig, bald", "", TABELLE + b.join("\n"),
    "", "## C — später", "", TABELLE + c.join("\n"),
    "", "## Erledigt", "", "| Nr | Was | Erledigt am | Beleg |\n|---|---|---|---|\n" + erledigt.join("\n"), "",
  ].join("\n");
}
function zeile(nr, { wer = "Owner", seit = "2026-09-01", frist = "—", quelle = "[Übergabe](UEBERGABE.md)", was = `Punkt ${nr}`, schritt = "tun" } = {}) {
  return `| ${nr} | ${was} | ${wer} | ${schritt} | ${seit} | ${frist} | ${quelle} |`;
}
function quellen({ r = [], rE = [], o = [], oE = [], e = [], eE = [], g = [], gE = [] } = {}) {
  const s = (offen, erledigt) => ({ offen: new Set(offen), erledigt: new Set(erledigt) });
  return { reihenfolge: s(r, rE), ownerListe: s(o, oE), entscheidungen: s(e, eE), golive: s(g, gE) };
}
const befunde = (text, opt = {}) => pruefeRegister(leseRegister(text), opt);

describe("Das echte Register", () => {
  const reg = leseRegister(lies("docs/WICHTIGKEIT.md"));
  const q = leseQuellen({ uebergabe: lies("docs/UEBERGABE.md"), todos: lies("docs/PILOT_GO_LIVE_TODOS.md") });

  it("ist ohne Befund — Form und Kopplung an Übergabe und Go-Live-Liste", () => {
    const b = pruefeRegister(reg, { quellen: q, existiert: (rel) => existsSync(join(WURZEL, "docs", rel)) });
    assert.deepEqual(b, [], `docs/WICHTIGKEIT.md:\n  - ${b.join("\n  - ")}`);
    assert.ok(reg.livegang, "Livegang-Datum fehlt");
    assert.ok(reg.punkte.length > 0);
  });

  it("Gegenprobe: die Leser der vier Listen finden bekannte Posten — offen wie erledigt", () => {
    // Fände ein Leser nichts, wäre „alles eingestuft“ leer wahr.
    assert.ok(q.reihenfolge.offen.has("10") && q.reihenfolge.erledigt.has("1"), "Reihenfolge");
    assert.ok(q.ownerListe.offen.has("7") && q.ownerListe.erledigt.has("4"), "Owner-Liste");
    assert.ok(q.entscheidungen.offen.has("D-M2") && q.entscheidungen.erledigt.has("W-E9"), "Owner-Entscheidungen");
    assert.ok(q.golive.offen.has("P0.4") && q.golive.erledigt.has("P0.1"), "Go-Live P0");
  });

  it("jede Klasse ist ein eigener Abschnitt, und A steht oben", () => {
    const text = lies("docs/WICHTIGKEIT.md");
    const a = text.indexOf("\n## A — "), b = text.indexOf("\n## B — "), c = text.indexOf("\n## C — "), e = text.indexOf("\n## Erledigt");
    assert.ok(a > 0 && a < b && b < c && c < e, "Reihenfolge der Abschnitte A, B, C, Erledigt");
  });
});

describe("Kopplung: was offen ist, muss eingestuft sein — und umgekehrt", () => {
  it("ein offener Posten ohne Zeile im Register wird gemeldet", () => {
    const b = befunde(register({ a: [zeile("OP-01", { quelle: "[Ü](UEBERGABE.md): Reihenfolge #5" })] }), { quellen: quellen({ r: ["5", "6"] }) });
    assert.deepEqual(b, ["Reihenfolge #6 ist offen, aber nicht eingestuft — Zeile in docs/WICHTIGKEIT.md ergänzen"]);
  });

  it("eine offene Zeile, die auf Erledigtes zeigt, wird gemeldet", () => {
    const b = befunde(register({ b: [zeile("OP-02", { quelle: "[Ü](UEBERGABE.md): Entscheidung W-E9" })] }), { quellen: quellen({ eE: ["W-E9"] }) });
    assert.deepEqual(b, ["OP-02 zeigt auf Entscheidung W-E9, das dort erledigt ist — nach „Erledigt“ verschieben"]);
  });

  it("ein Verweis ins Leere wird gemeldet, für jede der vier Arten", () => {
    const q = "[Ü](UEBERGABE.md): Reihenfolge #99, Owner-Liste #42, Entscheidung X-Y1, Go-Live P0.77";
    const b = befunde(register({ c: [zeile("OP-03", { quelle: q })] }), { quellen: quellen() });
    assert.deepEqual(b, [
      "OP-03 verweist auf Reihenfolge #99, das es dort nicht gibt",
      "OP-03 verweist auf Owner-Liste #42, das es dort nicht gibt",
      "OP-03 verweist auf Entscheidung X-Y1, das es dort nicht gibt",
      "OP-03 verweist auf Go-Live P0.77, das es dort nicht gibt",
    ]);
  });

  it("eine erledigte Register-Zeile zählt nicht als Einstufung", () => {
    const text = register({ erledigt: ["| OP-04 | war Reihenfolge #5 | 2026-10-01 | `abc1234` |"] });
    assert.deepEqual(befunde(text, { quellen: quellen({ r: ["5"] }) }),
      ["Reihenfolge #5 ist offen, aber nicht eingestuft — Zeile in docs/WICHTIGKEIT.md ergänzen"]);
  });

  it("fehlt eine Liste (Abschnitt umbenannt), wird das gemeldet statt still nichts geprüft", () => {
    const q = quellen();
    q.golive = null;
    assert.deepEqual(befunde(register(), { quellen: q }), ["Liste „Go-Live“ nicht gefunden — Abschnitt umbenannt? Dann hier mitziehen."]);
  });

  it("die Leser: Durchgestrichenes ist erledigt, ✅ in der Zeile auch", () => {
    const uebergabe = [
      "## Die Reihenfolge der offenen Arbeit", "| # | Was |", "|---|---|",
      "| ~~1~~ | ~~alt~~ |", "| 1b | neu |", "| 7 | offen |",
      "## Was auf dem Owner liegt", "| # | Punkt |", "|---|---|", "| 3 | offen |", "| 4 | ✅ Beantwortet |",
      "### Zwei Blocker", "| 9 | gehört nicht mehr dazu |",
      "## Offene Owner-Entscheidungen",
      "- **D-M2 (neu)** — offen", "- ~~**D-M5**~~ ✅ entschieden", "- ~~E-E1/E-E2/E-E3~~ ✅ entschieden",
      "- **W-E9** ✅ entschieden", "### Unterabschnitt", "- **W-E8 (neu)** — offen",
      "## Nächster Abschnitt", "- **X-Y1** — gehört nicht dazu",
    ].join("\n");
    const todos = [
      "## P0 - Go-Live-Blocker", "### P0.1 - fertig", "- Status: ERLEDIGT",
      "### P0.4 - offen", "- Status: OFFEN — vor dem Pilot", "### ~~P0.8 - weg~~ ✅", "### P0.11 - Zahl 🔴 OFFEN",
    ].join("\n");
    const q = leseQuellen({ uebergabe, todos });
    assert.deepEqual([...q.reihenfolge.offen], ["1b", "7"]);
    assert.deepEqual([...q.reihenfolge.erledigt], ["1"]);
    assert.deepEqual([...q.ownerListe.offen], ["3"]);
    assert.deepEqual([...q.ownerListe.erledigt], ["4"]);
    assert.deepEqual([...q.entscheidungen.offen], ["D-M2", "W-E8"]);
    assert.deepEqual([...q.entscheidungen.erledigt].sort(), ["D-M5", "E-E1", "E-E2", "E-E3", "W-E9"]);
    assert.deepEqual([...q.golive.offen], ["P0.4", "P0.11"]);
    assert.deepEqual([...q.golive.erledigt], ["P0.1", "P0.8"]);
    assert.deepEqual(leseQuellen({}), { reihenfolge: null, ownerListe: null, entscheidungen: null, golive: null });
  });
});

describe("Form: jede Zeile ist lesbar und belegt", () => {
  it("ein gutes Register hat keinen Befund", () => {
    assert.deepEqual(befunde(register({ a: [zeile("OP-01")], erledigt: ["| OP-02 | fertig | 2026-10-01 | `abc1234` |"] })), []);
  });

  it("doppelte Nummer, falsches Format, unbekanntes Wer, kaputte Daten, leere Felder", () => {
    const b = befunde(register({
      a: [zeile("OP-01"), zeile("OP-01", { wer: "Chef" }), zeile("OP-1x", { seit: "2026-02-30", frist: "bald" })],
      b: [zeile("OP-05", { was: "**  **", schritt: "" })],
    }));
    assert.ok(b.some((x) => x.startsWith("OP-01: Nummer doppelt")), b.join("\n"));
    assert.ok(b.includes("OP-01: „Wer“ ist „Chef“ — erlaubt: Owner, Cloud, K1, Extern"));
    assert.ok(b.includes("OP-1x: Nummer nicht im Format OP-nn"));
    assert.ok(b.includes("OP-1x: „Seit“ ist kein Datum (JJJJ-MM-TT): 2026-02-30"));
    assert.ok(b.includes("OP-1x: „Frist“ ist kein Datum: bald"));
    assert.ok(b.includes("OP-05: „Was“ ist leer"));
    assert.ok(b.includes("OP-05: „Nächster Schritt“ ist leer"));
  });

  it("„Seit“ in der Zukunft, Quelle ohne Datei, Datei, die es nicht gibt", () => {
    const b = befunde(register({ a: [
      zeile("OP-01", { seit: "2026-10-09" }),
      zeile("OP-02", { quelle: "irgendwo" }),
      zeile("OP-03", { quelle: "[weg](GIBT_ES_NICHT.md#abschnitt)" }),
    ] }), { heute: "2026-10-05", existiert: (rel) => rel !== "GIBT_ES_NICHT.md" });
    assert.deepEqual(b, [
      "OP-01: „Seit“ liegt in der Zukunft: 2026-10-09",
      "OP-02: „Quelle“ ohne Verweis auf eine Datei",
      "OP-03: Verweis auf eine Datei, die es nicht gibt: GIBT_ES_NICHT.md",
    ]);
  });

  it("ein „|“ im Text verschiebt die Spalten — wird gemeldet, nicht falsch gelesen", () => {
    const b = befunde(register({ a: ["| OP-01 | a | b | Owner | tun | 2026-09-01 | — | [Ü](UEBERGABE.md) |"] }));
    assert.equal(b.length, 1);
    assert.match(b[0], /7 Spalten erwartet, gefunden 8/);
  });

  it("erledigt ohne Datum oder ohne Beleg; Register ohne Livegang", () => {
    const b = befunde(register({ livegang: null, erledigt: ["| OP-07 | fertig | gestern |  |"] }));
    assert.deepEqual(b, [
      "Kopfzeile „**Livegang:** JJJJ-MM-TT“ fehlt",
      "OP-07: „Erledigt am“ ist kein Datum: gestern",
      "OP-07: erledigt ohne Beleg (Commit, Test)",
    ]);
  });
});

describe("Die Erinnerung ist hierarchisch", () => {
  const reg = leseRegister(register({
    a: [
      zeile("OP-01", { wer: "K1", seit: "2026-08-01", was: "**Alt** bei K1" }),
      zeile("OP-02", { wer: "Owner", seit: "2026-09-20", was: "Neu beim Owner" }),
      zeile("OP-03", { wer: "K1", seit: "2026-09-25", frist: "2026-10-01", was: "Frist vorbei" }),
    ],
    b: [zeile("OP-04", { wer: "Cloud", was: "B-Punkt", schritt: "`csvText` übertragen" })],
    c: [zeile("OP-05", { was: "C-Punkt" })],
    erledigt: ["| OP-06 | frisch erledigt | 2026-10-02 | `abc` |", "| OP-07 | lange her | 2026-08-01 | `def` |"],
  }));

  it("A vor B vor C; in A zuerst das Überfällige, dann der Owner, dann das Älteste", () => {
    const t = erinnerung(reg, { heute: "2026-10-05" });
    const pos = (s) => { const i = t.indexOf(s); assert.ok(i >= 0, `fehlt: ${s}\n${t}`); return i; };
    assert.ok(pos("A — muss vor dem Livegang stehen (3)") < pos("B — wichtig, bald (1)"));
    assert.ok(pos("B — wichtig, bald (1)") < pos("C — später (1)"));
    assert.ok(pos("OP-02 Neu beim Owner") < pos("OP-03 ÜBERFÄLLIG seit 01.10.2026 — Frist vorbei"),
      "Gruppe „bei dir“ steht vor „bei K1“ …");
    assert.ok(pos("OP-03 ÜBERFÄLLIG") < pos("OP-01 Alt bei K1"), "… und in der Gruppe das Überfällige vor dem Älteren");
    assert.match(t, /OP-01 Alt bei K1 \(seit 65 Tagen\)\n {4}nächster Schritt: tun/);
    assert.match(t, /OP-04 B-Punkt — csvText übertragen/, "B: eine Zeile, Klartext ohne Markdown");
  });

  it("in derselben Gruppe kommt das Ältere zuerst — auch mit der höheren Nummer", () => {
    const zwei = leseRegister(register({ b: [
      zeile("OP-08", { seit: "2026-07-01", was: "jünger" }),
      zeile("OP-09", { seit: "2026-06-01", was: "älter" }),
    ] }));
    const t = erinnerung(zwei, { heute: "2026-10-05" });
    assert.ok(t.indexOf("OP-09 älter") < t.indexOf("OP-08 jünger"), t);
  });

  it("Kopf: Wochentag, Livegang-Countdown, Zählung je Klasse, frisch Erledigtes", () => {
    const t = erinnerung(reg, { heute: "2026-10-05" });
    assert.match(t, /^Wichtigkeits-Wächter — Montag, 05\.10\.2026\nLivegang 01\.12\.2026: noch 57 Tage\./);
    assert.match(t, /Offen: A 3 · B 1 · C 1 — davon bei dir: A 1 · B 0 · C 1/);
    assert.match(t, /Erledigt in den letzten 7 Tagen: 1 — OP-06 frisch erledigt/);
    assert.doesNotMatch(t, /OP-07/);
  });

  it("C als Liste nur in der ersten Woche des Monats (oder mit --alle), sonst die Zahl", () => {
    assert.match(erinnerung(reg, { heute: "2026-10-05" }), /C — später \(1\)\n {2}bei dir \(1\):\n {2}- OP-05 C-Punkt/);
    const spaeter = erinnerung(reg, { heute: "2026-10-12" });
    assert.match(spaeter, /C — später \(1\): die Liste kommt in der ersten Woche des Monats \(nächste ab 01\.11\.2026\)\./);
    assert.doesNotMatch(spaeter, /OP-05/);
    assert.match(erinnerung(reg, { heute: "2026-10-12", alleC: true }), /- OP-05 C-Punkt/);
    assert.match(erinnerung(reg, { heute: "2026-12-14" }), /nächste ab 01\.01\.2027/, "Jahreswechsel");
  });

  it("nach dem Livegang ist jedes offene A überfällig", () => {
    const t = erinnerung(reg, { heute: "2026-12-07" });
    assert.match(t, /Livegang 01\.12\.2026: seit 6 Tagen überschritten\./);
    assert.match(t, /OP-02 ÜBERFÄLLIG seit 01\.12\.2026 — Neu beim Owner/);
    assert.doesNotMatch(t, /OP-04 ÜBERFÄLLIG/, "B hat ohne eigene Frist keine");
  });

  it("Hinweis auf Befunde, und leere Klassen sagen es", () => {
    const leer = leseRegister(register());
    const t = erinnerung(leer, { heute: "2026-10-05", hinweise: ["x", "y"] });
    assert.match(t, /A — muss vor dem Livegang stehen \(0\)\n {2}nichts offen/);
    assert.match(t, /Hinweis: das Register hat 2 Befund\(e\)/);
  });

  it("Klartext und Tageszählung", () => {
    assert.equal(klartext("**fett** und *schräg*, `code` und [Link](a.md#x)"), "fett und schräg, code und Link");
    assert.equal(tageZwischen("2026-10-05", "2026-12-01"), 57);
    assert.equal(tageZwischen("2026-03-28", "2026-03-30"), 2, "über die Zeitumstellung hinweg");
  });
});

describe("Welcher Stand gilt: der jüngste Commit am Register", () => {
  const git = (antworten) => (args) => {
    const schluessel = args[0] === "log" ? `log ${args[3]}` : `show ${args[1]}`;
    if (!(schluessel in antworten)) throw new Error("unbekannter Zweig");
    return antworten[schluessel];
  };

  it("nimmt den jüngeren Zweig und liest das Register von dort", () => {
    const r = waehleFrischesten({ zweige: ["cloud", "k1"], ausfuehren: git({
      "log origin/cloud": "1759300000\n", "log origin/k1": "1759400000\n",
      "show origin/k1:docs/WICHTIGKEIT.md": "REGISTER-K1",
    }) });
    assert.deepEqual(r, { zweig: "k1", zeit: 1759400000, text: "REGISTER-K1" });
  });

  it("übergeht einen fehlenden Zweig; ohne jeden Treffer null", () => {
    const r = waehleFrischesten({ zweige: ["weg", "cloud"], ausfuehren: git({
      "log origin/cloud": "1759300000", "show origin/cloud:docs/WICHTIGKEIT.md": "REGISTER-CLOUD",
    }) });
    assert.equal(r.zweig, "cloud");
    assert.equal(waehleFrischesten({ zweige: ["weg"], ausfuehren: git({}) }), null);
    assert.equal(waehleFrischesten({ zweige: ["leer"], ausfuehren: git({ "log origin/leer": "" }) }), null,
      "ein Zweig ohne Commit am Register zählt nicht");
  });
});

describe("Aufruf von der Kommandozeile", () => {
  const lauf = (...args) => spawnSync(process.execPath, [SKRIPT, ...args], { cwd: WURZEL, encoding: "utf8", timeout: 30000 });

  it("--pruefen ist am echten Stand grün", () => {
    const r = lauf("--pruefen");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^Register in Ordnung: \d+ offen, \d+ erledigt\./);
  });

  it("die Erinnerung für einen Tag, und ein kaputtes Datum wird abgewiesen", () => {
    const r = lauf("--heute=2026-10-05");
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.indexOf("\nA — ") < r.stdout.indexOf("\nB — ") && r.stdout.indexOf("\nB — ") < r.stdout.indexOf("\nC — "));
    assert.doesNotMatch(r.stdout, /Hinweis: das Register hat/, "am echten Stand keine Befunde");
    const k = lauf("--heute=morgen");
    assert.equal(k.status, 2);
  });
});
