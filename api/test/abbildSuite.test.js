/**
 * Die Abbild-Suite — prueft sie noch das, was sie zu pruefen verspricht?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `--suite=image` laesst Tests WEG. Das ist genau die Sorte Mechanik, die
 * unbemerkt zur Beruhigungspille wird: eine Regel, die zu viel ausschliesst,
 * macht ein Gate gruen, das nichts mehr prueft — und niemand sieht es, weil
 * "gruen" ja das erwuenschte Ergebnis ist.
 *
 * Deshalb haengt die Regel hier an drei Zusicherungen:
 *
 *   1. Sie schliesst die RICHTIGEN aus  (die vier gemessenen Idiome greifen),
 *   2. sie schliesst nicht ZU VIEL aus  (Untergrenze auf dem, was laeuft),
 *   3. und sie laesst die API-Tests drin (Stichproben in beide Richtungen).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM STICHPROBEN UND KEINE VOLLSTAENDIGE LISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Liste aller 82 ausgeschlossenen Dateien hier waere die Namensliste, die
 * `abbildSuite.mjs` bewusst vermeidet — sie ginge bei jeder neuen Testdatei
 * rot, ohne dass etwas kaputt waere. Geprueft wird deshalb die REGEL an
 * Vertretern, die beide Seiten belegen, plus die Groessenordnung.
 *
 * Run: node --test --test-force-exit test/abbildSuite.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AUFSTIEG, brauchtRepoCheckout, ohneKommentare, teileNachAbbild } from "../scripts/lib/abbildSuite.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = HIER;

/* Untergrenzen: faellt die Suite darunter, prueft das Abbild-Gate zu wenig —
 * und ein Gate, das fast nichts mehr laeuft, ist schlimmer als keins, weil es
 * gruen meldet. (Gemessen 2026-08-25: 380 non-integration, 298 im Abbild.) */
const MIN_IM_ABBILD = 250;
const MAX_AUSGELASSEN = 140;

/* Vertreter beider Seiten. Bewusst wenige und langlebige: jeder steht fuer ein
 * Idiom bzw. fuer den Normalfall, nicht fuer sich selbst. */
const BRAUCHT_CHECKOUT = [
  "assetWaechter.test.js",          // eigene Wurzelsuche (findeWurzel)
  "dokuWaechter.test.js",           // eigene Wurzelsuche
  "prodEnvTemplate.test.js",        // REPO_ROOT -> .env.prod.example
  "composeStartfaehig.test.js",     // "..", ".." -> docker-compose
  "i18nFoundation.test.js",         // "..", ".." -> frontend/public
  /* Beim ersten Lauf dieses Tests auf der falschen Seite gefuehrt: der
     Secret-Scan liest `deploy/.env`, `scripts/*.sh`, `sql/migrate.sh` und
     `e2e/` — alles ausserhalb von api/. Die Regel hatte recht, die Stichprobe
     nicht. Steht jetzt hier, wo sie hingehoert. */
  "releaseSecretScan.test.js",
];
const GEHOERT_INS_ABBILD = [
  "me.route.coverage.test.js",      // reine Routen-Abdeckung
  "nativerAbbruch.test.js",         // reines Modul, kein Dateibaum
  "rbacService.test.js",            // Kern der Berechtigungen — muss im Gate sein
  "idempotency.test.js",            // schreibender Pfad, gehoert ins Abbild-Gate
];

describe("Abbild-Suite — die Regel, nicht die Namen", () => {

  it("R1: jedes Idiom des Aufstiegs wird erkannt", () => {
    /* Ohne diese Pruefung koennte ein Muster kaputtgehen (Tippfehler, Umbau)
       und die Regel liesse Dateien in der Suite, die dort nur scheitern. */
    assert.ok(AUFSTIEG.length >= 4, `nur ${AUFSTIEG.length} Idiome definiert`);
    for (const a of AUFSTIEG) {
      assert.ok(a.id && a.beispiel, `Idiom ohne id/beispiel: ${a.id}`);
      assert.equal(brauchtRepoCheckout(a.beispiel), a.id,
        `Das eigene Beispiel von "${a.id}" wird nicht mehr erkannt: ${a.beispiel}`);
    }
  });

  it("R2: ein Schritt nach api/ hoch zaehlt NICHT", () => {
    /* `path.resolve(__dirname, "..")` ist api/ selbst und steht in fast jeder
       Testdatei. Wuerde das schon zaehlen, bliebe von der Suite nichts uebrig —
       der teuerste denkbare Fehler dieser Regel. */
    assert.equal(brauchtRepoCheckout('const API_ROOT = path.resolve(__dirname, "..");'), null);
    assert.equal(brauchtRepoCheckout('import x from "../services/foo.js";'), null);
    assert.equal(brauchtRepoCheckout('readFileSync(path.join(API_ROOT, "routes/auth.js"))'), null);
  });

  it("R2b: ein Kommentar ist kein Aufstieg — aber er darf auch keinen Code fressen", () => {
    /*
     * Zwei Fehler, beide gemessen, beide in dieselbe Richtung gefaehrlich.
     *
     * (1) Die erste Fassung las die eigene Erklaerung: `abbildSuite.test.js`
     *     NENNT die Idiome, um sie zu pruefen, und schloss sich selbst aus.
     *     Dieselbe Falle ist in dieser Arbeit dreimal zugeschnappt.
     *
     * (2) Die Reparatur hatte die Reihenfolge falsch — Bloecke vor Zeilen. Ein
     *     Zeilenkommentar `// die Testdatei (api/test/*) …` enthaelt mit `/*`
     *     einen Blockanfang; wer Bloecke zuerst entfernt, loescht ab dort bis
     *     bis zum naechsten Blockende und damit ECHTEN Code. An `pricingPage.test.js`
     *     verschwanden so 15 Zeilen, die Datei wurde falsch einsortiert.
     *
     * Beide Richtungen stehen hier, weil die Reparatur der einen die andere
     * erzeugt hat.
     */
    const nurErwaehnt = [
      "const API_ROOT = path.resolve(__dirname, '..');",
      '// hier stuende sonst path.join(dir, "..", "..")',
      "/* und hier ein REPO_ROOT im Block */",
    ].join("\n");
    assert.equal(brauchtRepoCheckout(nurErwaehnt), null,
      "eine blosse Erwaehnung im Kommentar zaehlt als Aufstieg — dann schliesst " +
      "sich jede Datei aus, die die Regel dokumentiert");

    /* Der Aufstieg wird ZUSAMMENGESETZT, nicht hingeschrieben. Stuende er
       woertlich da, schluesse diese Datei sich selbst aus der Suite aus — der
       Waechter der Regel liefe dann ausgerechnet im Abbild-Gate nicht mit.
       Genau das ist beim ersten Container-Lauf passiert (299 statt 300
       Dateien). Vierte Auspraegung derselben Selbstbezug-Falle in dieser
       Arbeit; die ersten drei kamen ueber Kommentare. */
    const HOCH = `"..", ${'".."'}`;
    const kommentarMitBlockanfang = [
      "// die Testdatei (api/test/*) zwei Ebenen hoch",
      "const MARKER = 1;",
      `const _RL = path.resolve(__dirname, ${HOCH});`,
      "const ENDE = 2;",
    ].join("\n");
    assert.equal(brauchtRepoCheckout(kommentarMitBlockanfang), "zwei-schritte-in-einem-aufruf",
      "der echte Aufstieg wurde uebersehen — vermutlich hat ein `/*` aus einem " +
      "ZEILENkommentar die folgenden Zeilen verschluckt (Reihenfolge der Bereinigung)");
    assert.match(ohneKommentare(kommentarMitBlockanfang), /const ENDE = 2;/,
      "die Bereinigung hat Code hinter dem Zeilenkommentar geloescht");
  });

  it("R3: die Vertreter werden richtig einsortiert — in beide Richtungen", () => {
    const lies = (d) => fs.readFileSync(path.join(TEST_DIR, d), "utf8");

    for (const datei of BRAUCHT_CHECKOUT) {
      assert.ok(fs.existsSync(path.join(TEST_DIR, datei)),
        `Vertreter ${datei} gibt es nicht mehr — die Stichprobe ist verwaist`);
      assert.ok(brauchtRepoCheckout(lies(datei)),
        `${datei} liest den Repo-Checkout, wird aber NICHT ausgelassen — ` +
        "im Container laeuft sie damit ins Leere und das Gate bleibt rot");
    }
    for (const datei of GEHOERT_INS_ABBILD) {
      assert.ok(fs.existsSync(path.join(TEST_DIR, datei)),
        `Vertreter ${datei} gibt es nicht mehr — die Stichprobe ist verwaist`);
      assert.equal(brauchtRepoCheckout(lies(datei)), null,
        `${datei} prueft das Abbild, wird aber ausgelassen — das Gate prueft weniger, ` +
        "als es koennte");
    }
  });

  it("R4: die Suite behaelt den ueberwiegenden Teil der Tests", () => {
    const alle = [];
    const lauf = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) lauf(p);
        else if (e.name.endsWith(".test.js")) alle.push(p);
      }
    };
    lauf(TEST_DIR);
    const nichtIntegration = alle.filter((p) => !p.includes(`${path.sep}integration${path.sep}`));

    const { imAbbild, brauchtCheckout } = teileNachAbbild(
      nichtIntegration, (p) => fs.readFileSync(p, "utf8"),
    );

    assert.ok(imAbbild.length >= MIN_IM_ABBILD,
      `nur ${imAbbild.length} Dateien im Abbild-Gate (erwartet >= ${MIN_IM_ABBILD}). ` +
      "Entweder greift die Regel zu breit — dann meldet das Gate gruen, ohne zu pruefen.");
    assert.ok(brauchtCheckout.length <= MAX_AUSGELASSEN,
      `${brauchtCheckout.length} Dateien ausgelassen (erwartet <= ${MAX_AUSGELASSEN}).`);
    assert.ok(brauchtCheckout.length > 0,
      "gar nichts ausgelassen — dann ist die Regel wirkungslos und das Gate bleibt rot");
  });

  it("R5: unlesbare Dateien fallen NICHT still aus dem Gate", () => {
    /* Im Zweifel mitlaufen lassen. Ein Test, der wegen eines Lesefehlers
       lautlos aus dem Gate faellt, ist genau die Luecke, gegen die es da ist. */
    const { imAbbild, brauchtCheckout } = teileNachAbbild(["kaputt.test.js"], () => {
      throw new Error("EACCES");
    });
    assert.deepEqual(imAbbild, ["kaputt.test.js"]);
    assert.deepEqual(brauchtCheckout, []);
  });
});
