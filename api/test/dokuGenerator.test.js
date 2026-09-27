/**
 * P11 / Welle W3 — der Generator und seine zwei Zusagen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS PASSIERT IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Doku-Waechter rechnet die Zahlen im Register nach — eine davon bewusst
 * nicht: die Zahl der Testdateien. Seine Begruendung stand im Code und war
 * richtig: sie aendert sich mit jedem neuen Test, und ein Alarm bei jeder
 * normalen Arbeit trainiert das Wegschauen an. Sie sollte in den Generator.
 *
 * Bis es den gab, ist genau das passiert, was ungezaehlte Zahlen tun. Am
 * 2026-08-22 nannte `docs/PLATTFORM_REGISTER.md` an drei Stellen
 * 340 Backend-Testdateien. Es waren 359.
 *
 * Mit `api/scripts/doku-generieren.js` ist der Einwand ausgeraeumt: der Alarm
 * hat jetzt einen Ein-Befehl-Fix. Deshalb darf die Zahl wieder geprueft werden.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE ZWEI ZUSAGEN, DIE HIER HAENGEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. Die Zahlen im Register stimmen.  (sonst war der Generator umsonst)
 *   2. Der Generator frisst keinen geschriebenen Text.  (sonst benutzt ihn
 *      nach dem ersten Verlust niemand mehr — und Zusage 1 waere wertlos)
 *
 * Zusage 2 ist die unscheinbarere und die wichtigere. Ein Generator ist ein
 * Programm mit Schreibrecht auf ein Dokument, das Menschen pflegen. Das ist nur
 * so lange vertretbar, wie sein Wirkungsbereich beweisbar klein ist.
 *
 * Deshalb prueft dieser Test ihn nicht nur, sondern gegen sich selbst: Schicht
 * A rechnet UNABHAENGIG nach, statt `pruefe()` zu fragen. Ein Test, der die
 * Rechnung des Skripts mit der Rechnung des Skripts vergleicht, ist immer gruen.
 *
 * Run: node --test --test-force-exit test/dokuGenerator.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { WERTE, pruefe, fortschreiben } from "../scripts/doku-generieren.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
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

const ROOT = findeWurzel();
const SKRIPT = ROOT ? path.join(ROOT, "api", "scripts", "doku-generieren.js") : null;
const REGISTER = ROOT ? path.join(ROOT, "docs", "PLATTFORM_REGISTER.md") : null;

/* Untergrenzen: faellt eine Zaehlung auf 0, weil ein Pfad nicht mehr stimmt,
 * schriebe der Generator eine 0 ins Investorendokument. Das waere schlimmer als
 * eine veraltete Zahl — es saehe naemlich frisch aus. */
const MIN_BACKEND_TESTS = 300;
const MIN_E2E_TESTS = 10;
/* Z3 (2026-09-27): die datenbankgebundenen Ablauf-Proben sind die, die das
   Schema wirklich beweisen - ein Muster-Pool nimmt jede Abfrage an. Die Grenze
   ist bewusst niedrig: sie faengt einen falschen Pfad (0 Treffer), nicht eine
   bewusst kleine Zahl. */
const MIN_ABLAUFPROBEN = 20;

/**
 * Die unabhaengige Gegenrechnung. Bewusst hier ausgeschrieben und NICHT aus dem
 * Skript importiert: nur so ist es eine zweite Meinung. Faellt eine Marke aus
 * dem Skript raus oder kommt eine dazu, meldet A0 das — die Liste kann nicht
 * still auseinanderlaufen.
 */
const ERWARTET = {
  "backend-testdateien": (w) =>
    fs.readdirSync(path.join(w, "api", "test")).filter((f) => f.endsWith(".test.js")).length,
  "e2e-testdateien": (w) => fs.readdirSync(path.join(w, "e2e", "tests")).length,
  "ablaufproben": (w) =>
    fs.readdirSync(path.join(w, "api", "test", "integration"))
      .filter((f) => f.endsWith(".flow.test.js")).length,
};

describe("Doku-Generator (W3) — die Zahlen im Register und der Wirkungsbereich", () => {
  let register = "";

  before(() => {
    if (ROOT) register = fs.readFileSync(REGISTER, "utf8");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Grundlage
   * ═══════════════════════════════════════════════════════════════════════ */

  it("findet Wurzel, Skript und Register", () => {
    assert.ok(ROOT, "keine Wurzel mit docs/PLATTFORM_REGISTER.md und api/test/ gefunden");
    assert.ok(fs.existsSync(SKRIPT), `${SKRIPT} fehlt — der Generator ist weg`);
  });

  it("A0: Skript und Gegenrechnung kennen dieselben Marken",
    { skip: !ROOT && "keine Wurzel" }, () => {
      /* Ohne diesen Abgleich koennte jemand einen Wert ins Skript aufnehmen, den
         niemand gegenrechnet — der Generator schriebe ihn dann ungeprueft in ein
         Dokument, das an Investoren geht. */
      assert.deepEqual(
        WERTE.map((w) => w.marke).sort(),
        Object.keys(ERWARTET).sort(),
        "Die Werte im Generator und die unabhaengige Gegenrechnung in diesem Test " +
        "sind auseinandergelaufen. Wer einen Wert ergaenzt, ergaenzt beide Seiten.");
    });

  it("die Zaehlungen liefern plausible Groessen",
    { skip: !ROOT && "keine Wurzel" }, () => {
      const backend = ERWARTET["backend-testdateien"](ROOT);
      const e2e = ERWARTET["e2e-testdateien"](ROOT);
      assert.ok(backend >= MIN_BACKEND_TESTS,
        `nur ${backend} Backend-Testdateien gezaehlt (erwartet >= ${MIN_BACKEND_TESTS}) — ` +
        "vermutlich zeigt der Pfad woandershin. Der Generator wuerde diese Zahl schreiben.");
      assert.ok(e2e >= MIN_E2E_TESTS, `nur ${e2e} E2E-Dateien gezaehlt`);
      const ablauf = ERWARTET["ablaufproben"](ROOT);
      assert.ok(ablauf >= MIN_ABLAUFPROBEN,
        `nur ${ablauf} Ablauf-Proben gezaehlt (erwartet >= ${MIN_ABLAUFPROBEN}) \u2014 ` +
        "vermutlich zeigt der Pfad woandershin, oder die Namenskonvention *.flow.test.js " +
        "wurde verlassen. Der Generator wuerde diese Zahl ins Register schreiben.");
    });

  /* ═══════════════════════════════════════════════════════════════════════
   * Zusage 1 — die Zahlen im Register stimmen
   * ═══════════════════════════════════════════════════════════════════════ */

  it("A1: jede erzeugte Zahl im Register stimmt mit dem Bestand ueberein",
    { skip: !ROOT && "keine Wurzel" }, () => {
      const abweichungen = [];
      for (const [id, rechne] of Object.entries(ERWARTET)) {
        const soll = rechne(ROOT);
        const re = new RegExp(`<!--\\s*zahl:${id}\\s*-->([\\s\\S]*?)<!--\\s*/zahl\\s*-->`, "g");
        const stellen = [...register.matchAll(re)].map((m) => m[1].trim());

        if (stellen.length === 0) {
          abweichungen.push(`${id}: keine Marke im Register — der Wert wird nirgends gepflegt`);
          continue;
        }
        for (const [i, ist] of stellen.entries()) {
          if (ist !== String(soll)) {
            abweichungen.push(`${id} (Fundstelle ${i + 1} von ${stellen.length}): ` +
              `Register sagt "${ist}", nachgerechnet ${soll}`);
          }
        }
      }
      assert.deepEqual(abweichungen, [],
        "Die Zahlen im Register sind veraltet.\n" +
        "Das ist kein Denkfehler, sondern normale Drift — deshalb gibt es dafuer einen Befehl:\n\n" +
        "    node api/scripts/doku-generieren.js\n\n" +
        "Er fasst ausschliesslich den Text zwischen den Marken an.\n");
    });

  it("A2: `--pruefen` liest nur — und ist mit der Gegenrechnung einig",
    { skip: !ROOT && "keine Wurzel" }, () => {
      /* Bewusst KEINE zweite Drift-Pruefung: die macht A1, und zwei rote Tests
         fuer denselben Befund verwaessern beide. Hier geht es um die Frage, die
         A1 nicht stellen kann — sind sich das Skript und die unabhaengige
         Gegenrechnung dieses Tests EINIG? Uneinigkeit in beide Richtungen ist
         der eigentliche Fehler: ein Skript, das Drift uebersieht, schreibt
         falsche Zahlen fort; eines, das welche erfindet, macht jeden Lauf rot. */
      const aktuell = fs.readFileSync(REGISTER, "utf8");
      const driftLautGegenrechnung = Object.entries(ERWARTET).some(([id, rechne]) => {
        const re = new RegExp(`<!--\\s*zahl:${id}\\s*-->([\\s\\S]*?)<!--\\s*/zahl\\s*-->`, "g");
        const stellen = [...aktuell.matchAll(re)].map((m) => m[1].trim());
        return stellen.length === 0 || stellen.some((s) => s !== String(rechne(ROOT)));
      });

      const r = spawnSync(process.execPath, [SKRIPT, "--pruefen"],
        { cwd: ROOT, encoding: "utf8" });

      assert.equal(fs.readFileSync(REGISTER, "utf8"), aktuell,
        "`--pruefen` hat das Register veraendert — es darf ausschliesslich lesen.");
      assert.equal(r.status === 0, !driftLautGegenrechnung,
        `Skript und Gegenrechnung sind uneinig: das Skript meldet ` +
        `${r.status === 0 ? "keine" : "eine"} Drift, die unabhaengige Rechnung ` +
        `${driftLautGegenrechnung ? "eine" : "keine"}.\n${r.stdout}${r.stderr}`);
    });

  /* ═══════════════════════════════════════════════════════════════════════
   * Zusage 2 — der Wirkungsbereich ist beweisbar klein
   * ═══════════════════════════════════════════════════════════════════════ */

  it("B1: zehn Laeufe lassen handgeschriebenen Text Zeichen fuer Zeichen stehen",
    { skip: !ROOT && "keine Wurzel" }, () => {
      const kuratiert = [
        "# Ein handgeschriebenes Dokument",
        "",
        "Dieser Absatz gehoert einem Menschen. Er enthaelt eine 340, eine Tabelle",
        "und sogar das Wort backend-testdateien im Fliesstext.",
        "",
        "| Groesse | Zahl | Herkunft |",
        "|---|---|---|",
        "| Backend-Testdateien | <!--zahl:backend-testdateien-->1<!--/zahl--> | `ls` |",
        "| Handgepflegt | 42 | niemand fasst das an |",
        "",
        "Und hier steht nochmal <!--zahl:e2e-testdateien-->1<!--/zahl--> mitten im Satz.",
        "",
        "Schluss. 340 340 340.",
      ].join("\n");

      let text = kuratiert;
      for (let i = 0; i < 10; i++) text = fortschreiben(text, pruefe(ROOT, text));

      const soll = {
        backend: ERWARTET["backend-testdateien"](ROOT),
        e2e: ERWARTET["e2e-testdateien"](ROOT),
      };
      const erwartet = kuratiert
        .replace("<!--zahl:backend-testdateien-->1<!--/zahl-->",
          `<!--zahl:backend-testdateien-->${soll.backend}<!--/zahl-->`)
        .replace("<!--zahl:e2e-testdateien-->1<!--/zahl-->",
          `<!--zahl:e2e-testdateien-->${soll.e2e}<!--/zahl-->`);

      assert.equal(text, erwartet,
        "Der Generator hat ausserhalb der Marken geschrieben. Genau das darf er nie:\n" +
        "ein Generator, der einmal einen geschriebenen Satz gefressen hat, wird nie\n" +
        "wieder benutzt — und dann veraltet auch alles, was er richtig gemacht haette.");
    });

  it("B2: der zweite Lauf erzeugt keinen Diff (Gate W3, Idempotenz)",
    { skip: !ROOT && "keine Wurzel" }, () => {
      const einmal = fortschreiben(register, pruefe(ROOT, register));
      const zweimal = fortschreiben(einmal, pruefe(ROOT, einmal));
      assert.equal(zweimal, einmal,
        "Zwei Laeufe ohne Codeaenderung erzeugen unterschiedliche Ergebnisse. " +
        "Ein nicht-idempotenter Generator macht jeden Diff unlesbar.");
    });

  /* ═══════════════════════════════════════════════════════════════════════
   * Der Lauf am echten Skript — in einer Attrappe, nicht am Repo
   * ═══════════════════════════════════════════════════════════════════════ */

  describe("C: das Skript von aussen, gegen eine Attrappe", () => {
    /* Warum eine Attrappe: den Schreibpfad am echten Register zu pruefen hiesse,
       waehrend des Testlaufs in ein versioniertes Dokument zu schreiben. Die
       Attrappe hat denselben Aufbau, aber frei waehlbare Zahlen — damit ist der
       Drift-Fall ueberhaupt erst herstellbar. */
    let sandkasten = null;

    before(() => {
      if (!ROOT) return;
      sandkasten = fs.mkdtempSync(path.join(os.tmpdir(), "doku-w3-"));
      fs.mkdirSync(path.join(sandkasten, "docs"), { recursive: true });
      fs.mkdirSync(path.join(sandkasten, "api", "test"), { recursive: true });
      fs.mkdirSync(path.join(sandkasten, "e2e", "tests"), { recursive: true });
      /* Z3: die Ablauf-Proben liegen in einem eigenen Verzeichnis - ohne es
         zaehlt der Generator gegen ein fehlendes Verzeichnis. */
      fs.mkdirSync(path.join(sandkasten, "api", "test", "integration"), { recursive: true });

      for (const n of ["a", "b", "c"]) {
        fs.writeFileSync(path.join(sandkasten, "api", "test", `${n}.test.js`), "// leer\n");
      }
      fs.writeFileSync(path.join(sandkasten, "api", "test", "keintest.js"), "// zaehlt nicht\n");
      fs.writeFileSync(path.join(sandkasten, "e2e", "tests", "eins.spec.js"), "// leer\n");
      for (const n of ["eins", "zwei"]) {
        fs.writeFileSync(
          path.join(sandkasten, "api", "test", "integration", `${n}.flow.test.js`), "// leer\n");
      }
      /* Zaehlt NICHT mit: die Namenskonvention ist *.flow.test.js, und genau das
         soll die Attrappe beweisen. */
      fs.writeFileSync(
        path.join(sandkasten, "api", "test", "integration", "nureintest.test.js"), "// leer\n");

      fs.writeFileSync(path.join(sandkasten, "docs", "PLATTFORM_REGISTER.md"),
        "# Attrappe\n\n" + "Fuellzeile.\n".repeat(600) +
        "\n| Backend-Testdateien | <!--zahl:backend-testdateien-->999<!--/zahl--> | x |\n" +
        "| E2E-Testdateien | <!--zahl:e2e-testdateien-->999<!--/zahl--> | x |\n" +
        "| Ablauf-Proben | <!--zahl:ablaufproben-->999<!--/zahl--> | x |\n" +
        "\nStand: <!--zahl:stand-->1999-01-01<!--/zahl-->\n" +
        "\nHandgeschrieben: 999 bleibt hier stehen.\n");
    });

    after(() => {
      if (sandkasten) fs.rmSync(sandkasten, { recursive: true, force: true });
    });

    const lauf = (...args) =>
      spawnSync(process.execPath, [SKRIPT, ...args], { cwd: sandkasten, encoding: "utf8" });
    const attrappe = () =>
      fs.readFileSync(path.join(sandkasten, "docs", "PLATTFORM_REGISTER.md"), "utf8");

    it("C1: `--pruefen` erkennt Drift, meldet Exit 1 und schreibt nicht",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const vorher = attrappe();
        const r = lauf("--pruefen");
        assert.equal(r.status, 1, `erwartet Exit 1 bei Drift, war ${r.status}\n${r.stdout}${r.stderr}`);
        assert.equal(attrappe(), vorher, "`--pruefen` hat geschrieben");
        assert.match(r.stdout, /Backend-Testdateien/);
      });

    it("C2: der Schreiblauf setzt die Zahlen und das Datum",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const r = lauf();
        assert.equal(r.status, 0, r.stdout + r.stderr);
        const t = attrappe();
        assert.match(t, /<!--zahl:backend-testdateien-->3<!--\/zahl-->/,
          "die drei *.test.js der Attrappe wurden nicht gezaehlt (oder keintest.js zaehlte mit)");
        assert.match(t, /<!--zahl:e2e-testdateien-->1<!--\/zahl-->/);
        assert.doesNotMatch(t, /<!--zahl:stand-->1999-01-01<!--\/zahl-->/,
          "das Datum ist nicht mitgewandert, obwohl sich Zahlen geaendert haben");
        assert.match(t, /Handgeschrieben: 999 bleibt hier stehen\./,
          "der handgeschriebene Satz wurde veraendert");
      });

    it("C3: der zweite Lauf schreibt die Datei nicht mehr an",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const vorher = attrappe();
        const vorZeit = fs.statSync(path.join(sandkasten, "docs", "PLATTFORM_REGISTER.md")).mtimeMs;
        const r = lauf();
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.equal(attrappe(), vorher, "der zweite Lauf hat den Inhalt veraendert");
        assert.equal(
          fs.statSync(path.join(sandkasten, "docs", "PLATTFORM_REGISTER.md")).mtimeMs, vorZeit,
          "der zweite Lauf hat die Datei angefasst, obwohl sich nichts geaendert hat — " +
          "das erzeugt in jedem Build einen leeren Diff");
        assert.match(r.stdout, /nichts zu schreiben/);
      });

    it("C4: fehlt einem Wert die Marke, bricht das Skript ab statt still nichts zu tun",
      { skip: !ROOT && "keine Wurzel" }, () => {
        /* Der gefaehrlichste Zustand waere: Marke versehentlich geloescht, Skript
           laeuft weiter, meldet "alles stimmt" — und die Zahl daneben veraltet
           unbemerkt weiter. Genau der Ausgangsfall dieser ganzen Welle. */
        const pfad = path.join(sandkasten, "docs", "PLATTFORM_REGISTER.md");
        const heil = fs.readFileSync(pfad, "utf8");
        fs.writeFileSync(pfad, heil.replace(/<!--zahl:e2e-testdateien-->[^<]*<!--\/zahl-->/, "17"));

        const r = lauf("--pruefen");
        assert.equal(r.status, 2, `erwartet Exit 2 bei fehlender Marke, war ${r.status}`);
        assert.match(r.stderr, /keine Marke|E2E-Testdateien/);

        fs.writeFileSync(pfad, heil);
      });
  });
});
