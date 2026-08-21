/**
 * Erkennt ECHTE Zugangsdaten in einer Quelltextzeile.
 *
 * DER BEFUND, DER DIESES MODUL ERZWUNGEN HAT:
 * Die Secret-Pruefung in release-verify.sh meldete 18 Treffer und liess damit
 * die Release-Validierung scheitern — alle 18 waren Fehlalarme. Darunter, als
 * Sinnbild der Ursache: der eigene Kommentar der Pruefung. Die Regel lautete
 * "irgendetwas nach SECRET= mit mehr als 20 Zeichen" und traf damit jede Zeile,
 * die ein Secret LIEST, BESCHREIBT oder ERWAEHNT — statt eines zuzuweisen.
 *
 * Eine Pruefung, die bei jedem Lauf 18-mal falsch anschlaegt, wird nicht
 * gelesen, sondern abgeschaltet. Fehlalarme sind kein Schoenheitsfehler,
 * sondern der Weg, auf dem ein echter Fund untergeht.
 *
 * DIE FRAGE, DIE DIESES MODUL STELLT — und die alte nicht stellte:
 * Nicht "steht hier das Wort SECRET?", sondern **"liegt hier ein Wert, mit dem
 * sich jemand tatsaechlich anmelden koennte?"**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WIE DIE ANTWORT ZUSTANDE KAM — gemessen, nicht behauptet
 *
 * Der erste Entwurf trennte nach LAENGE: ab 32 Zeichen ein Fund, darunter nur
 * mit Anbieter-Praefix. Die Schwelle war von `envValidator.isWeak()` geliehen
 * und klang stichhaltig. Der Lauf gegen das echte Repo hat sie widerlegt — er
 * meldete unter anderem einen deutschen SATZ ("Der Reset-Link ist abgelaufen.")
 * und jeden Platzhalter in `deploy/.env`.
 *
 * Der zweite Gedanke war Entropie. Auch der wurde gemessen, bevor er Regel
 * wurde — und die Messung hat ihn als alleiniges Kriterium verworfen:
 *
 *     echte Schluessel      3.86 … 5.46 bit/Zeichen
 *     Fehlalarme            2.00 … 4.25 bit/Zeichen
 *                                ^^^^^^^^^^^^ Ueberlappung
 *
 * Ein einzelner Schwellenwert haette entweder den echten GitHub-Token (3.86)
 * verloren oder die Platzhalter (bis 4.25) behalten.
 *
 * ZERLEGT trennt es sauber. Zwei Faelle, zwei Regeln:
 *
 *   1. Wert traegt ein ANBIETER-PRAEFIX (sk_live_, ghp_, AKIA …)
 *      → er muss dessen STRENGES FORMAT erfuellen. Anbieter geben Laenge und
 *        Zeichenvorrat vor. `sk_live_realkey1234567890` hat 17 Kernzeichen —
 *        Stripe vergibt mindestens 24. Kein Vokabular noetig, die Form
 *        entscheidet.
 *
 *   2. Wert ohne Praefix (SESSION_SECRET, JWT_SECRET, DB-Passwoerter)
 *      → mindestens 32 Zeichen UND mindestens 4.5 bit/Zeichen. In diesem Fall
 *        klafft eine saubere Luecke: echte ab 4.88, Fehlalarme bis 4.25.
 *
 * Dazu zwei harte Ausschluesse, die keine Messung brauchen: Ein Wert mit
 * LEERZEICHEN ist kein Zugangsdatum (das war der deutsche Satz), und
 * Platzhalter-Vokabular (HIER_, CHANGE_ME, EINTRAGEN …) ist eine Anweisung an
 * einen Menschen, kein Geheimnis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WARUM EIN MODUL UND KEIN BASH-EINZEILER:
 * Diese Regel muss beweisbar bleiben. Als Funktion laesst sie sich mit echten
 * Zeilen fuettern — den Fehlalarmen UND gepflanzten echten Secrets
 * (api/test/releaseSecretScan.test.js, 60+ Faelle). Eine Regex in einem
 * Shell-Skript kann das nicht: Sie laeuft erst beim Release, und dann glaubt
 * man ihr.
 */

/** Namen, hinter denen ein Geheimnis stehen kann. */
const SECRET_NAMEN =
  "(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|APIKEY|ACCESS_KEY|AUTH_KEY)[A-Z0-9_]*)";

/**
 * Anbieter-Formate — Praefix plus das, was danach kommen MUSS.
 *
 * Die Laengen stammen aus den Vorgaben der Anbieter. Sie sind der Grund, warum
 * hier keine Wortliste noetig ist: Eine Testvorrichtung wie
 * `sk_test_HIER_EIGENEN_TESTKEY_EINTRAGEN` scheitert nicht am Wort "HIER",
 * sondern daran, dass Stripe-Schluessel keine Unterstriche enthalten.
 */
const ANBIETER_FORMATE = [
  { name: "Stripe Secret Key",     muster: /^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}$/ },
  { name: "Stripe Publishable",    muster: /^pk_(?:live|test)_[A-Za-z0-9]{24,}$/ },
  { name: "Stripe Webhook Secret", muster: /^whsec_[A-Za-z0-9+/=]{32,}$/ },
  { name: "GitHub Token",          muster: /^gh[posu]_[A-Za-z0-9]{36,}$/ },
  { name: "GitHub Fine-Grained",   muster: /^github_pat_[A-Za-z0-9_]{60,}$/ },
  { name: "AWS Access Key",        muster: /^(?:AKIA|ASIA)[0-9A-Z]{16}$/ },
  { name: "Slack Token",           muster: /^xox[bpaors]-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}$/ },
  { name: "Google API Key",        muster: /^AIza[0-9A-Za-z\-_]{35}$/ },
  { name: "SendGrid Key",          muster: /^SG\.[A-Za-z0-9\-_]{22}\.[A-Za-z0-9\-_]{43}$/ },
  { name: "Anthropic Key",         muster: /^sk-ant-[A-Za-z0-9\-_]{32,}$/ },
  { name: "OpenAI Key",            muster: /^sk-(?:proj-)?[A-Za-z0-9\-_]{32,}$/ },
  { name: "HuggingFace Token",     muster: /^hf_[A-Za-z0-9]{32,}$/ },
];

/** Die blossen Praefixe — fuer die Frage "gilt hier Fall 1 oder Fall 2?". */
const ANBIETER_PRAEFIXE = [
  "sk_live_", "sk_test_", "rk_live_", "rk_test_", "pk_live_", "pk_test_",
  "whsec_", "ghp_", "gho_", "ghs_", "ghu_", "github_pat_",
  "AKIA", "ASIA", "xoxb-", "xoxp-", "xoxa-", "xoxo-", "xoxr-", "xoxs-",
  "AIza", "SG.", "sk-ant-", "sk-proj-", "sk-", "hf_",
];

/**
 * Platzhalter-Vokabular — eine Anweisung an einen Menschen, kein Geheimnis.
 *
 * Gilt unabhaengig von Laenge und Entropie. `deploy/.env` traegt
 * `HIER_MINDESTENS_64_ZEICHEN_ZUFAELLIGER_STRING_SETZEN`: 52 Zeichen, und
 * genau deshalb hat die erste Fassung es gemeldet.
 */
const PLATZHALTER = [
  "platzhalter", "placeholder", "change_me", "changeme", "change-me",
  "your_", "your-", "yourkey", "youremail", "hier_", "hier-", "hiereinsetzen",
  "eintragen", "einsetzen", "setzen", "ersetzen", "aendern", "bitte_",
  "enter_", "enter-", "replace", "example", "beispiel", "dummy", "todo",
  "xxxx", "yyyy", "zzzz", "aaaa", "insert_", "fill_", "tbd", "undefined",
];

/* BEWUSST NICHT IN DER LISTE: aufsteigende Ziffernfolgen wie "1234567890".
 *
 * Sie standen zuerst darin und haetten einen ECHTEN Slack-Token verworfen — die
 * Kennung `xoxb-2401234567890-…` traegt die Folge mitten in der Team-ID. Die
 * Faelle, fuer die sie gedacht war (`sk_live_realkey1234567890`), scheitern
 * ohnehin am strengen Anbieter-Format: 17 Kernzeichen, Stripe vergibt 24.
 *
 * Merksatz fuer jede Erweiterung dieser Liste: Ein Eintrag, den ein echter
 * Schluessel enthalten KANN, macht die Pruefung blind — nicht ruhiger. */

/**
 * Ausdrueckliche Freigabe im Quelltext.
 *
 * Manche Dateien MUESSEN formechte Zugangsdaten enthalten — allen voran der
 * Test dieses Moduls, der ohne realistische Werte nichts beweist. Statt solche
 * Dateien pauschal auszunehmen (womit ein echter Fund dort unsichtbar wuerde),
 * traegt die einzelne ZEILE die Freigabe. Sie ist sichtbar, greppbar und
 * pruefbar — im Gegensatz zu einer Ausnahmeliste, die niemand mehr liest.
 */
const FREIGABE = /secret-scan:\s*erlaubt/i;

/** Wert liest nur — das Geheimnis steht woanders. */
function istVerweis(wert) {
  return (
    wert.includes("$") ||                       // ${VAR}, $VAR (Shell), Templates
    /^process\.env\b/.test(wert) ||
    /^import\.meta\.env\b/.test(wert) ||
    /^(?:config|env|opts|options|process|self|globalThis)\./.test(wert) ||
    /^(?:String|Number|Boolean|require|await|import)\s*\(/.test(wert)
  );
}

/** Zeile ist ein Kommentar — Erwaehnung, keine Zuweisung. */
function istKommentar(zeile) {
  return /^\s*(?:#|\/\/|\*|--)/.test(zeile);
}

/**
 * Shannon-Entropie in bit je Zeichen.
 *
 * Das Mass fuer "wie zufaellig ist dieser Wert". Sprache wiederholt Zeichen und
 * liegt niedrig; ein Zufallsschluessel nutzt den Zeichenvorrat gleichmaessig
 * und liegt hoch.
 */
export function entropie(s) {
  if (!s || s.length === 0) return 0;
  const haeufigkeit = new Map();
  for (const zeichen of s) {
    haeufigkeit.set(zeichen, (haeufigkeit.get(zeichen) || 0) + 1);
  }
  let h = 0;
  for (const anzahl of haeufigkeit.values()) {
    const p = anzahl / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Mindest-Entropie fuer Werte OHNE Anbieter-Praefix.
 *
 * Gemessen, nicht geraten: echte Werte dieser Art liegen bei 4.88 und darueber,
 * die gefundenen Fehlalarme bei hoechstens 4.25. 4.5 liegt in der Luecke, mit
 * Abstand nach beiden Seiten.
 */
const ENTROPIE_SCHWELLE = 4.5;

/**
 * Mindestlaenge fuer Werte ohne Anbieter-Praefix.
 *
 * Geliehen von `api/config/envValidator.js` (`isWeak`): Kuerzeres akzeptiert
 * die Produktion nicht, es kann also kein Produktions-Secret sein.
 */
const MINDESTLAENGE = 32;

/** Praefix abschneiden — es ist bei echten wie falschen Werten identisch. */
function ohnePraefix(wert) {
  for (const p of ANBIETER_PRAEFIXE) {
    if (wert.startsWith(p)) return wert.slice(p.length);
  }
  return wert;
}

/**
 * Das Suchmuster — EINMAL kompiliert.
 *
 * Stand zuerst in pruefeZeile() und wurde damit bei JEDER Zeile neu gebaut. Bei
 * rund 400.000 Zeilen im Paket waren das 400.000 Kompilierungen: der Scan
 * brauchte fuer `api/` allein 84 Sekunden.
 *
 * Zuweisung verlangen: NAME = wert. Ein Vergleich (===) ist keine Zuweisung,
 * ein Regex-Muster (=/.../) auch nicht — beide scheitern an (?![=/]), weil auf
 * das Gleichheitszeichen unmittelbar ein Wert folgen muss.
 */
const MUSTER = new RegExp(
  SECRET_NAMEN +
    "\\s*[:=]\\s*" +              // = oder : (YAML/JSON)
    "(?![=/])" +                  // kein Vergleich, kein Regex-Literal
    "(?:" +
    "\"([^\"]{8,})\"" +           // "wert"
    "|'([^']{8,})'" +             // 'wert'
    "|`([^`]{8,})`" +             // `wert`
    "|([A-Za-z0-9_\\-+./]{8,})" + // wert ohne Anfuehrungszeichen (.env)
    ")",
  "g"
);

/**
 * Einen einzelnen Wert beurteilen.
 *
 * Ausgelagert, damit der Test ihn direkt fuettern kann — die Entscheidung ist
 * der Kern dieses Moduls und soll nicht nur ueber ganze Zeilen pruefbar sein.
 *
 * @param {string} wert
 * @returns {{wert: string, grund: string}|null}
 */
export function beurteileWert(wert) {
  if (!wert || typeof wert !== "string") return null;

  /* Kein Zugangsdatum enthaelt Leerzeichen. Das war der deutsche Satz aus
   * landing.js — 51 Zeichen, 4.08 bit/Zeichen, und damit an beiden Schwellen
   * vorbei. Diese eine Zeile faengt jede Meldung, jedes Label, jeden Satz. */
  if (/\s/.test(wert)) return null;

  if (istVerweis(wert)) return null;

  const niedrig = wert.toLowerCase();
  if (PLATZHALTER.some((p) => niedrig.includes(p))) return null;

  /* FALL 1 — Anbieter-Praefix: das Format des Anbieters entscheidet. */
  const praefix = ANBIETER_PRAEFIXE.find((p) => wert.startsWith(p));
  if (praefix) {
    const format = ANBIETER_FORMATE.find((f) => f.muster.test(wert));
    if (format) {
      return { wert, grund: `gueltiges Format: ${format.name}` };
    }
    /* Praefix ja, Format nein → Vorrichtung. Bewusst KEIN Rueckfall auf die
     * generische Regel: Wer `whsec_` schreibt, meint einen Stripe-Schluessel,
     * und der hat ein festes Format. */
    return null;
  }

  /* FALL 2 — ohne Praefix: Laenge UND Zufaelligkeit muessen stimmen. */
  const kern = ohnePraefix(wert);
  if (kern.length < MINDESTLAENGE) return null;

  const h = entropie(kern);
  if (h < ENTROPIE_SCHWELLE) return null;

  return {
    wert,
    grund: `${kern.length} Zeichen, ${h.toFixed(2)} bit/Zeichen — zufaellig genug fuer einen echten Schluessel`,
  };
}

/**
 * Eine Zeile pruefen.
 *
 * @param {string} zeile
 * @returns {{wert: string, grund: string}|null} Fund oder null.
 */
export function pruefeZeile(zeile) {
  if (typeof zeile !== "string" || zeile.length === 0) return null;

  /* Kommentare zaehlen nicht. Der ausloesende Fehlalarm war der Kommentar der
   * Pruefung selbst — sie beschrieb, wonach sie sucht, und fand sich dabei. */
  if (istKommentar(zeile)) return null;

  /* Ausdrueckliche Freigabe dieser Zeile. */
  if (FREIGABE.test(zeile)) return null;

  /* Das geteilte Muster — nicht je Zeile neu bauen (siehe MUSTER oben).
   *
   * lastIndex MUSS zurueckgesetzt werden: Das Objekt traegt die g-Flagge, und
   * diese Funktion kehrt beim Fund vorzeitig zurueck. Ohne den Reset bliebe der
   * Zeiger stehen und die naechste Zeile wuerde ab der Mitte gelesen — ein
   * Fehler, der nur bei Dateien mit mehreren Treffern auftritt und deshalb
   * lange unbemerkt bliebe. */
  const muster = MUSTER;
  muster.lastIndex = 0;

  let treffer;
  while ((treffer = muster.exec(zeile)) !== null) {
    const wert = treffer[1] ?? treffer[2] ?? treffer[3] ?? treffer[4];
    const fund = beurteileWert(wert);
    if (fund) return fund;
  }

  return null;
}

/**
 * Eine Datei pruefen.
 *
 * @param {string} inhalt
 * @returns {Array<{zeile: number, wert: string, grund: string}>}
 */
export function pruefeDatei(inhalt) {
  /* Auf CR-optionales Zeilenende splitten: Windows checkt CRLF aus, der
   * Container sieht LF. Wer nur auf \n splittet, schleppt ein
   * Wagenruecklauf-Zeichen in jeden Wert und verfaelscht Laenge wie Entropie. */
  const zeilen = String(inhalt).split(/\r?\n/);
  const funde = [];
  for (let i = 0; i < zeilen.length; i++) {
    const fund = pruefeZeile(zeilen[i]);
    if (fund) funde.push({ zeile: i + 1, ...fund });
  }
  return funde;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Direktaufruf: node scripts/lib/secretScan.mjs <verzeichnis>
 *
 * Ein Prozess fuer den ganzen Baum. Die alte Bash-Schleife startete ZWEI
 * grep-Prozesse pro ZEILE — bei rund 400.000 Zeilen im Paket war das der
 * langsamste Schritt der gesamten Release-Pruefung.
 *
 * Ausgabe je Fund: pfad:zeile:grund:wert   (Exit 0 — es zaehlt der Aufrufer)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { pathToFileURL } from "node:url";

/** Dateien, in denen ein Secret ueberhaupt stehen kann. */
const RELEVANT = /\.(js|mjs|cjs|ts|tsx|json|yml|yaml|sh|bash|env|conf|config|ini|toml|properties)$/i;
const RELEVANTE_NAMEN = new Set([".env", "Makefile", "Dockerfile"]);

/**
 * Verzeichnisse, die nichts zur Frage beitragen.
 *
 * Deckungsgleich mit der EXCLUDE_LIST von release-package.sh: Was gar nicht
 * erst ins Paket kommt, muss dort auch nicht gesucht werden. `release/` ist
 * dabei der wichtigste Eintrag — es enthaelt fruehere Pakete, und ohne diese
 * Zeile meldet jeder Lauf die Funde aller Vorgaenger gleich mit.
 */
const UEBERSPRINGEN = new Set([
  "node_modules", ".git", ".github", "coverage", ".nyc_output", ".c8_output",
  "dist", "build", "test-results", ".stryker-tmp",
  "release", "backups", "uploads", "data", "db-data", "redis-data",
  "_zip_analysis", ".claude", ".agents", "tmp",
]);

function istRelevant(name) {
  if (name.endsWith(".example")) return false;   // Vorlagen duerfen Muster tragen
  return RELEVANT.test(name) || RELEVANTE_NAMEN.has(name);
}

async function laufe(wurzel) {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, relative, sep } = await import("node:path");
  const funde = [];

  async function ab(verz) {
    let eintraege;
    try {
      eintraege = await readdir(verz, { withFileTypes: true });
    } catch {
      return;                                     // unlesbar: nichts zu melden
    }
    for (const e of eintraege) {
      const voll = join(verz, e.name);
      if (e.isDirectory()) {
        if (UEBERSPRINGEN.has(e.name)) continue;
        await ab(voll);
      } else if (e.isFile() && istRelevant(e.name)) {
        let inhalt;
        try {
          inhalt = await readFile(voll, "utf8");
        } catch {
          continue;                               // Binaerdatei o. ae.
        }
        for (const f of pruefeDatei(inhalt)) {
          funde.push({ datei: relative(wurzel, voll).split(sep).join("/"), ...f });
        }
      }
    }
  }

  await ab(wurzel);
  return funde;
}

/* Nur bei Direktaufruf laufen — beim Import aus dem Test passiert hier nichts. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const wurzel = process.argv[2];
  if (!wurzel) {
    console.error("Aufruf: node secretScan.mjs <verzeichnis>");
    process.exit(2);
  }
  const funde = await laufe(wurzel);
  for (const f of funde) {
    console.log(`${f.datei}:${f.zeile}:${f.grund}:${f.wert}`);
  }
}
