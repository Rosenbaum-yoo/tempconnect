/**
 * ═══════════════════════════════════════════════════════════════════════════
 * S1 / S2 / S3 / S4 — EIN KLIENT STATT ZWEI, UND DER STAND IST ABLESBAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GEMESSEN AM 2026-09-21, bevor etwas umgestellt wurde (S1):
 *
 *   S1.1  `rateLimit.js` benutzte `createClient` aus `redis` (node-redis) und
 *         reichte es als `sendCommand` an `rate-limit-redis` weiter. Nur wenn
 *         `RATE_LIMIT_STORE=redis`; sonst zaehlt ein Speicher je Instanz.
 *   S1.2  Und ja, im Betrieb laeuft es MIT Redis: beide Compose-Dateien setzen
 *         `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}`. Die Umstellung ist
 *         also kein Papierwechsel — sie betrifft den laufenden Begrenzer.
 *   S1.3  Genau EIN Aufrufer von `redis` im ganzen Dienst (diese eine Datei),
 *         und KEIN einziger direkter Aufrufer von `ioredis` — das kam
 *         unausgesprochen ueber BullMQ herein.
 *
 * DER PREIS DER ZWEITEN BIBLIOTHEK war nicht nur ein Paket mehr:
 * `bullmq@5` fuehrt `peerOptional redis@">=5.0.0"`, die Wurzel pinnte
 * `redis@^4.6.13`. Jedes `npm install` endete mit ERESOLVE, und der Ausweg
 * hiess `--legacy-peer-deps` — ein Schalter, der Abhaengigkeiten
 * "potenziell kaputt" aufloest und jede kuenftige echte Warnung mitverschluckt.
 * Auf genau diesem Weg ist `@pdf-lib/fontkit` einmal mit `--no-save` im Baum
 * gelandet, ohne je im Lockfile zu stehen.
 *
 * Lauf: node --test --test-force-exit test/einKlientFuerRedis.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { befehlsBruecke } from "../middleware/rateLimit.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HIER, "..");
const lies = (...teile) => fs.readFileSync(path.join(API_ROOT, ...teile), "utf8");

/* Kommentare weg, bevor ueber Quelltext geurteilt wird: dieser Waechter NENNT
   das Paket, das nicht mehr eingebunden sein darf. Wer die Begruendung
   mitliest, wird rot wegen der Erklaerung — und gruen, sobald jemand die
   Erklaerung loescht. */
const ohneKommentare = (quelle) => quelle
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ \t]*\/\/.*$/gm, " ");

describe("S2 · die Befehlsbruecke spricht die Sprache des Klienten", () => {

  it("reicht die Befehlsteile EINZELN weiter, nicht als ein Feld", async () => {
    /*
     * Hier sitzt der ganze Unterschied zwischen den beiden Klienten:
     *   node-redis  sendCommand(["SET", "k", "1"])   — ein Feld
     *   ioredis     call("SET", "k", "1")            — einzelne Argumente
     *
     * Verwechselt man sie, gibt es beim Start KEINEN Fehler. Erst im Betrieb
     * schlaegt die Zaehlung fehl, und der Begrenzer laesst dann entweder alles
     * durch oder nichts. Deshalb wird die Bruecke ausgefuehrt, nicht gelesen.
     */
    const gesehen = [];
    const klient = { call: async (...teile) => { gesehen.push(teile); return 1; } };

    const senden = befehlsBruecke(klient);
    await senden("SET", "rl:abc", "1", "EX", "60");

    assert.deepStrictEqual(gesehen, [["SET", "rl:abc", "1", "EX", "60"]],
      "die Befehlsteile kommen nicht einzeln an — mit ioredis zaehlt der Begrenzer dann nichts");
  });

  it("gibt die Antwort des Klienten unveraendert zurueck", async () => {
    const senden = befehlsBruecke({ call: async () => 42 });
    assert.equal(await senden("INCR", "k"), 42,
      "der Zaehlerstand geht verloren — der Begrenzer wuerde jede Anfrage als erste sehen");
  });

  it("GEGENPROBE: ein Klient OHNE `call` faellt auf, statt still nichts zu tun", async () => {
    /* Ohne diese Probe bestuende die Reihe auch mit einer Bruecke, die
       Fehler schluckt — und ein Ratenbegrenzer, der still nichts zaehlt, ist
       schlimmer als keiner: niemand sucht danach. */
    const senden = befehlsBruecke({});
    assert.throws(() => senden("INCR", "k"), /call is not a function/,
      "eine Bruecke, die einen unbrauchbaren Klienten schluckt, laesst den Begrenzer "
      + "still nichts zaehlen — und niemand sucht danach");
  });
});

describe("S2 · es gibt nur noch einen Redis-Klienten", () => {

  it("der Ratenbegrenzer bindet `ioredis` ein, nicht `redis`", () => {
    const quelle = ohneKommentare(lies("middleware", "rateLimit.js"));
    assert.ok(/from\s+["']ioredis["']/.test(quelle),
      "der Ratenbegrenzer bindet ioredis nicht ein");
    assert.ok(!/from\s+["']redis["']/.test(quelle),
      "node-redis ist zurueck. Damit kollidiert `npm install` wieder mit dem "
      + "peerOptional von bullmq, und der Ausweg waere erneut --legacy-peer-deps.");
  });

  it("der Zugang kommt aus DERSELBEN Definition wie die Warteschlangen", () => {
    /* Zwei Auslegungen von REDIS_URL waeren genau die Sorte Abweichung, die
       erst im Betrieb auffaellt — etwa eine, die das Passwort dekodiert, und
       eine, die es roh laesst. */
    /*
     * An der VERDRAHTUNG geprueft, nicht am Vorkommen des Namens: der erste
     * Entwurf suchte `getConnectionOpts` irgendwo in der Datei — und blieb
     * gruen, als eine Rueckmutation den Aufruf durch `config.REDIS_URL`
     * ersetzte. Die Einbindung oben nennt den Namen ja weiterhin. Ein
     * Waechter, der eine Zeichenkette sucht statt die Stelle, an der sie
     * wirkt, prueft den Stellvertreter.
     */
    const quelle = ohneKommentare(lies("middleware", "rateLimit.js"));
    assert.ok(/new\s+IORedis\(\s*\{\s*\.\.\.getConnectionOpts\(\)/.test(quelle),
      "der Ratenbegrenzer legt seinen Redis-Zugang wieder selbst aus, statt die "
      + "gemeinsame Definition aus queue/connection.js zu nehmen");
  });

  it("…uebernimmt aber NICHT das unbegrenzte Warten der Warteschlangen", () => {
    /*
     * `getConnectionOpts()` setzt `maxRetriesPerRequest: null`, weil BullMQ das
     * verlangt: eine Warteschlange DARF warten, bis Redis wiederkommt. Ein
     * Ratenbegrenzer darf das nicht — sonst haengt bei einem Redis-Ausfall
     * JEDE Anfrage in der Zaehlung fest, und die API sieht tot aus, obwohl nur
     * die Zaehlung fehlt. Diese Zusicherung haelt die Unterscheidung fest.
     */
    const quelle = ohneKommentare(lies("middleware", "rateLimit.js"));
    assert.ok(/maxRetriesPerRequest:\s*[1-9][0-9]*/.test(quelle),
      "der Begrenzer erbt das unbegrenzte Warten der Warteschlangen — bei einem "
      + "Redis-Ausfall haengt damit jede Anfrage, statt einen Fehler zu bekommen");
  });

  it("KEIN anderer Teil des Dienstes bindet `redis` ein", () => {
    /* Entdeckend: eine neue Einbindung faellt hier auf, ohne dass jemand
       daran denken muss. */
    const treffer = [];
    const verzeichnisse = ["middleware", "services", "routes", "queue", "workers", "utils", "config", "db"];
    const gehe = (rel) => {
      const voll = path.join(API_ROOT, rel);
      if (!fs.existsSync(voll)) return;
      for (const e of fs.readdirSync(voll, { withFileTypes: true })) {
        const kind = path.join(rel, e.name);
        if (e.isDirectory()) gehe(kind);
        else if (e.name.endsWith(".js")) {
          const q = ohneKommentare(fs.readFileSync(path.join(API_ROOT, kind), "utf8"));
          if (/from\s+["']redis["']|require\(\s*["']redis["']\s*\)/.test(q)) treffer.push(kind);
        }
      }
    };
    verzeichnisse.forEach(gehe);
    assert.deepStrictEqual(treffer, [], "node-redis wird wieder irgendwo eingebunden");
  });
});

describe("S3 · die Abhaengigkeiten loesen sich ohne Schalter auf", () => {

  it("`redis` steht nicht mehr in package.json, `ioredis` schon", () => {
    const paket = JSON.parse(lies("package.json"));
    assert.equal(paket.dependencies.redis, undefined,
      "`redis` ist zurueck in den Abhaengigkeiten — ERESOLVE gegen bullmq kehrt damit zurueck");
    assert.ok(typeof paket.dependencies.ioredis === "string" && paket.dependencies.ioredis.length > 0,
      "ioredis haengt wieder unausgesprochen an bullmq. Faellt bullmq weg, verschwindet der "
      + "Ratenbegrenzer-Klient mit — ohne dass es jemand merkt.");
  });

  it("auch das Lockfile kennt `redis` nicht mehr als Wurzel-Abhaengigkeit", () => {
    /* Die Aussage von package.json allein genuegt nicht: entscheidend ist,
       was eine frische Installation TATSAECHLICH holt. */
    const lock = JSON.parse(lies("package-lock.json"));
    const wurzel = lock.packages[""].dependencies || {};
    assert.equal(wurzel.redis, undefined, "das Lockfile fuehrt `redis` weiterhin");
    assert.ok(wurzel.ioredis, "das Lockfile fuehrt `ioredis` nicht als Wurzel-Abhaengigkeit");
    assert.ok(!lock.packages["node_modules/redis"],
      "eine frische Installation wuerde node-redis wieder mitbringen");
  });

  it("`@pdf-lib/fontkit` steht im Lockfile — nicht nur im Baum", () => {
    /* Die Uebergangsloesung aus `--no-save --legacy-peer-deps`: das Paket lag
       installiert im Baum, aber nicht im Lockfile. Eine frische Installation
       haette es nicht mitgebracht, und der PDF-Weg waere erst im Betrieb
       gebrochen. */
    const lock = JSON.parse(lies("package-lock.json"));
    assert.ok(lock.packages["node_modules/@pdf-lib/fontkit"],
      "@pdf-lib/fontkit fehlt im Lockfile — eine frische Installation bringt es nicht mit");
    const paket = JSON.parse(lies("package.json"));
    assert.ok(paket.dependencies["@pdf-lib/fontkit"],
      "@pdf-lib/fontkit ist keine erklaerte Abhaengigkeit");
  });
});

describe("S3 / S4 · das Abbild baut ohne Ausnahme und sagt seinen Stand", () => {

  const REPO_ROOT = path.resolve(API_ROOT, "..");
  const liesRepo = (...teile) => fs.readFileSync(path.join(REPO_ROOT, ...teile), "utf8");
  /* Rauten-Kommentare raus (Dockerfile, Compose): die BEGRUENDUNG nennt den
     Schalter, der nicht mehr stehen darf. Zum dritten Mal in dieser Sitzung
     dieselbe Falle — ein textsuchender Waechter findet zuerst seine eigene
     Erklaerung und zwingt einen dazu, sie wegzulassen. */
  const ohneRauten = (text) => text.replace(/^[ 	]*#.*$/gm, " ");

  it("das Abbild baut ohne `--legacy-peer-deps`", () => {
    /*
     * Der Schalter loest Abhaengigkeiten ausdruecklich "potenziell kaputt" auf
     * — und verschluckt dabei jede kuenftige ECHTE Warnung. Solange er im
     * Dockerfile steht, faellt der naechste Konflikt niemandem auf, bis etwas
     * im Betrieb bricht.
     */
    const docker = ohneRauten(lies("Dockerfile"));
    assert.ok(/npm ci /.test(docker), "das Abbild installiert nicht mehr mit `npm ci`");
    assert.ok(!/--legacy-peer-deps/.test(docker),
      "das Abbild baut wieder mit --legacy-peer-deps — dann ist der Konflikt nur versteckt");
  });

  it("das Abbild nimmt den Stand als Bauargument entgegen", () => {
    const docker = ohneRauten(lies("Dockerfile"));
    assert.ok(/ARG\s+APP_COMMIT/.test(docker), "APP_COMMIT ist kein Bauargument mehr");
    assert.ok(/ENV\s+APP_COMMIT=\$APP_COMMIT/.test(docker),
      "das Bauargument erreicht die Laufzeit nicht — dann steht im Startprotokoll immer 'unbekannt'");
  });

  it("beide Compose-Dateien reichen den Stand weiter", () => {
    for (const datei of ["docker-compose.yml", "docker-compose.prod.yml"]) {
      const inhalt = ohneRauten(liesRepo(datei));
      assert.ok(/APP_COMMIT:\s*\$\{APP_COMMIT:-unbekannt\}/.test(inhalt),
        `${datei} reicht APP_COMMIT nicht an den Bau weiter`);
    }
  });

  it("das Startprotokoll nennt den Stand — und faellt nicht still auf nichts zurueck", () => {
    /* Der Container bedient den HAUPTBAUM, nicht den Arbeitsbaum. Wer aus einem
       gruenen Worktree auf einen laufenden Container schliesst, schliesst auf
       die falsche Datei — genau dafuer ist diese Zeile da. */
    const quelle = ohneKommentare(lies("server.js"));
    assert.ok(/commit:\s*process\.env\.APP_COMMIT\s*\|\|\s*["']unbekannt["']/.test(quelle),
      "das Startprotokoll nennt den Stand nicht mehr, oder es laesst das Feld bei "
      + "fehlendem Wert weg — dann sieht ein alter Container aus wie ein neuer");
    assert.ok(/TempConnect API gestartet/.test(quelle), "die Startmeldung ist verschwunden");
  });
});
