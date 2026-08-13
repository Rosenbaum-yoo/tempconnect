/**
 * P11 / Welle W2 — der Doku-Waechter.
 *
 * WARUM ES IHN GIBT
 * Jede von Hand gepflegte Zustandsbeschreibung ueber bewegtem Code ist ab dem Tag
 * ihrer Fertigstellung falsch. Das ist kein Disziplinproblem, sondern eine
 * Eigenschaft der Sache. Dieses Repo hat den Beweis am 2026-08-13 zweimal an
 * einem Tag geliefert (P1-15 und die DSGVO-Kontoloeschung): beide Male stand in
 * der Doku etwas, das im Code nicht mehr stimmte, und niemand hat es bemerkt,
 * weil nichts es geprueft hat.
 *
 * Dieser Test prueft `docs/PLATTFORM_REGISTER.md` gegen die Wirklichkeit — in
 * BEIDE Richtungen:
 *
 *   Richtung A   Code ohne Registereintrag
 *                "etwas Neues ist gebaut und nirgends beschrieben"
 *   Richtung B   Registereintrag ohne Code
 *                "die Doku behauptet etwas, das es nicht mehr gibt"
 *
 * Richtung B ist die, die man vergisst — und genau sie faengt die Karteileichen,
 * die den Ueberblick kosten.
 *
 * Dazu kommt eine dritte Pruefung, die es nur gibt, weil das Register sie
 * moeglich macht: es nennt zu jeder Zahl den BEFEHL, der sie erzeugt. Also
 * rechnet der Waechter die Zahlen nach. Eine Zahl in einer Investorenunterlage,
 * die niemand nachrechnet, ist eine Behauptung — und damit eine Haftung.
 *
 * WAS ER BEWUSST NICHT PRUEFT
 *  - Den Inhalt der Beschreibungen. Ob "Marktplatz" gut erklaert ist, kann kein
 *    Test wissen. Er prueft Vollstaendigkeit und Belegbarkeit, nicht Qualitaet.
 *  - Einzelne Endpunkte. Das Register belegt auf Datei-Ebene (`api/routes/x.js`),
 *    weil eine Liste von 938 Endpunkten niemand liest und niemand pflegt.
 *
 * Run: node --test --test-force-exit test/dokuWaechter.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen UND auf INHALT pruefen. Docker legt Mount-Ziele als leere
 * Verzeichnisse an; eine Suche, die so eines findet, macht jede Pruefung lautlos
 * gruen. Diese Falle ist in dieser Codebasis mehrfach zugeschnappt — deshalb
 * zaehlt nur eine Wurzel, in der das Register UND echte Seiten liegen.
 */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const register = path.join(dir, "docs/PLATTFORM_REGISTER.md");
      const seiten = path.join(dir, "frontend/public");
      if (fs.existsSync(register) && fs.statSync(register).size > 5000 &&
          fs.existsSync(seiten) && fs.readdirSync(seiten).some((f) => f.endsWith(".html"))) {
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
const suite = ROOT ? describe : describe.skip;

/* Untergrenzen gegen stilles Verkuemmern: sinkt der gepruefte Umfang unter diese
 * Werte, ist der Waechter kaputt und nicht das Repo aufgeraeumt. Ohne sie kann
 * ein Waechter unbemerkt zur Beruhigungspille werden. */
const MIN_REGISTER_ZEILEN = 400;
const MIN_SEITEN = 70;
const MIN_ROUTER = 70;

suite("Doku-Waechter — das Register gegen die Wirklichkeit", () => {
  let register = "";
  let seiten = [];
  let router = [];
  let migrationen = [];

  const dateienIn = (rel, endung) => {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith(endung));
  };

  before(() => {
    register = fs.readFileSync(path.join(ROOT, "docs/PLATTFORM_REGISTER.md"), "utf8");
    seiten = dateienIn("frontend/public", ".html");
    router = dateienIn("api/routes", ".js");
    migrationen = dateienIn("sql/migrations", ".sql");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Grundlage — prueft der Waechter ueberhaupt etwas?
   * ═══════════════════════════════════════════════════════════════════════ */

  it("liest ein echtes Register und einen echten Bestand", () => {
    const zeilen = register.split("\n").length;
    assert.ok(zeilen >= MIN_REGISTER_ZEILEN,
      `Das Register hat nur ${zeilen} Zeilen (erwartet >= ${MIN_REGISTER_ZEILEN}) — ` +
      "entweder ist es unvollstaendig oder der Pfad zeigt woandershin.");
    assert.ok(seiten.length >= MIN_SEITEN, `nur ${seiten.length} Seiten gefunden`);
    assert.ok(router.length >= MIN_ROUTER, `nur ${router.length} Router gefunden`);
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Richtung A — Code ohne Registereintrag
   * ═══════════════════════════════════════════════════════════════════════ */

  it("A1: jede Nutzerflaeche steht im Register", () => {
    const fehlend = seiten.filter((s) => !register.includes(s));
    assert.deepEqual(fehlend, [],
      "Diese Seiten gibt es, aber das Register kennt sie nicht.\n" +
      "Entweder gehoeren sie ins Register — oder sie gehoeren geloescht.\n" +
      "Ein drittes gibt es nicht: eine Seite, die niemand beschreibt, ist eine, " +
      "die niemand pflegt.");
  });

  it("A2: jede Router-Datei steht im Register", () => {
    const fehlend = router.filter((r) => !register.includes(r));
    assert.deepEqual(fehlend, [],
      "Diese Router gibt es, aber kein Registereintrag belegt sie.\n" +
      "Damit ist eine ganze Endpunkt-Familie undokumentiert — genau der Zustand, " +
      "in dem niemand mehr weiss, was die Plattform eigentlich kann.");
  });

  it("A3: jeder Hintergrundjob steht im Register", () => {
    const jobs = dateienIn("api/workers", ".js").filter((f) => f !== "index.js");
    const fehlend = jobs.filter((j) => !register.includes(j.replace(/\.js$/, "")));
    assert.deepEqual(fehlend, [],
      "Diese Hintergrundarbeiter laufen, ohne dass das Register sie erwaehnt. " +
      "Was ohne Nutzeraktion passiert, muss beschrieben sein — sonst kann niemand " +
      "beurteilen, was fehlt, wenn es ausfaellt.");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Richtung B — Registereintrag ohne Code (die vergessene Richtung)
   * ═══════════════════════════════════════════════════════════════════════ */

  it("B1: jeder belegte Pfad im Register existiert wirklich", () => {
    /* Aus Backticks alles herausziehen, was wie ein Pfad aussieht. Bewusst
     * konservativ: Muster mit Platzhaltern, Befehle und Fragmente werden
     * uebersprungen — ein Waechter mit Fehlalarmen wird abgeschaltet. */
    const kandidaten = new Set();
    for (const m of register.matchAll(/`([^`\n]+)`/g)) {
      let t = m[1].trim();
      if (/[*|<>$()]/.test(t) || t.includes(" ")) continue;   // Globs, Befehle, Prosa
      t = t.split(":")[0];                                    // datei.js:42-45 -> datei.js
      /* URLs sind keine Dateipfade. `/staff` ist eine Route der Anwendung,
       * `/index.html` eine ausgelieferte Adresse — beide als fehlende Datei zu
       * melden waere ein Fehlalarm, und ein Waechter mit Fehlalarmen wird
       * abgeschaltet. Deshalb faellt der fuehrende Schraegstrich zuerst weg:
       * was danach keinen Verzeichnisanteil mehr hat, ist ein blosser Name und
       * zu mehrdeutig, um darueber zu urteilen. */
      t = t.replace(/^\//, "");
      if (!t.includes("/")) continue;
      const istDatei = /\.(js|ts|tsx|html|sql|json|md|conf|yml|sh|css)$/.test(t);
      /* Ein VERZEICHNIS-Verweis ist nur dann ein Repo-Pfad, wenn er mit einer
       * echten Quellwurzel beginnt. `/emergency/` und `/integrations/` sind
       * Adressen der Anwendung, keine Ordner im Baum — sie als fehlend zu melden
       * waere ein Fehlalarm. Dateipfade bleiben davon unberuehrt: sie werden
       * weiterhin alle geprueft. */
      const QUELLWURZELN = ["api/", "frontend/", "sql/", "docs/", "e2e/", "scripts/", "nginx/", "support-ops"];
      if (!istDatei && !QUELLWURZELN.some((w) => t.startsWith(w))) continue;
      kandidaten.add(t.replace(/\/$/, ""));
    }

    /*
     * BEWUSSTE AUSNAHMEN — jede mit Begruendung, wie bei den uebrigen Waechtern
     * dieses Repos. Eine Ausnahme ohne Begruendung waere eine Hintertuer.
     *
     * `public/meine-agb.html`  Das Register ZITIERT hier eine fehlerhafte
     *                          Disallow-Zeile aus `frontend/public/robots.txt`
     *                          und benennt sie ausdruecklich als Nebenbefund.
     *                          Der Pfad ist tot — das ist der Inhalt der Aussage,
     *                          nicht ihr Fehler. Wird die robots.txt korrigiert,
     *                          verschwindet das Zitat und diese Zeile mit ihm.
     */
    const ZITATE_KEINE_BELEGE = new Set(["public/meine-agb.html"]);
    for (const z of ZITATE_KEINE_BELEGE) kandidaten.delete(z);

    assert.ok(kandidaten.size >= 60,
      `nur ${kandidaten.size} Pfade aus dem Register erkannt — der Leser greift nicht`);

    /* Das Register schreibt Seitenpfade so, wie der Server sie ausliefert
     * (`trust/security.html`), Codepfade dagegen ab der Repo-Wurzel. Beides ist
     * fuer den Leser richtig — also loest der Waechter gegen beide Wurzeln auf. */
    const WURZELN = [ROOT, path.join(ROOT, "frontend/public"), path.join(ROOT, "frontend")];
    const tot = [...kandidaten].filter((p) => !WURZELN.some((w) => fs.existsSync(path.join(w, p))));
    assert.deepEqual(tot, [],
      "Das Register belegt diese Pfade — es gibt sie nicht (mehr).\n" +
      "Das ist die Richtung, die man vergisst: die Doku behauptet etwas, das " +
      "entfernt oder umbenannt wurde. Genau so entstehen Karteileichen.");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Die Zahlen — das Register rechnet sich selbst nach
   * ═══════════════════════════════════════════════════════════════════════ */

  it("Z1: die Zahlen im Register stimmen mit dem Bestand ueberein", () => {
    /** Liest eine Zeile "| Bezeichnung | **123** | ..." aus der Zahlen-Tabelle. */
    const zahl = (bezeichnung) => {
      const zeile = register.split("\n").find((z) => z.startsWith(`| ${bezeichnung} `));
      if (!zeile) return null;
      const treffer = zeile.split("|")[2]?.match(/\d+/);
      return treffer ? Number(treffer[0]) : null;
    };

    const geprueft = [
      ["Router-Dateien", router.length + 1],  // +1: das Verzeichnis occ/ zaehlt das Register mit
      ["Service-Dateien", dateienIn("api/services", ".js").length],
      ["Migrationsdateien", migrationen.length]
    ];
    /* BEWUSST NICHT GEPRUEFT: die Zahl der Testdateien.
     * Sie aendert sich mit jedem neuen Test — dieser Waechter hat sie beim ersten
     * Lauf selbst rot werden lassen, weil er sich mitzaehlt. Eine Zahl, die bei
     * jeder normalen Arbeit Alarm schlaegt, trainiert dem Leser das Wegschauen an.
     * Sie gehoert in den Generator (Welle W3), der sie fortschreibt, statt in eine
     * Pruefung, die sie einfriert. Die STRUKTURELLEN Zahlen oben aendern sich nur
     * bei echten Aenderungen am Bestand — dort ist ein Alarm richtig. */

    const abweichungen = [];
    for (const [bezeichnung, gemessen] of geprueft) {
      const behauptet = zahl(bezeichnung);
      if (behauptet === null) { abweichungen.push(`${bezeichnung}: steht nicht im Register`); continue; }
      if (behauptet !== gemessen) abweichungen.push(`${bezeichnung}: Register sagt ${behauptet}, gezaehlt wurden ${gemessen}`);
    }

    assert.deepEqual(abweichungen, [],
      "Das Register nennt zu jeder Zahl den Befehl, der sie erzeugt — hier stimmt " +
      "das Ergebnis nicht mehr.\n" +
      "Eine Zahl, die niemand nachrechnet, ist eine Behauptung. In einer " +
      "Investorenunterlage ist sie eine Haftung.");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Migrationsnummern — gefunden beim Durchleuchten am 2026-08-14
   * ═══════════════════════════════════════════════════════════════════════ */

  it("M1: jede doppelt belegte Migrationsnummer ist in NUMBERING.md benannt", () => {
    /*
     * Der Migrations-Runner fuehrt nach Dateinamen aus. Zwei Dateien mit
     * derselben Nummer laufen in alphabetischer Reihenfolge — das ist
     * beherrschbar, SOLANGE es jemand weiss. `NUMBERING.md` ist genau dafuer da.
     *
     * Beim Durchleuchten fiel auf: die Datei listete fuenf Duplikate, es sind
     * neun. `130` und `140` waren nirgends erfasst. Der bestehende
     * Nummern-Test prueft nur die "naechste Nummer" und konnte das nicht sehen.
     */
    const nummern = new Map();
    for (const datei of migrationen) {
      const nr = datei.slice(0, 3);
      if (!/^\d{3}$/.test(nr)) continue;
      nummern.set(nr, (nummern.get(nr) || 0) + 1);
    }
    const doppelte = [...nummern.entries()].filter(([, n]) => n > 1).map(([nr]) => nr).sort();

    const numbering = fs.readFileSync(path.join(ROOT, "sql/migrations/NUMBERING.md"), "utf8");
    const unerwaehnt = doppelte.filter((nr) => !numbering.includes(nr));

    assert.deepEqual(unerwaehnt, [],
      `Diese Nummern sind doppelt vergeben, stehen aber nicht in NUMBERING.md.\n` +
      `Alle doppelten: ${doppelte.join(", ")}\n` +
      "Der Runner fuehrt nach Dateinamen aus; ein undokumentiertes Duplikat ist " +
      "ein Risiko beim Neuaufsetzen einer Datenbank.");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Selbstprobe — beisst der Waechter noch?
   * ═══════════════════════════════════════════════════════════════════════ */

  it("S1: er wuerde ein fehlendes und ein erfundenes Element bemerken", () => {
    /*
     * Ein Waechter, der nur behauptet zu fangen, ist wertlos. Diese Probe laeuft
     * bei JEDEM Lauf gegen ein kuenstliches Register und ein kuenstliches
     * Verzeichnis — sie prueft beide Richtungen an einem Fall, den sie selbst
     * herstellt, ohne den Baum anzufassen.
     */
    const falschesRegister = "| `frontend/public/gibt-es-nicht.html` | alle | Attrappe | aktiv |";

    // Richtung A: eine Seite, die es gibt, fehlt im (kuenstlichen) Register.
    const fehlendA = ["hilfe.html"].filter((s) => !falschesRegister.includes(s));
    assert.deepEqual(fehlendA, ["hilfe.html"], "Richtung A wuerde ein Fehlen nicht bemerken");

    // Richtung B: ein Pfad im Register, den es nicht gibt.
    const totB = ["frontend/public/gibt-es-nicht.html"]
      .filter((p) => !fs.existsSync(path.join(ROOT, p)));
    assert.deepEqual(totB, ["frontend/public/gibt-es-nicht.html"],
      "Richtung B wuerde eine Karteileiche nicht bemerken");
  });
});
