/**
 * ═══════════════════════════════════════════════════════════════════════════
 * W5.2 / W4.2 — WAS IM OEFFENTLICHEN REPOSITORY LIEGEN DARF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Das Repository ist oeffentlich, und die Unterlagen des Owners liegen im
 * selben Baum. Bis zum 2026-08-15 lagen sie nur UNGETRACKT dort — das genuegt
 * nicht: ein `git add docs/` nimmt sie mit, und genau das ist an dem Tag
 * passiert (Commit zurueckgenommen, Historie umgeschrieben).
 *
 * GEMESSEN AM 2026-09-21, und das war der Befund dieser Welle: die Sperre fuer
 * Office-Dateien in der Wurzel stand in `.git/info/exclude`. Diese Datei
 * WANDERT NICHT MIT. Sie schuetzt genau einen Arbeitsplatz; ein frischer Klon
 * — anderer Rechner, CI, neue Mitarbeit — hatte die Regel nicht. Eine Sperre,
 * die nur lokal existiert, ist im Zweifel keine. Sie steht jetzt in
 * `.gitignore`, und Teil B haelt sie dort fest.
 *
 * WARUM DER SCHLUESSEL-WAECHTER NICHTS NEU ERFINDET (W4.2): die Regel, was ein
 * echter Zugangswert ist, gibt es seit der Release-Pruefung
 * (`scripts/lib/secretScan.mjs`). Sie ist an echten Werten GEMESSEN worden —
 * Anbieter-Praefix mit strengem Format, sonst Laenge UND Entropie — und
 * unterscheidet damit einen Schluessel von einem deutschen Satz. Sie lief
 * bisher nur gegen das RELEASE-PAKET. Hier laeuft dieselbe Regel gegen die
 * getrackten Dateien: was im Paket nicht liegen darf, darf erst recht nicht in
 * der Historie liegen — aus der bekommt man es naemlich nicht mehr heraus.
 *
 * Lauf: node --test --test-force-exit test/repoHygiene.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pruefeDatei } from "../../scripts/lib/secretScan.mjs";

/* Pfade relativ zur Testdatei — sonst haengt das Ergebnis am Startverzeichnis
   und die Probe ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HIER, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

/** Getrackte Dateien = genau das, was veroeffentlicht wird. */
function getrackteDateien() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024
  }).split("\0").filter(Boolean);
}

const OFFICE = /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i;

/* PDFs nur dort, wo sie ein PRUEFGEGENSTAND sind (Rechnungsvorlagen,
   ZUGFeRD-Muster). Ueberall sonst ist ein PDF im Zweifel eine
   Geschaeftsunterlage. */
const PDF_ERLAUBT = [/^api\/test\/fixtures\//i, /^e2e\/fixtures\//i, /^api\/assets\//i];

let dateien = [];

describe("W5.2 · keine Geschaeftsunterlagen im oeffentlichen Repository", () => {
  before(() => { dateien = getrackteDateien(); });

  it("die Erhebung sieht ueberhaupt hin", () => {
    /* Ohne diese Probe waere der ganze Waechter lautlos gruen, sobald `git`
       fehlt oder aus dem falschen Verzeichnis laeuft: eine leere Liste besteht
       jede Schleife. */
    assert.ok(dateien.length > 1500,
      `nur ${dateien.length} getrackte Dateien gefunden — erwartet ueber 1500. `
      + "Entweder ist die Erhebung kaputt, oder dieser Waechter liest ins Leere.");
  });

  it("keine Office-Datei ist getrackt", () => {
    const gefunden = dateien.filter((d) => OFFICE.test(d));
    assert.deepStrictEqual(gefunden, [],
      "Office-Dateien im oeffentlichen Repository. Aus der Historie bekommt man sie "
      + "nicht mehr heraus, ohne sie umzuschreiben.");
  });

  it("PDFs liegen nur an benannten Stellen", () => {
    const gefunden = dateien
      .filter((d) => /\.pdf$/i.test(d))
      .filter((d) => !PDF_ERLAUBT.some((m) => m.test(d)));
    assert.deepStrictEqual(gefunden, [],
      "PDF ausserhalb der benannten Pruefpfade. Wenn es eine Testvorlage ist, gehoert "
      + "sie nach api/test/fixtures/ — und dann steht sie dort bewusst, nicht versehentlich.");
  });

  it("GEGENPROBE: die Einstufung erkennt eine Office-Datei und ein fremdes PDF", () => {
    /*
     * Die beiden Proben darueber sind heute gruen, WEIL nichts Verbotenes
     * getrackt ist — sie waeren es auch mit einer Einstufung, die nichts mehr
     * erkennt. Deshalb hier dieselbe Einstufung an einer erfundenen Liste:
     * wer sie abschwaecht, faellt hier auf, ohne dass jemand eine echte
     * Office-Datei ins Repository legen muesste.
     */
    const erfunden = [
      "TempConnect-Businessplan.docx",
      "docs/kalkulation.xlsx",
      "api/test/fixtures/musterrechnung.pdf",
      "docs/vertrag-entwurf.pdf",
      "api/services/marketplaceService.js"
    ];
    assert.deepStrictEqual(erfunden.filter((d) => OFFICE.test(d)),
      ["TempConnect-Businessplan.docx", "docs/kalkulation.xlsx"],
      "die Office-Einstufung erkennt eine Office-Datei nicht mehr");
    assert.deepStrictEqual(
      erfunden.filter((d) => /\.pdf$/i.test(d)).filter((d) => !PDF_ERLAUBT.some((m) => m.test(d))),
      ["docs/vertrag-entwurf.pdf"],
      "die PDF-Einstufung laesst ein PDF ausserhalb der Pruefpfade durch — oder "
      + "schlaegt bei der Testvorlage an, die dort liegen DARF");
  });

  it("die Sperre steht in .gitignore, nicht nur im lokalen Ausschluss", () => {
    /*
     * DER BEFUND DIESER WELLE. `.git/info/exclude` gilt nur auf dem einen
     * Rechner, auf dem es liegt. Wer das Repository frisch klont, hat die
     * Regel nicht — und legt die naechste Owner-Unterlage in eine Wurzel, die
     * sie nicht mehr ignoriert.
     */
    const regeln = fs.readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8").split(/\r?\n/);
    for (const regel of ["/*.docx", "/*.xlsx", "/*.pptx", "/~$*"]) {
      assert.ok(regeln.some((z) => z.trim() === regel),
        `.gitignore fuehrt die Regel '${regel}' nicht. Steht sie nur in `
        + ".git/info/exclude, schuetzt sie genau einen Arbeitsplatz.");
    }
  });
});

describe("W4.2 · kein echter Zugangswert in getrackten Dateien", () => {
  before(() => { if (!dateien.length) dateien = getrackteDateien(); });

  it("keine getrackte Datei traegt einen Wert, mit dem sich jemand anmelden koennte", () => {
    const treffer = [];
    let gelesen = 0;
    for (const rel of dateien) {
      let inhalt;
      try { inhalt = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"); } catch { continue; }
      if (inhalt.includes("\u0000")) continue;          // binaer
      gelesen++;
      for (const fund of pruefeDatei(inhalt) || []) {
        treffer.push(`${rel}: ${typeof fund === "string" ? fund : JSON.stringify(fund)}`);
      }
    }
    assert.ok(gelesen > 1500, `nur ${gelesen} Dateien gelesen — die Pruefung liest ins Leere`);
    assert.deepStrictEqual(treffer, [],
      "Ein echter Zugangswert liegt in einer getrackten Datei. Er ist damit in der "
      + "Historie und muss rotiert werden — Loeschen im naechsten Commit genuegt nicht.");
  });

  it("GEGENPROBE: ein echter Wert WIRD gefunden", () => {
    /*
     * Ohne sie bestuende die Probe oben auch dann, wenn die Regel blind waere —
     * und eine leise Pruefung ist genau der Zustand, den W4.2 verhindern soll.
     * Die Werte hier sind erfunden, tragen aber das strenge Format, an dem
     * `secretScan` echte Schluessel erkennt. Zusammengesetzt statt ausgeschrieben,
     * damit diese Datei die Muster nicht selbst traegt: ein Waechter, der seine
     * eigene Beschreibung findet, ist schon dreimal in diesem Projekt
     * zugeschnappt.
     */
    const gepflanzt = [
      "STRIPE_SECRET_KEY=" + "sk_" + "live_" + "51H8sKQ2eZvKYlo2C0BdqPzXmN4tRvW9",
      "GITHUB_TOKEN=" + "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
    ].join("\n");
    const funde = pruefeDatei(gepflanzt) || [];
    assert.ok(funde.length >= 2,
      `die Regel hat ${funde.length} von 2 gepflanzten Werten gefunden — sie ist blind geworden`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   KEINE STEUERZEICHEN IN TEXTDATEIEN
   ═══════════════════════════════════════════════════════════════════════════
 *
 * NICHT AUSGEDACHT, SONDERN DREIMAL AN EINEM TAG PASSIERT (2026-09-21):
 * Eine Escape-Sequenz, die durch mehrere Werkzeugschichten geschrieben wird,
 * kommt als das ZEICHEN an, nicht als die zwei Zeichen. Getroffen hat es
 *
 *   - eine Probendatei, die dadurch ein NUL-Byte trug: `git` stufte sie als
 *     BINAER ein — ausgerechnet die Probe fuer Repo-Hygiene;
 *   - eine Commit-Nachricht: `git` verweigerte sie rundheraus
 *     ("a NUL byte in commit log message not allowed");
 *   - eine Regex in einer Probe, in der aus der Wortgrenze ein
 *     BACKSPACE-Byte wurde. Die Probe war gruen, verglich aber gegen ein
 *     Zeichen, das im Zieltext nie vorkommt — sie haette NIE etwas gefangen.
 *
 * Beim Messen fuer diesen Waechter kamen ausserdem VIER alte Vorkommen in zwei
 * Planungsdokumenten zutage, an genau der Stelle, an der beide Texte diese
 * Falle BESCHREIBEN. Sie sind mitreparaturiert.
 *
 * Das letzte ist das gefaehrlichste: ein Steuerzeichen faellt in keinem
 * Editor auf, ueberlebt jede Durchsicht und macht eine Pruefung still wertlos.
 */

const TEXT_ENDUNGEN = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".sql",
  ".html", ".css", ".yml", ".yaml", ".sh", ".txt", ".env", ".xml", ".svg", ".conf"]);
const TEXT_OHNE_ENDUNG = new Set(["Dockerfile", ".gitignore", ".dockerignore",
  ".gitattributes", ".editorconfig"]);
/* Tabulator, Zeilenvorschub und Wagenruecklauf sind erlaubt — alles andere
   unterhalb von 0x20 hat in einer Textdatei nichts verloren. */
const VERBOTENE_BYTES = [0x00, 0x07, 0x08, 0x0b, 0x0c, 0x1b];

describe("Repo-Hygiene · keine Steuerzeichen in Textdateien", () => {
  before(() => { if (!dateien.length) dateien = getrackteDateien(); });

  it("keine getrackte Textdatei traegt ein Steuerzeichen", () => {
    const befunde = [];
    let geprueft = 0;
    for (const rel of dateien) {
      const name = path.basename(rel);
      const endung = path.extname(name).toLowerCase();
      if (!TEXT_ENDUNGEN.has(endung) && !TEXT_OHNE_ENDUNG.has(name)) continue;
      let roh;
      try { roh = fs.readFileSync(path.join(REPO_ROOT, rel)); } catch { continue; }
      geprueft++;
      for (const byte of VERBOTENE_BYTES) {
        let anzahl = 0;
        for (const b of roh) if (b === byte) anzahl++;
        if (anzahl) befunde.push(`${rel}: 0x${byte.toString(16).padStart(2, "0")} x${anzahl}`);
      }
    }
    assert.ok(geprueft > 1500, `nur ${geprueft} Textdateien geprueft — der Waechter liest ins Leere`);
    assert.deepStrictEqual(befunde, [],
      "Steuerzeichen in einer Textdatei. Sie entstehen, wenn eine Escape-Sequenz durch "
      + "mehrere Werkzeugschichten geschrieben wird und als ZEICHEN ankommt. In keinem "
      + "Editor sichtbar, und eine Pruefung, die so ein Zeichen enthaelt, faengt nie etwas.");
  });

  it("GEGENPROBE: die Einstufung erkennt ein Steuerzeichen", () => {
    /* Ohne sie bestuende die Probe oben auch mit einer leeren Byte-Liste. */
    const mitZeichen = Buffer.from([0x61, 0x00, 0x62]);
    const gefunden = VERBOTENE_BYTES.some((byte) => mitZeichen.includes(byte));
    assert.ok(gefunden, "die Byte-Liste erkennt kein Steuerzeichen mehr");
    /* Tabulator (9) und Zeilenvorschub (10) ueber die Zeichenwerte gebaut: als
       Escape-Sequenz geschrieben landen sie als ZEICHEN in dieser Datei — genau
       der Fehler, den diese Probe bewacht. */
    const harmlos = Buffer.from("normal" + String.fromCharCode(9) + "text" + String.fromCharCode(10));
    assert.ok(!VERBOTENE_BYTES.some((byte) => harmlos.includes(byte)),
      "Tabulator oder Zeilenvorschub gelten als verboten — dann ist jede Datei ein Befund");
  });
});
