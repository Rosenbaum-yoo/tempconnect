/**
 * Die drei Waechter fuer die Frontend-Verdrahtung.
 *
 * WARUM ES SIE GIBT
 * Das Backend kann seit den Mutation-Wellen beweisen, dass ein eingebauter
 * Fehler von einem Test gefangen wird. Das Frontend konnte bis hierher nicht
 * einmal beweisen, dass ein Knopf ankommt.
 *
 * Der Audit vom 2026-08-13 (docs/FRONTEND_REIFEGRAD_AUDIT.md) fand 85 Befunde.
 * Das Muster war durchgaengig dasselbe: DER FEHLER WIRD GESCHLUCKT STATT
 * GEZEIGT. Ein Aufruf trifft die richtige Route, geht ohne CSRF-Token raus,
 * bekommt 403 — und weil er mit .catch(function(){}) endet, erfaehrt niemand
 * davon. Der Nutzer klickt Speichern, sieht keine Meldung, und die Daten sind
 * weg.
 *
 * Diese drei Pruefungen haetten ALLE ACHT Befunde der Klasse "tote Enden"
 * gefunden, bevor sie einen Kunden erreichen:
 *
 *   1. Jeder onclick zeigt auf eine Funktion, die es gibt.
 *   2. Jeder schreibende Aufruf schickt ein CSRF-Token.
 *   3. Jeder interne Verweis zeigt auf eine Datei, die existiert.
 *
 * Sie sind billig, brauchen keine Datenbank und laufen in unter einer Sekunde.
 *
 * Run: node --test --test-force-exit test/frontendVerdrahtung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen statt feste Ebenen raten — und dabei auf INHALT pruefen,
 * nicht auf blosse Existenz.
 *
 * Das ist beim ersten Anlauf schiefgegangen: Docker legt das Ziel eines
 * Bind-Mounts auf dem Host als Verzeichnis an, deshalb existiert
 * api/frontend/public und enthaelt nur den gemounteten js-Ordner — keine
 * einzige HTML-Seite. Ab cwd=api/ fand die Suche genau dieses Verzeichnis, die
 * Seitenliste war leer, und alle drei Waechter waren gruen, ohne irgendetwas
 * geprueft zu haben.
 *
 * Dieselbe Falle wie bei den Migrations-Tests und bei visibilityMatrix. Eine
 * gruene Suite, die weniger prueft als sie behauptet, ist schlimmer als eine
 * rote — deshalb zaehlt hier nur ein Verzeichnis mit echten Seiten.
 */
const PUB_REL = "frontend/public";

function hatSeiten(dir) {
  try {
    return fs.readdirSync(dir).some((f) => f.endsWith(".html"));
  } catch { return false; }
}

function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (hatSeiten(path.join(dir, PUB_REL))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const PUB = ROOT ? path.join(ROOT, PUB_REL) : null;
const vorhanden = Boolean(PUB);
const suite = vorhanden ? describe : describe.skip;

const seiten = () => fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
const lies = (p) => fs.readFileSync(p, "utf8");

/** Markup ohne Kommentare — sonst melden wir auskommentierte Altlasten. */
function ohneKommentare(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Kein Knopf ohne Funktion
 * ═══════════════════════════════════════════════════════════════════════════ */

suite("Waechter 1 — jeder onclick zeigt auf eine Funktion, die es gibt", () => {
  /*
   * Der Audit fand drei tote Handler, darunter die HAUPTAKTION der
   * Kundenabrechnung: ein Knopf, der sich aktiv schaltet, sich mit
   * "N Positionen an Kunde senden" beschriftet — und beim Klick einen
   * ReferenceError in die Konsole schreibt.
   */

  /** Sammelt den JS-Text, den eine Seite wirklich laedt (extern + inline). */
  function skripteVon(html, datei) {
    let text = "";
    for (const m of html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) {
      const src = m[1].split("?")[0];
      if (/^https?:/.test(src)) continue;
      const kandidaten = [
        path.join(PUB, src.replace(/^\//, "").replace(/^public\//, "")),
        path.join(path.dirname(datei), src)
      ];
      for (const k of kandidaten) {
        if (fs.existsSync(k)) { text += "\n" + lies(k); break; }
      }
    }
    for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      text += "\n" + m[1];
    }
    return text;
  }

  /** Definiert der geladene Code diesen Namen? */
  function kenntFunktion(js, name) {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      "function\\s+" + n + "\\s*\\(" +
      "|window\\s*\\.\\s*" + n + "\\s*=" +
      "|(?:var|let|const)\\s+" + n + "\\s*=" +
      "|\\b" + n + "\\s*[:=]\\s*(?:async\\s*)?(?:function|\\()"
    ).test(js);
  }

  it("kein Handler zeigt ins Leere", () => {
    const tot = [];
    for (const datei of seiten()) {
      const voll = path.join(PUB, datei);
      const html = ohneKommentare(lies(voll));
      const js = skripteVon(html, voll);

      for (const m of html.matchAll(/\bon(?:click|change|submit|input)\s*=\s*["']([^"']+)["']/g)) {
        const koerper = m[1];
        // Nur einfache Aufrufe pruefen: fnName(...). Inline-Ausdruecke wie
        // "this.value" oder mehrteilige Anweisungen sind kein Handler-Verweis.
        for (const auf of koerper.matchAll(/(?:^|[;\s{])([A-Za-z_$][\w$]*)\s*\(/g)) {
          const name = auf[1];
          // Eingebaute und Objekt-Methoden ueberspringen.
          if (/^(if|for|while|switch|return|typeof|void|new|alert|confirm|prompt|parseInt|parseFloat|Number|String|Boolean|Array|Object|JSON|Math|Date|console|window|document|event)$/.test(name)) continue;
          if (koerper.includes("." + name + "(")) continue;   // obj.method()
          if (!kenntFunktion(js, name)) tot.push(`${datei}: ${name}()`);
        }
      }
    }

    assert.deepEqual([...new Set(tot)], [],
      "diese Handler zeigen auf Funktionen, die der geladene Code nicht kennt — " +
      "ein Klick erzeugt einen ReferenceError und es passiert nichts");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Kein schreibender Aufruf ohne CSRF-Token
 * ═══════════════════════════════════════════════════════════════════════════ */

suite("Waechter 2 — jeder eigene api()-Helfer schickt bei Mutationen CSRF", () => {
  /*
   * Der teuerste Befund des Audits: der Onboarding-Wizard sendet ALLE sechs
   * schreibenden Aufrufe ohne x-csrf-token. csrfProtect haengt global unter
   * app.use("/api/", ...) — jeder endet in 403. Und weil jeder Aufruf mit
   * .catch(function(){}) abgefangen wird, sieht der Nutzer nichts: die im
   * Wizard eingegebenen Profildaten werden nie gespeichert, und "nicht mehr
   * anzeigen" wird nie gesetzt. Deshalb erscheint der Wizard bei jedem Login
   * erneut.
   *
   * Geprueft wird die STRUKTUR, nicht der einzelne Aufruf: definiert eine
   * Datei einen eigenen api()-Helfer, der nicht-GET absetzt, muss dieser
   * Helfer das Token setzen. Seiten, die den gemeinsamen Client benutzen,
   * sind damit automatisch in Ordnung.
   */
  function jsDateien(verzeichnis) {
    const out = [];
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      const p = path.join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) out.push(...jsDateien(p));
      else if (eintrag.name.endsWith(".js")) out.push(p);
    }
    return out;
  }

  it("kein eigener Helfer mutiert ohne Token", () => {
    const ohne = [];
    for (const datei of jsDateien(path.join(PUB, "js"))) {
      const js = lies(datei);

      // Definiert die Datei einen EIGENEN Aufruf-Helfer?
      if (!/function\s+api\s*\(|const\s+api\s*=\s*(?:async\s*)?\(|var\s+api\s*=\s*function/.test(js)) continue;

      // Setzt sie ueberhaupt nicht-GET ab?
      const mutiert = /method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(js)
        || /opts\.method|o\.method|options\.method/.test(js);
      if (!mutiert) continue;

      if (!/x-csrf-token/i.test(js)) {
        ohne.push(path.relative(ROOT, datei).replace(/\\/g, "/"));
      }
    }

    assert.deepEqual(ohne, [],
      "diese Dateien haben einen eigenen api()-Helfer, setzen damit schreibende " +
      "Anfragen ab und schicken NIE ein CSRF-Token. Jede solche Anfrage endet in " +
      "403 — und wenn der Aufrufer den Fehler verschluckt, merkt es niemand");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Kein Verweis in die Sackgasse
 * ═══════════════════════════════════════════════════════════════════════════ */

suite("Waechter 3 — jeder interne Verweis zeigt auf eine Datei, die es gibt", () => {
  /*
   * Der Audit fand drei Sackgassen, darunter zwei, die den Nutzer aktiv
   * hinschicken: ein Profil-Hinweis, der zur Vervollstaendigung auffordert und
   * auf 404 fuehrt, und der Leerzustand eines Merkzettels, dessen einziger
   * Ausweg ins Nichts zeigt.
   */
  it("kein Verweis fuehrt ins Nichts", () => {
    const tot = [];
    for (const datei of seiten()) {
      const html = ohneKommentare(lies(path.join(PUB, datei)));

      for (const m of html.matchAll(/\b(?:href|action)\s*=\s*["']([^"']+)["']/g)) {
        let ziel = m[1].split("#")[0].split("?")[0].trim();
        if (!ziel) continue;
        if (/^(https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(ziel)) continue;
        if (!ziel.endsWith(".html")) continue;   // nur Seiten, keine Assets/APIs

        // /public/x.html und /x.html zeigen beide in frontend/public.
        const rel = ziel.replace(/^\//, "").replace(/^public\//, "");
        if (!fs.existsSync(path.join(PUB, rel))) {
          tot.push(`${datei} → ${m[1]}`);
        }
      }
    }

    assert.deepEqual([...new Set(tot)], [],
      "diese Verweise zeigen auf Seiten, die es nicht gibt — nginx antwortet mit " +
      "404, und der Nutzer steht vor einer Sackgasse");
  });
});
