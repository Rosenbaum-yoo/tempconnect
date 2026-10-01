/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAS ABBILD BRINGT MIT, WAS ES ZUM STARTEN BRAUCHT (U6.9)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BEFUND, der diese Datei nötig gemacht hat (2026-10-01, zwei Sitzungen, je
 * eine halbe Antwort):
 *
 * Ein laufender API-Container brach mit `Cannot find package
 * '/app/node_modules/express'` ab, als er **gegen das vorhandene Abbild** neu
 * erzeugt wurde (ohne `--build`). Die eine Sitzung schloss daraus auf einen
 * Livegang-Blocker; die andere maß am **Repo** nach und fand dort alles in
 * Ordnung (Dockerfile installiert beim Bauen, kein Mount über `/app`). **Beide
 * hatten recht und beide hätten ihre Hälfte für das Ganze genommen:**
 *
 *   - Der Container war aus einer älteren Fassung erzeugt und seitdem nie neu —
 *     **lokale Abdrift**, kein Repo-Defekt.
 *   - Und die Gegenmessung („das Abbild trägt 242 Pakete") entstand an einem
 *     Abbild, das kurz davor **neu gebaut** worden war. Derselbe Kreis, nur
 *     andersherum.
 *
 * WAS BLEIBT: es gab keine Prüfung, die sagt, ob das Abbild seinem Dockerfile
 * entspricht — und keine, die die Eigenschaften des Dockerfiles festhält.
 * `sql/test-fresh-install.sh` beweist den **Datenbank**weg ab null; für das
 * **Abbild** gab es nichts.
 *
 * ARBEITSTEILUNG DER ZWEI NEUEN PRÜFUNGEN:
 *
 *   `api/test-fresh-image.sh`  baut das Abbild FRISCH und prüft daran, dass die
 *                              Pakete wirklich laden. Echter Beweis, braucht
 *                              Docker, gehört vor ein Release.
 *   DIESE DATEI                hält die Eigenschaften des Dockerfiles fest, ohne
 *                              Docker — läuft also in JEDEM Tor und fängt eine
 *                              Regression am Tag, an dem sie entsteht.
 *
 * Die zweite ersetzt die erste nicht. Ein Dockerfile kann richtig sein und das
 * Abbild veraltet; das sieht nur ein Bau.
 *
 * Run: node --test --test-force-exit test/abbildIstSelbstgenuegsam.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwärts suchen UND auf Inhalt prüfen: Docker legt Mount-Ziele als leere
   Verzeichnisse an, und ein leeres Verzeichnis macht jede Prüfung lautlos grün. */
function findeApi() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const k = path.join(dir, "Dockerfile");
      if (fs.existsSync(k) && fs.statSync(k).size > 200
          && fs.existsSync(path.join(dir, "package.json"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const API = findeApi();
const suite = API ? describe : describe.skip;

suite("U6.9 · das Abbild ist selbstgenügsam", () => {
  const dockerfile = API ? fs.readFileSync(path.join(API, "Dockerfile"), "utf8") : "";
  /* Kommentare heraus, bevor irgendetwas geprüft wird: der Kopf dieses
     Dockerfiles sagt wörtlich „npm ci im Image, kein npm install beim Start" —
     eine Zusicherung, die DEN SATZ findet statt der Anweisung, wäre grün, auch
     wenn der Befehl fehlt. Fünfter Fall dieser Klasse in dieser Woche. */
  const anweisungen = dockerfile.replace(/^\s*#[^\n]*$/gm, "");

  it("der Kommentar-Schnitt greift — sonst prüft alles darunter den Fließtext", () => {
    assert.ok(dockerfile.includes("kein npm install beim Start"),
      "der Kopfkommentar ist weg; dann prüft die Zusicherung unten etwas anderes als gedacht");
    assert.ok(!anweisungen.includes("kein npm install beim Start"),
      "der Schnitt entfernt die Kommentare nicht — die Zusicherungen unten lesen " +
      "dann die Begründung statt der Anweisung");
    assert.ok(anweisungen.replace(/\s+/g, " ").trim().length > 100,
      "nach dem Schnitt bleiben keine Anweisungen übrig");
  });

  it("die Abhängigkeiten werden beim BAUEN installiert, deterministisch", () => {
    /*
     * `npm ci` statt `npm install`: nur das erste liest package-lock.json
     * verbindlich. Ein `npm install` im Bau erzeugt bei jedem Bau ein anderes
     * Abbild — und dann ist „es lief gestern" keine Aussage mehr.
     */
    assert.match(anweisungen, /^\s*RUN\s+npm\s+ci\b/m,
      "das Dockerfile installiert nicht per `RUN npm ci` — ohne Installation beim " +
      "Bauen bringt das Abbild seine Abhängigkeiten nicht mit, und der erste " +
      "`docker compose up` auf einem frischen Host ergibt eine API, die nicht startet");
    assert.doesNotMatch(anweisungen, /^\s*RUN\s+npm\s+install\b/m,
      "`npm install` im Bau ist nicht deterministisch — `npm ci` liest das Lockfile");
    assert.match(anweisungen, /COPY\s+package\.json\s+package-lock\.json/,
      "das Lockfile wird nicht ins Abbild kopiert; `npm ci` braucht es");
  });

  it("der Start installiert NICHT nach — sonst hängt er am Netz", () => {
    /*
     * Das ist der Kern des Befunds. Ein Start, der nachinstalliert, schreibt in
     * eine Schicht, die beim Neuerzeugen des Containers verschwindet: es läuft,
     * bis jemand `--force-recreate` sagt, und bricht dann ohne erkennbaren Anlass.
     */
    const pkg = JSON.parse(fs.readFileSync(path.join(API, "package.json"), "utf8"));
    const start = String(pkg.scripts?.start || "");
    assert.ok(start.length > 0, "es gibt kein start-Skript");
    for (const verboten of ["npm install", "npm ci", "yarn", "pnpm"]) {
      assert.ok(!start.includes(verboten),
        `das start-Skript installiert zur Laufzeit (\`${start}\`) — dann hängt der ` +
        "Start am Netz, und die Pakete liegen in einer Schicht, die ein " +
        "Neuerzeugen des Containers wegwirft");
    }

    /*
     * DAS RICHTIGE CMD, und das hat eine Rückmutation gekostet. `match(/^\s*CMD/m)`
     * traf die **HEALTHCHECK**-Zeile — sie lautet
     * `  CMD wget -q --spider http://localhost:3000/health || exit 1` und steht
     * im Dockerfile VOR dem echten CMD. Die Zusicherung prüfte also einen
     * wget-Aufruf auf `npm install` und blieb grün, als ich das echte CMD auf
     * `sh -c "npm install && npm run start"` umstellte.
     *
     * Vierter Fall dieser Klasse an einem Tag: die Zusicherung traf den
     * richtigen Namen an der falschen Stelle. Also: alle CMD-Zeilen nehmen, die
     * der HEALTHCHECK nicht gehören — und JEDE prüfen, nicht eine.
     */
    const healthcheck = anweisungen.match(/^\s*HEALTHCHECK[\s\S]*?(?=\n\S|\n*$)/m);
    const ohneHealthcheck = healthcheck
      ? anweisungen.replace(healthcheck[0], " ")
      : anweisungen;
    assert.ok(!/HEALTHCHECK/.test(ohneHealthcheck),
      "der HEALTHCHECK-Schnitt greift nicht — dann prüft die Zusicherung unten " +
      "womöglich seine CMD-Zeile statt der echten");

    const cmds = [...ohneHealthcheck.matchAll(/^\s*(?:CMD|ENTRYPOINT)\s+(.+)$/gm)].map((m) => m[1]);
    assert.ok(cmds.length >= 1, "das Dockerfile hat kein CMD ausserhalb des HEALTHCHECK");
    for (const zeile of cmds) {
      for (const verboten of ["npm install", "npm ci", "yarn", "pnpm"]) {
        assert.ok(!zeile.includes(verboten),
          `CMD/ENTRYPOINT installiert zur Laufzeit: ${zeile}`);
      }
    }
    /* Und kein ENTRYPOINT-Skript, das es heimlich doch tut. */
    const entry = anweisungen.match(/^\s*ENTRYPOINT\s+(.+)$/m);
    if (entry) {
      assert.ok(!/\.sh|entrypoint/i.test(entry[1]),
        "ein ENTRYPOINT-Skript kann zur Laufzeit installieren, ohne dass es hier " +
        "sichtbar ist: " + entry[1] + " — dann muss diese Probe das Skript mitlesen");
    }
  });

  it("node_modules ist vom Bau-Kontext ausgeschlossen", () => {
    /*
     * Gegenrichtung, und sie ist nicht offensichtlich: `node_modules` MUSS in
     * `.dockerignore` stehen. Täte es das nicht, kopierte `COPY . .` das
     * node_modules des HOSTS ins Abbild — und in diesem Arbeitsbaum ist das eine
     * Junction (Verzeichnisverknüpfung). Was dabei im Abbild landet, ist
     * plattformabhängig und im besten Fall die Pakete einer anderen Architektur.
     */
    const di = path.join(API, ".dockerignore");
    assert.ok(fs.existsSync(di), "api/.dockerignore fehlt");
    const zeilen = fs.readFileSync(di, "utf8").split(/\r?\n/)
      .map((z) => z.trim()).filter((z) => z && !z.startsWith("#"));
    assert.ok(zeilen.some((z) => z === "node_modules/" || z === "node_modules"),
      "node_modules steht nicht in .dockerignore — `COPY . .` kopiert dann das " +
      "des Hosts (hier eine Junction) ins Abbild");
    /* EXAKT `.env`, nicht `startsWith(".env")`: mein erster Entwurf blieb grün,
       als ich die Zeile `.env` entfernte — `.env.*` stand noch da und erfüllte
       das Muster. Eine Geschwisterzeile ist kein Beleg für die gemeinte. */
    assert.ok(zeilen.includes(".env"),
      ".env steht nicht als eigene Zeile in .dockerignore — Geheimnisse gehören " +
      "nie ins Abbild, und `.env.*` deckt `.env` NICHT ab");
    assert.ok(zeilen.includes(".env.*"),
      ".env.* fehlt — dann landen .env.production und Verwandte im Abbild");
  });

  it("test/ und scripts/ sind ABSICHTLICH draussen — und das hat eine Folge", () => {
    /*
     * BENANNTER NICHT-TREFFER, damit niemand ihn „repariert": ein
     * Produktionsabbild soll keinen Testcode tragen. Die Folge gehört aber
     * danebengeschrieben, weil sie eine Pflichtzeile in CLAUDE.md betrifft:
     *
     *   Weil `scripts/` fehlt, kann `docker exec … npm run test:image` NICHT
     *   laufen — gemessen am 2026-10-01:
     *     Error: Cannot find module '/app/scripts/run-tests.js'
     *     code: 'MODULE_NOT_FOUND'
     *
     * Die Abbild-Suite gehört deshalb auf den Host:
     *   cd api && node scripts/run-tests.js --suite=image
     * Gemessen: 402 Dateien, 124 ausgelassen (mit Begründung je Grund),
     * 9827 Proben, 9813 grün — das eine Rote ist der bekannte libuv-Dateiausfall.
     *
     * WELCHE Zeile in CLAUDE.md am Ende stehen soll, ist eine
     * Release-Entscheidung und gehört dem Owner. Diese Probe hält nur den
     * Zustand fest, auf dem die Entscheidung beruht.
     */
    const zeilen = fs.readFileSync(path.join(API, ".dockerignore"), "utf8")
      .split(/\r?\n/).map((z) => z.trim());
    for (const weg of ["test/", "scripts/"]) {
      assert.ok(zeilen.includes(weg),
        weg + " steht nicht mehr in .dockerignore. Falls das Absicht ist, ist es " +
        "eine Entscheidung mit Wirkung: das Produktionsabbild trägt dann Testcode. " +
        "Dann gehört hier die Begründung hin, nicht nur die Änderung.");
    }
  });

  it("der Frisch-Abbild-Test existiert und prüft das Abbild, nicht den Container", () => {
    /*
     * Die Datei hier kann nur das Dockerfile lesen. Dass das BENUTZTE Abbild
     * seinem Dockerfile entspricht, beweist nur ein Bau — und genau diese Hälfte
     * fehlte, als zwei Sitzungen aneinander vorbeimaßen. Wird das Skript
     * entfernt, bleibt nur noch die Papierform.
     */
    const skript = path.join(API, "test-fresh-image.sh");
    assert.ok(fs.existsSync(skript),
      "api/test-fresh-image.sh fehlt — dann prüft nichts mehr, ob das benutzte " +
      "Abbild seinem Dockerfile entspricht; genau diese Lücke hat zwei Sitzungen " +
      "je eine halbe Antwort messen lassen");
    /*
     * KOMMENTARE HERAUS, bevor irgendetwas geprüft wird. Zwei Rückmutationen
     * blieben grün, weil das Skript seine eigenen Mechanismen im Kommentar
     * ERKLÄRT: `docker build` und `pwd -W` stehen dort beide im Begründungstext.
     * Ein `# docker build …` erfüllte die Zusicherung also genauso wie der
     * Befehl. Fünfter Fall dieser Klasse an einem Tag — und auch hier in einer
     * Probe, die ich gerade erst geschrieben hatte.
     */
    const roh = fs.readFileSync(skript, "utf8");
    const befehle = roh.split(/\r?\n/)
      .map((z) => z.replace(/(^|\s)#.*$/, ""))   // Kommentar am Zeilenende und ganze Kommentarzeilen
      .join("\n");
    assert.ok(/pwd -W/.test(roh), "das Skript erklärt `pwd -W` nicht mehr im Kopf");
    assert.ok(!/Git Bash C:/.test(befehle),
      "der Kommentar-Schnitt greift nicht — dann prüfen die Zusicherungen unten " +
      "die Begründung statt der Befehle");

    assert.match(befehle, /docker build/,
      "das Skript BAUT nicht — dann prüft es den laufenden Container, und der kann " +
      "driften; genau diese Drift hat zwei Sitzungen aneinander vorbeimessen lassen");
    assert.match(befehle, /docker run --rm/,
      "das Skript prüft nicht in einer frischen Schicht auf dem Abbild");
    assert.match(befehle, /pwd -W/,
      "ohne `pwd -W` schlägt der Bau in Git Bash fehl (/c/… ist für Docker kein " +
      "Pfad) — das ist beim ersten Lauf wirklich passiert");
  });
});
