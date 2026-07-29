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

describe("Produktionsvorlage `.env.prod.example`", () => {
  /** @type {Set<string>} */ let required = new Set();
  /** @type {string} */ let template = "";

  before(() => {
    const cfg = fs.readFileSync(CONFIG, "utf8");
    const marker = "export function runProductionValidation";
    const at = cfg.indexOf(marker);
    assert.notEqual(at, -1, `'${marker}' nicht gefunden — wurde die Validierung umbenannt?`);
    const body = cfg.slice(at);

    // Jede Bedingung, die zu einem fatal() fuehrt: welche ENV-Variablen kommen darin vor?
    for (const m of body.matchAll(/if\s*\(([\s\S]*?)\)\s*\{\s*fatal\(/g)) {
      for (const v of m[1].matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) required.add(v[1]);
    }
    template = fs.readFileSync(TEMPLATE, "utf8");
  });

  it("findet ueberhaupt Pflichtvariablen — sonst prueft der Test nichts", () => {
    // Ein leeres Ergebnis waere gruen und wertlos. Die Zahl ist bewusst grosszuegig
    // gewaehlt: sie soll ein kaputtes Auslesen fangen, nicht jede Aenderung blockieren.
    assert.ok(required.size >= 8,
      `Nur ${required.size} Pflichtvariablen erkannt — vermutlich passt das Auslesen nicht mehr ` +
      `zur Struktur von runProductionValidation().`);
  });

  it("jede in Produktion erzwungene Variable ist in der Vorlage dokumentiert", () => {
    // NODE_ENV steht als einzige nicht zur Disposition: sie wird gesetzt, nicht gepflegt.
    const missing = [...required].filter((v) => !template.includes(v)).sort();
    assert.deepEqual(
      missing, [],
      `Diese Variablen brechen den Produktionsstart ab (fatal), fehlen aber in ` +
      `.env.prod.example. Wer die Produktion nach der Vorlage aufsetzt, bekommt eine API, ` +
      `die nicht startet:\n  ${missing.join("\n  ")}`
    );
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
