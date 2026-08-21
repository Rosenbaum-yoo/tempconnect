/**
 * Jede dokumentierte Compose-Kombination muss startfaehig sein.
 *
 * DER BEFUND, DER DIESEN TEST ERZWUNGEN HAT:
 * `docker-compose.demo.yml` setzte `NODE_ENV: production` UND
 * `FEATURE_GATE_BYPASS: "true"`. Der Env-Validator lehnt genau diese Kombination
 * hart ab (`featureFlags.js`, productionConstraint "forbidden_when_true") — der
 * Container beendete sich beim Start mit exit 1.
 *
 * Die Datei entstand am 2026-07-02, der Guard existierte seit dem 2026-06-01.
 * Der Demo-Stack war also NIE lauffaehig — nicht "seit P0-08 kaputt", wie
 * OPEN_BLOCKERS.md vermutete. Ein Monat lag zwischen Guard und Verstoss, und
 * niemand hat es bemerkt: Die Unit-Tests sichern die FUNKTION
 * (envValidator.test.js, featureFlags.test.js — alle gruen), aber niemand
 * sicherte das ARTEFAKT.
 *
 * Schwerer wog, dass die Datei ausgeliefert wird: git-getrackt, nicht in der
 * EXCLUDE_LIST von release-package.sh, und der CI-Waechter gegen den Bypass
 * durchsucht nur `.env*`-Dateien. Eine `.yml` lief unbemerkt ins Kundenpaket —
 * mit einem Schalter, der alle Plan-Gates oeffnet.
 *
 * WARUM KEIN GREP AUF 'FEATURE_GATE_BYPASS: "false"':
 * Genau so ein Quelltext-Test hat in Welle G6 einen Mutanten ueberleben lassen
 * (`if (false && X)` enthaelt die gesuchte Zeichenkette weiterhin). Hier waere
 * er ebenso blind: Ein spaeter angehaengter, ueberschreibender zweiter
 * Schluessel bliebe unsichtbar, und ein ganz neuer verbotener Schalter faellt
 * gar nicht auf. Dieser Test merged die Umgebungen wie Compose es tut und
 * schickt das ERGEBNIS durch den ECHTEN Validator.
 *
 * Run: node --test --test-force-exit test/composeStartfaehig.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateEnv } from "../config/envValidator.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "..", "..");

/**
 * Die `api`-Environment-Map einer Compose-Datei lesen.
 *
 * Absichtlich ein kleiner, eigener Parser statt einer YAML-Abhaengigkeit: Es
 * geht um genau einen Block aus `SCHLUESSEL: wert`-Zeilen.
 */
function apiUmgebung(datei) {
  const text = fs.readFileSync(path.join(REPO, datei), "utf8");

  /* Auf CR-optionales Zeilenende splitten, nicht nur auf den Zeilenumbruch.
   *
   * Haengt an jeder Zeile ein Wagenruecklauf, matcht der Punkt ihn NICHT —
   * JavaScript schliesst ihn aus der Punkt-Klasse aus. Damit scheitert die
   * Wert-Gruppe an jeder Zeile, der Parser liefert still ein leeres Objekt, und
   * alle Pruefungen darueber sind gruen, ohne je etwas gelesen zu haben. Genau
   * das ist beim Bauen dieses Tests passiert.
   *
   * Davor warnt die Uebergabe fuer jeden Waechter, der Dateien liest: Windows
   * checkt CRLF aus, der Container sieht LF. */
  const zeilen = text.split(/\r?\n/);

  // Den environment-Block unterhalb von `api:` finden.
  const apiIdx = zeilen.findIndex((z) => /^\s{2}api:\s*$/.test(z));
  if (apiIdx < 0) return {};
  let envIdx = -1;
  for (let i = apiIdx + 1; i < zeilen.length; i++) {
    if (/^\s{2}\S/.test(zeilen[i])) break;              // naechster Service
    if (/^\s{4}environment:\s*$/.test(zeilen[i])) { envIdx = i; break; }
  }
  if (envIdx < 0) return {};

  const env = {};
  for (let i = envIdx + 1; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (/^\s*#/.test(z) || /^\s*$/.test(z)) continue;
    if (!/^\s{6}\S/.test(z)) break;                      // Block zu Ende
    const m = /^\s{6}([A-Z0-9_]+):\s*(.*)$/.exec(z);
    if (!m) continue;
    let wert = m[2].trim().replace(/\s+#.*$/, "");       // Zeilenkommentar weg
    wert = wert.replace(/^["']|["']$/g, "");

    /* INTERPOLIERTE WERTE WERDEN UEBERSPRUNGEN — der Kern dieses Parsers.
     * Ein Default in geschweiften Klammern sagt nichts darueber aus, was die
     * DATEI festlegt: Der Wert kommt zur Laufzeit aus der .env der jeweiligen
     * Maschine. Wer den Default als Aussage der Datei liest, bewertet einen
     * Zustand, den es nirgends gibt — die Basis allein saehe dann aus, als
     * setze sie production UND bypass=true, obwohl jede reale .env
     * NODE_ENV=development liefert.
     *
     * Geprueft wird also, was die Compose-Dateien HART setzen. Genau darin lag
     * der Defekt: Die Demo war die einzige Kombination, die beide Schluessel
     * hart und widerspruechlich belegte. */
    if (wert.startsWith("${")) continue;
    env[m[1]] = wert;
  }
  return env;
}

/**
 * Secrets, die stark genug sind, um NICHT am Validator zu scheitern.
 *
 * Bewusst ohne den Teilstring "secret": `envValidator.isWeak()` lehnt jeden
 * Wert ab, der ihn enthaelt — auch einen 60 Zeichen langen Zufallswert. Dieser
 * Test soll die COMPOSE-KOMBINATION bewerten, nicht die Secrets der Maschine,
 * auf der er zufaellig laeuft. (Auf dieser Maschine scheitern die echten
 * .env-Werte genau daran, obwohl sie 59 bzw. 63 Zeichen lang und keine
 * Platzhalter sind — ein Fehlalarm, der mit diesem Test nichts zu tun hat.)
 */
const STARKE_BASIS = Object.freeze({
  /* Die beiden Freigaben sind noetig, weil diese Werte ihren Zweck nur
   * erfuellen, wenn sie ECHT stark sind — der Test schickt sie durch denselben
   * Validator wie die Produktion. Damit sind sie zwangslaeufig auch fuer den
   * Release-Scan von einem echten Schluessel nicht zu unterscheiden.
   * Siehe scripts/lib/secretScan.mjs. */
  SESSION_SECRET: "u7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6Zx3Bw8Fd5Rk1Jm", // secret-scan: erlaubt
  JWT_SECRET: "Zx3Bw8Fd5Rk1Jm7Qf2xLp9vRt4Nz8Ka3Wd6Yb1Mc5Hj0Gs7Er4Tv2Pn9Lq6U", // secret-scan: erlaubt
  DATABASE_URL: "postgres://u:p@db:5432/tempconnect",
});

/** Die dokumentierten Startwege — jeder muss booten. */
const KOMBINATIONEN = [
  /* "Basis allein" steht bewusst NICHT hier: Sie setzt keinen der kritischen
   * Schluessel hart, sondern interpoliert alles aus der .env. Ueber sie kann
   * eine Datei-Pruefung nichts aussagen — der Entwicklungsstack haengt an der
   * Maschine, nicht am Repo. */
  { name: "Basis + Produktion", dateien: ["docker-compose.yml", "docker-compose.prod.yml"] },
  { name: "Basis + Demo (Cloudflare-Tunnel)", dateien: ["docker-compose.yml", "docker-compose.demo.yml"] },
];

describe("Compose — jede dokumentierte Kombination ist startfaehig", () => {
  for (const kombi of KOMBINATIONEN) {
    it(`${kombi.name} besteht die Env-Validierung`, () => {
      /* Compose merged environment-Maps je Schluessel; die spaetere -f Datei
       * gewinnt. Genau das bildet dieser reduce nach. */
      const gemerged = kombi.dateien.reduce(
        (acc, d) => Object.assign(acc, apiUmgebung(d)),
        Object.assign({}, STARKE_BASIS)
      );

      assert.ok(Object.keys(gemerged).length > 3,
        `aus ${kombi.dateien.join(" + ")} wurde keine api-Umgebung gelesen — ` +
        "der Parser passt nicht mehr zur Datei, und der Test prueft dann nichts");

      /* DER EIGENTLICHE PRUEFSCHRITT: der ECHTE Validator, nicht ein Nachbau.
       * Dieselbe Funktion, die api/server.js beim Start aufruft. */
      let fehler = null;
      try {
        validateEnv(null, gemerged);
      } catch (e) {
        fehler = e;
      }
      assert.equal(fehler, null,
        `Der dokumentierte Stack "${kombi.name}" startet nicht:\n  ` +
        String(fehler && fehler.message).split("\n").join("\n  ") +
        `\n\nGelesen aus: ${kombi.dateien.join(" + ")}`);
    });
  }

  it("die Demo setzt den Feature-Bypass NICHT ein", () => {
    /* Diese Datei wird ausgeliefert (git-getrackt, nicht in der EXCLUDE_LIST von
     * release-package.sh). Ein "true" hier oeffnet beim Kunden alle Plan-Gates —
     * und der CI-Waechter dagegen durchsucht nur `.env*`-Dateien. */
    const demo = apiUmgebung("docker-compose.demo.yml");
    assert.notEqual(demo.FEATURE_GATE_BYPASS, "true",
      "die ausgelieferte Demo-Datei schaltet alle Plan-Gates frei");
  });

  it("die Demo laeuft in Produktion — sonst faellt die Haertung weg", () => {
    /* NICHT redundant zum Dockerfile: Die Basis interpoliert NODE_ENV aus der
     * lokalen .env und ueberschreibt damit das Image-Default. Fehlt die Zeile im
     * Demo-Overlay, laeuft eine OEFFENTLICH getunnelte Demo mit dem Wert dieser
     * Maschine — auf einem Entwicklerrechner also in "development", inklusive
     * erreichbarem SSO-Stub-Login. */
    const demo = apiUmgebung("docker-compose.demo.yml");
    assert.equal(demo.NODE_ENV, "production",
      "ohne diese Zeile erbt die oeffentliche Demo NODE_ENV aus der lokalen .env");
  });

  it("der Parser liest wirklich etwas — Gegenprobe", () => {
    /* Ohne diese Probe koennte der Parser stillschweigend ein leeres Objekt
     * liefern und alle Tests darueber waeren gruen, ohne je etwas geprueft zu
     * haben. Genau das ist beim Bauen passiert (CRLF, siehe oben). */
    const prod = apiUmgebung("docker-compose.prod.yml");
    assert.equal(prod.NODE_ENV, "production");
    assert.equal(prod.FEATURE_GATE_BYPASS, "false",
      "die Produktionsdatei ist das Vorbild — aendert sich hier etwas, " +
      "stimmt der Parser nicht mehr");
  });
});
