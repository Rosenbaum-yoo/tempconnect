/**
 * Produktionsvorlage vollstaendig — jede erzwungene Variable steht in `.env.prod.example`.
 *
 * DER FEHLER, DEN DIESER TEST VERHINDERT (gefunden 2026-07-26):
 * `runProductionValidation()` bricht den Start mit `fatal()` ab, wenn eine Pflichtvariable
 * fehlt. `STAFF_SESSION_SECRET` gehoerte dazu — stand aber **nicht** in
 * `.env.prod.example`. Wer die Produktion nach dieser Vorlage aufsetzt, haette eine
 * scheinbar vollstaendige `.env.prod` gehabt und die API waere nicht hochgekommen. Solche
 * Fehler zeigen sich erst beim Deploy, im ungeeignetsten Moment.
 *
 * Der Test liest die Wahrheit aus dem Code (welche Variablen erzwingt die Validierung?)
 * und vergleicht sie mit der Vorlage. Er wird damit automatisch mitwachsen: wer morgen eine
 * neue Pflichtvariable einfuehrt, bekommt hier den Hinweis, sie auch zu dokumentieren.
 *
 * Bewusst textuell, nicht durch Ausfuehren: `runProductionValidation()` ruft im Fehlerfall
 * `process.exit()` — man kann es nicht gefahrlos in der Suite aufrufen.
 *
 * Run: node --test --test-force-exit test/prodEnvTemplate.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

const TEMPLATE = path.join(REPO_ROOT, ".env.prod.example");
const CONFIG = path.join(API_ROOT, "config", "index.js");

/**
 * Steht `name` in der Vorlage als eigene Zuweisungszeile?
 *
 * GEFUNDEN 2026-09-04 — der Test konnte zwei seiner zwoelf Variablen strukturell nie
 * als fehlend melden. Vorher stand hier `template.includes(name)`, eine Suche nach
 * einer Zeichenkette IRGENDWO in der Datei. Und:
 *
 *     "DATABASE_URL".includes("BASE_URL")            === true
 *     "STAFF_SESSION_SECRET".includes("SESSION_SECRET") === true
 *
 * `BASE_URL` und `SESSION_SECRET` sind Namensenden laengerer Variablen. Solange die
 * laengere in der Vorlage stand, galt die kuerzere als dokumentiert — auch wenn ihre
 * Zeile fehlte. Belegt durch Rueckmutation: `BASE_URL=` aus der Vorlage geloescht, der
 * Test blieb gruen. Genau der Deploy-Fehler, gegen den dieser Test 2026-07-26
 * geschrieben wurde, waere fuer diese beiden durchgerutscht.
 *
 * Geprueft wird deshalb die Zuweisungszeile, nicht das Vorkommen. Auskommentiert (`#`)
 * zaehlt als dokumentiert: die Vorlage darf einen optionalen Wert zeigen, ohne ihn zu
 * setzen — der Leser sieht den Namen, und darum geht es hier.
 */
function dokumentiert(template, name) {
  return new RegExp(`^[ \t]*#?[ \t]*(?:export[ \t]+)?${name}=`, "m").test(template);
}

describe("Produktionsvorlage `.env.prod.example`", () => {
  /** @type {Set<string>} */ let required = new Set();
  /** @type {string} */ let template = "";

  before(() => {
    const cfg = fs.readFileSync(CONFIG, "utf8");
    const marker = "export function runProductionValidation";
    const at = cfg.indexOf(marker);
    assert.notEqual(at, -1, `'${marker}' nicht gefunden — wurde die Validierung umbenannt?`);
    const body = cfg.slice(at);

    /*
     * Eine Ebene lokaler Umbenennung aufloesen. Nicht kosmetisch: `INTERNAL_CRON_SECRET`
     * wird als
     *     const cronSecret = (process.env.INTERNAL_CRON_SECRET || "").trim();
     *     if (!cronSecret || looksLikePlaceholder(cronSecret)) fatal(...)
     * erzwungen. In der BEDINGUNG steht `cronSecret`, nicht `process.env....` — die
     * reine Bedingungssuche unten sah die Variable deshalb nie. Sie war damit in
     * Produktion Pflicht, ohne dass dieser Test ihre Dokumentation verlangt haette.
     * (Gefunden 2026-09-04, zusammen mit dem Namensende-Irrtum weiter unten.)
     */
    const alias = new Map();
    for (const m of body.matchAll(
      /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      alias.set(m[1], m[2]);
    }

    // Jede Bedingung, die zu einem fatal() fuehrt: welche ENV-Variablen kommen darin vor?
    for (const m of body.matchAll(/if\s*\(([\s\S]*?)\)\s*\{\s*fatal\(/g)) {
      for (const v of m[1].matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) required.add(v[1]);
      // ... und jeder Bezeichner, der oben aus einer ENV-Variablen gebildet wurde.
      for (const id of m[1].matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
        const env = alias.get(id[1]);
        if (env) required.add(env);
      }
    }
    template = fs.readFileSync(TEMPLATE, "utf8");
  });

  it("findet ueberhaupt Pflichtvariablen — sonst prueft der Test nichts", () => {
    // Ein leeres Ergebnis waere gruen und wertlos. Die Zahl ist bewusst grosszuegig
    // gewaehlt: sie soll ein kaputtes Auslesen fangen, nicht jede Aenderung blockieren.
    assert.ok(required.size >= 8,
      `Nur ${required.size} Pflichtvariablen erkannt — vermutlich passt das Auslesen nicht mehr ` +
      `zur Struktur von runProductionValidation().`);

    // Zwei Stichproben, die die BEIDEN Auslesewege festnageln — eine Zahl allein wuerde
    // nicht auffallen, wenn einer der beiden ausfaellt.
    assert.ok(required.has("SESSION_SECRET"),
      "SESSION_SECRET fehlt — die direkte Suche nach `process.env.X` in der Bedingung greift nicht mehr");
    assert.ok(required.has("INTERNAL_CRON_SECRET"),
      "INTERNAL_CRON_SECRET fehlt — die Aufloesung lokaler Umbenennungen (const x = process.env.Y) greift nicht mehr");
  });

  it("jede in Produktion erzwungene Variable ist in der Vorlage dokumentiert", () => {
    // NODE_ENV steht als einzige nicht zur Disposition: sie wird gesetzt, nicht gepflegt.
    const missing = [...required].filter((v) => !dokumentiert(template, v)).sort();
    assert.deepEqual(
      missing, [],
      `Diese Variablen brechen den Produktionsstart ab (fatal), fehlen aber in ` +
      `.env.prod.example. Wer die Produktion nach der Vorlage aufsetzt, bekommt eine API, ` +
      `die nicht startet:\n  ${missing.join("\n  ")}`
    );
  });

  it("der Namensende-Irrtum bleibt gefangen — BASE_URL ist kein DATABASE_URL", () => {
    // Diese Probe prueft den PRUEFER, nicht die Vorlage. Sie haelt fest, was am
    // 2026-09-04 kaputt war: die kuerzere Variable galt durch die laengere als
    // dokumentiert. Wer `dokumentiert()` je wieder auf `includes` zurueckdreht, wird
    // hier rot — nicht erst beim Deploy.
    // Bewusst ein mehrzeiliges Template-Literal statt "...\n...": der Zeilenumbruch ist
    // hier der Pruefgegenstand, und ein Escape, das auf dem Weg ins Repo kollabiert,
    // haette die Probe still entwertet.
    const nurDieLange = `
DATABASE_URL=postgres://U:P@H:5432/db
STAFF_SESSION_SECRET=X
`;
    assert.equal(dokumentiert(nurDieLange, "DATABASE_URL"), true);
    assert.equal(dokumentiert(nurDieLange, "BASE_URL"), false,
      "BASE_URL gilt als dokumentiert, obwohl nur DATABASE_URL dasteht — der Namensende-Irrtum ist zurueck");
    assert.equal(dokumentiert(nurDieLange, "STAFF_SESSION_SECRET"), true);
    assert.equal(dokumentiert(nurDieLange, "SESSION_SECRET"), false,
      "SESSION_SECRET gilt als dokumentiert, obwohl nur STAFF_SESSION_SECRET dasteht");

    // Und die andere Richtung: was wirklich dasteht, wird auch gefunden — auch
    // auskommentiert und mit `export`-Praefix.
    assert.equal(dokumentiert("# BASE_URL=https://x.de", "BASE_URL"), true);
    assert.equal(dokumentiert("export BASE_URL=https://x.de", "BASE_URL"), true);

    // Beide Namensenden stehen heute wirklich in der Vorlage — sonst waere die
    // Schaerfung oben eine stille Regression statt einer Reparatur.
    assert.equal(dokumentiert(template, "BASE_URL"), true);
    assert.equal(dokumentiert(template, "SESSION_SECRET"), true);
  });

  it("die Vorlage enthaelt keine echten Werte, nur Platzhalter", () => {
    // Eine Vorlage mit einem versehentlich echten Secret waere schlimmer als eine
    // luueckenhafte — sie liegt im Repo und im Release-Artefakt.
    //
    // Die Unterscheidung braucht mehr als das Praefix: `sk_live_DEIN_LIVE_SECRET_KEY` und
    // `postgres://USER:PASSWORD@HOST:PORT/DB` sind offensichtliche Platzhalter und wurden
    // vom ersten, naiveren Muster faelschlich angeschlagen.
    //
    // Merkmal, das hier zuverlaessig trennt: die Platzhalter dieser Datei sind
    // GROSSBUCHSTABEN mit Unterstrichen, echte Schluessel und Passwoerter enthalten
    // Kleinbuchstaben. Geprueft wird deshalb nur der Geheimnis-Teil des Wertes.
    const hatKleinbuchstaben = (s) => /[a-z]/.test(s);

    const funde = [];
    const stripe = template.match(/sk_live_([A-Za-z0-9]+)/);
    if (stripe && hatKleinbuchstaben(stripe[1])) funde.push("Stripe-Live-Schluessel");

    const whsec = template.match(/whsec_([A-Za-z0-9]{10,})/);
    if (whsec && hatKleinbuchstaben(whsec[1])) funde.push("Stripe-Webhook-Secret");

    const db = template.match(/postgres(?:ql)?:\/\/[^\s:]+:([^\s@]{8,})@/);
    if (db && hatKleinbuchstaben(db[1])) funde.push("DB-URL mit echtem Passwort");

    assert.deepEqual(
      funde, [],
      `In .env.prod.example steht offenbar ein echter Wert statt eines Platzhalters: ` +
      `${funde.join(", ")}. Diese Datei liegt im Repo und im Release-Artefakt.`
    );
  });

  it("die Staff-Welt hat ein eigenes Secret — nicht dasselbe wie die Kundensitzung", () => {
    // Der Code verbietet den Rueckfall auf SESSION_SECRET+':staff' in Produktion
    // ausdruecklich. Die Vorlage darf nicht dazu verleiten, denselben Wert einzutragen.
    // Bewusst `assert.ok` statt `assert.match`: letzteres kippt bei einem Fehlschlag die
    // gesamte Vorlage ins Protokoll und macht die Meldung unlesbar.
    assert.ok(/STAFF_SESSION_SECRET=/.test(template), "STAFF_SESSION_SECRET fehlt in .env.prod.example");
    const staff = template.match(/^STAFF_SESSION_SECRET=(.*)$/m)?.[1]?.trim();
    const session = template.match(/^SESSION_SECRET=(.*)$/m)?.[1]?.trim();
    assert.ok(staff, "STAFF_SESSION_SECRET hat keinen Platzhalter");
    assert.notEqual(staff, session, "Staff- und Kundensitzung duerfen nicht denselben Platzhalter teilen");
  });
});

describe("Produktions-Tor — es gibt genau EINES, und es wird gerufen", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * GEFUNDEN 2026-09-04 — ein zweites Tor, exportiert, mit NULL Aufrufern
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * `config/index.js` trug neben `runProductionValidation()` eine zweite
   * Funktion `validateProductionSecrets(log)`, die SESSION_SECRET und
   * JWT_SECRET prueft und sonst den Prozess beendet. Sie war exportiert — und
   * im ganzen Repo rief sie niemand.
   *
   * Der Schaden ist nicht die tote Zeile, sondern der EINDRUCK. Wer die Datei
   * liest, sieht zwei Tore und nimmt an, beide halten. Wer eine Pruefung
   * ergaenzen will, ergaenzt sie womoeglich im falschen — und sie laeuft nie.
   * Genau dieselbe Verwechslung wie beim Vorlagen-Waechter weiter oben: eine
   * Pruefung, die aussieht wie die Sache, aber nicht die Sache ist.
   *
   * Diese Proben halten beide Haelften fest: dass es EIN Tor gibt, und dass es
   * WIRKLICH GERUFEN WIRD. Die zweite ist die wichtigere — ein einzelnes Tor,
   * das niemand ruft, waere derselbe Fehler in kleiner.
   */

  it("`config/index.js` definiert kein zweites Tor neben runProductionValidation", () => {
    const cfg = fs.readFileSync(CONFIG, "utf8");
    /* Ein "Tor" ist hier: eine exportierte Funktion, die auf NODE_ENV === production
     * prueft und danach den Prozess beenden kann. */
    const tore = [];
    for (const m of cfg.matchAll(/export function ([A-Za-z_$][\w$]*)\s*\(/g)) {
      const ab = cfg.slice(m.index, m.index + 4000);
      const bisNaechste = ab.indexOf("\nexport ");
      const koerper = bisNaechste > 0 ? ab.slice(0, bisNaechste) : ab;
      if (/NODE_ENV/.test(koerper) && /process\.exit\(/.test(koerper)) tore.push(m[1]);
    }
    assert.deepStrictEqual(tore, ["runProductionValidation"],
      "Es gibt mehr als ein Produktions-Tor in config/index.js. Zwei Tore heissen: "
      + "wer eine Pruefung ergaenzt, trifft mit gleicher Wahrscheinlichkeit das, das "
      + "niemand ruft. Gefunden: " + tore.join(", "));
  });

  it("das eine Tor wird beim Start wirklich gerufen", () => {
    /* Die Gegenprobe, und sie ist der eigentliche Punkt: ein Tor, das niemand
     * ruft, ist kein Tor. Genau das war `validateProductionSecrets` — 
     * fehlerfrei geschrieben und ohne jede Wirkung. */
    const app = fs.readFileSync(path.join(API_ROOT, "app.js"), "utf8");
    assert.match(app, /runProductionValidation\s*\(/,
      "app.js ruft runProductionValidation() nicht mehr — dann startet die Produktion "
      + "ohne jede Pruefung ihrer Geheimnisse, und keiner der fatal-Zweige oben feuert je");
    assert.match(app, /from\s+["\']\.\/config\/index\.js["\']/,
      "app.js bindet config/index.js nicht mehr ein");
  });
});
