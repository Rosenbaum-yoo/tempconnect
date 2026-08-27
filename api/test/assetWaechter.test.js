/**
 * Der Asset-Waechter — jede Adresse im Markup gegen den echten Bestand.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS PASSIERT IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `frontend/landing.html` verwies an vier Stellen auf Bilder unter
 * `/public/img/landing/`. Das Verzeichnis hat nie existiert. Aufgefallen ist es
 * am 2026-08-22 — auf der ersten Seite, die ein Besucher ueberhaupt sieht.
 *
 * Der eigentliche Befund lag eine Ebene tiefer. Die vier Adressen antworteten
 * naemlich nicht mit 404, sondern mit HTTP 200 und 71016 Bytes Landing-HTML:
 * der Catch-All in `nginx/nginx.conf` (`try_files $uri $uri/ /landing.html`)
 * ist als Deep-Link-Fallback fuer NAVIGATION gedacht und fing bis dahin auch
 * jede tote Asset-Adresse ab. Ein Soft-404 ist schlimmer als ein 404:
 *
 *   - Status 200 heisst, dass kein Monitoring und kein Logfilter ihn sieht,
 *   - CDN und Browser cachen die falsche Antwort als gueltige Antwort,
 *   - ein <img> bekommt HTML statt Bild, ein <script src> HTML statt Code —
 *     der Fehler taucht weit entfernt von seiner Ursache wieder auf,
 *   - jeder Aufruf kostet die volle Startseite statt einer 150-Byte-Antwort.
 *
 * Dieselbe Suche fand im selben Lauf zwei weitere Faelle, die genau deshalb
 * jahrelang unbemerkt bleiben konnten: `/favicon.ico` (von jedem Browser
 * ungefragt angefordert, auf jeder Seite) und `/onepager.html` im Fuss von
 * Impressum und Datenschutz — beide 200, beide die Startseite, beide falsch.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM EIN WAECHTER UND KEIN EINMALIGER FIX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Adresse im Markup und eine Datei auf der Platte sind zwei Dinge, die
 * niemand aneinander bindet. Es gibt keinen Compiler dazwischen, keinen Build
 * fuer `frontend/public/`, und der Server hat den Unterschied bisher versteckt.
 * Genau die Konstellation, in der Fehler nicht auffallen, sondern altern.
 *
 * Dieser Waechter ist die fehlende Bindung. Er prueft — wie der Doku-Waechter
 * (`dokuWaechter.test.js`, Schicht B1) das Register — in BEIDE Richtungen:
 *
 *   Richtung A   Adresse ohne Datei    "das Markup verspricht etwas, das fehlt"
 *   Richtung B   Datei ohne Adresse    "eine Datei liegt da und wird nie geliefert"
 *
 * Richtung B ist die, die man vergisst. Sie ist hier aber die wichtigere: sie
 * ist der Grund, warum das Zurueckverdrahten der Landing-Bilder nicht vergessen
 * werden KANN. Legt jemand `story-multiskill.webp` ab, wird Schicht C rot und
 * nennt die Zeile, die in `landing.html` fehlt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ER BEWUSST NICHT PRUEFT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  - Externe Adressen (http/https/data/mailto/tel). Ob ein fremder Server
 *    heute antwortet, ist keine Eigenschaft dieses Repos, und ein Test, der
 *    das Netz braucht, ist ein Test, der irgendwann grundlos rot ist.
 *  - `/api/…` und `/uploads/…`. Die beantwortet der API-Container, nicht der
 *    Dateibaum — dort waere "Datei fehlt" die falsche Frage.
 *  - Adressen ohne Dateiendung (`/pilot`, `/legal/agb`). Das sind Routen, keine
 *    Dateien; nginx loest sie ueber `return 30x` bzw. `try_files $uri.html` auf.
 *  - `frontend/src/**`. Dort loest Vite die Adressen zur Bauzeit auf und bricht
 *    von sich aus laut ab. Ein zweiter Waechter waere doppelt und wuerde bei
 *    gehashten Bundle-Namen nur falsch-rot leuchten.
 *
 * Run: node --test --test-force-exit test/assetWaechter.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen UND auf INHALT pruefen — dieselbe Falle wie beim
 * Doku-Waechter: Docker legt Mount-Ziele als leere Verzeichnisse an, und eine
 * Suche, die so eines findet, macht jede Pruefung lautlos gruen. Es zaehlt nur
 * eine Wurzel, in der die Landing, echte Seiten UND die nginx-Konfiguration
 * zusammen liegen.
 */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const landing = path.join(dir, "frontend", "landing.html");
      const seiten = path.join(dir, "frontend", "public");
      const nginx = path.join(dir, "nginx", "nginx.conf");
      if (
        fs.existsSync(landing) && fs.statSync(landing).size > 5000 &&
        fs.existsSync(nginx) &&
        fs.existsSync(seiten) && fs.readdirSync(seiten).some((f) => f.endsWith(".html"))
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

/* Untergrenzen gegen stilles Verkuemmern: sinkt der geprueffte Umfang darunter,
 * ist der Waechter kaputt und nicht das Repo aufgeraeumt. Ohne sie kann ein
 * Waechter unbemerkt zur Beruhigungspille werden — er prueft null Adressen und
 * meldet gruen. (Stand 2026-08-22: 94 HTML, 12 CSS, 63 JS, ~170 Adressen.) */
const MIN_HTML = 80;
const MIN_CSS = 10;
const MIN_JS = 40;
const MIN_ADRESSEN = 120;

/* Verzeichnisse, die nicht zum Quellstand gehoeren. `owner-control`, `dist` und
 * `assets` sind Vite-Ausgaben (gitignored) — sie existieren mal und mal nicht,
 * und ein Waechter, dessen Ergebnis vom letzten Build abhaengt, ist keiner. */
const UEBERSPRINGEN = new Set(["node_modules", ".git", "owner-control", "dist", "assets"]);

const ENDUNGEN = new Set([
  ".html", ".css", ".js", ".mjs",
  ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico", ".bmp",
  ".mp4", ".webm", ".ogv", ".mp3", ".wav",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".json", ".xml", ".txt", ".csv", ".map",
]);

const schraeg = (p) => p.split(path.sep).join("/");

/*
 * Kommentare ausblenden — und zwar zeilentreu.
 *
 * Beim Gegentest dieses Waechters (siehe Kopf: "Waechter, den niemand
 * kaputtgemacht hat") blieb E1 gruen, obwohl `landing.js` die Abfrage nicht
 * mehr enthielt: der Treffer stand im ERKLAERKOMMENTAR darueber. Ein Waechter,
 * der seine eigene Beschreibung liest und daraus schliesst, dass die Sache
 * getan ist, ist die teuerste Form von gruen. Der Ersatz durch Leerzeichen
 * (statt Loeschen) haelt die Zeilennummern in den Fehlermeldungen ehrlich.
 */
const leeren = (m) => m.replace(/[^\n]/g, " ");
function ohneKommentare(text, art) {
  if (art === "html") return text.replace(/<!--[\s\S]*?-->/g, leeren);
  if (art === "css") return text.replace(/\/\*[\s\S]*?\*\//g, leeren);
  /* Erst Zeilen-, dann Blockkommentare — die Reihenfolge ist nicht egal.
     Ein Zeilenkommentar wie `// die Testdatei (api/test/*) …` enthaelt mit
     `/*` einen Blockanfang. Andersherum liest man den als echt, sucht das
     naechste Ende und leert dabei echten Code. Gemessen am 2026-08-25 an
     `test/pricingPage.test.js`: 15 Zeilen verschwanden, die Datei wurde
     dadurch falsch eingestuft. Der umgekehrte Fall (`//` in einem Block) ist
     harmlos, der Block wird ohnehin geleert. */
  return text
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + leeren(m.slice(p.length)))
    .replace(/\/\*[\s\S]*?\*\//g, leeren);
}
const artVon = (datei) =>
  datei.endsWith(".html") ? "html" : datei.endsWith(".css") ? "css" : "js";

function dateienUnter(rel, filter) {
  const wurzel = path.join(ROOT, rel);
  if (!fs.existsSync(wurzel)) return [];
  const gefunden = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (UEBERSPRINGEN.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (filter(e.name)) gefunden.push(p);
    }
  };
  lauf(wurzel);
  return gefunden;
}

/* ── Adressen aus einer Datei ziehen ──────────────────────────────────────
 * Bewusst textuell und nicht ueber einen DOM-Parser: der Waechter soll auch
 * dann noch etwas finden, wenn das Markup irgendwo kaputt ist. */

const ATTRIBUT = /\b(?:src|href|poster|data-img|data-src|content)\s*=\s*["']([^"']+)["']/gi;
const SRCSET = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
/* In JS nur eindeutige Asset-Literale — alles Weitere waere geraten. */
const JS_LITERAL = /["'`](\/(?:public|legal|img|fonts|media)\/[A-Za-z0-9._/-]+\.[A-Za-z0-9]{2,5})["'`]/g;

/* `<meta http-equiv="refresh" content="0;url=/public/x.html">` — die Adresse
 * steht hinter einem Praefix. Ohne dieses Abstreifen prueft der Waechter die
 * Zeichenkette "0;url=/public/x.html" und meldet neun Seiten falsch-rot. */
function entpackeWeiterleitung(wert) {
  const m = /^\s*\d+\s*;\s*url\s*=\s*(.+)$/i.exec(wert);
  return m ? m[1].trim() : wert;
}

function adressenAus(datei) {
  const art = artVon(datei);
  const text = ohneKommentare(fs.readFileSync(datei, "utf8"), art);
  const istCss = art === "css";
  const istJs = art === "js";
  const treffer = [];

  text.split(/\r?\n/).forEach((zeile, i) => {
    const sammle = (re, gruppe = 1) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(zeile)) !== null) treffer.push({ roh: m[gruppe], zeile: i + 1 });
    };

    if (istJs) {
      sammle(JS_LITERAL);
      return;
    }
    if (istCss) {
      sammle(CSS_URL);
      return;
    }
    sammle(ATTRIBUT);
    /* srcset traegt mehrere Adressen mit Groessenangabe: "a.webp 1x, b.webp 2x" */
    SRCSET.lastIndex = 0;
    let s;
    while ((s = SRCSET.exec(zeile)) !== null) {
      for (const teil of s[1].split(",")) {
        const erstes = teil.trim().split(/\s+/)[0];
        if (erstes) treffer.push({ roh: erstes, zeile: i + 1 });
      }
    }
    /* CSS in <style>-Bloecken und style="…" faellt sonst durch das Raster. */
    sammle(CSS_URL);
  });

  return treffer.map((t) => ({ ...t, roh: entpackeWeiterleitung(t.roh), datei }));
}

function istPruefbar(roh) {
  if (!roh) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(roh)) return false;  // http:, data:, mailto:, tel:, javascript:
  if (roh.startsWith("//")) return false;              // protokollrelativ
  if (roh.startsWith("#")) return false;
  if (/[{}$<>]/.test(roh)) return false;               // Template-Platzhalter
  const rein = roh.split("#")[0].split("?")[0];
  if (!rein) return false;
  if (rein.startsWith("/api/") || rein.startsWith("/uploads/")) return false;  // Backend
  return ENDUNGEN.has(path.extname(rein).toLowerCase());
}

/*
 * nginx hat NICHT EINEN Dateibaum, sondern mehrere.
 *
 * Der erste Entwurf loeste jede absolute Adresse gegen `frontend/` auf. Im
 * Worktree ging das gut — dort fehlen die Vite-Ausgaben. Im Haupt-Checkout
 * meldete der Waechter beim ersten Lauf `/staff/assets/index-Dvk2to9z.js` als
 * tot; die Datei liegt aber da und liefert HTTP 200. Grund:
 *
 *     location /staff/assets/ { root /usr/share/nginx/html/public; }
 *     location /legal/        { root /usr/share/nginx/html/public; }
 *
 * Fuer diese Praefixe steht die Wurzel eine Ebene tiefer. Ein Waechter, der das
 * nicht weiss, meldet vorhandene Dateien als fehlend — und ein Waechter, der
 * falsch Alarm schlaegt, wird abgeschaltet.
 *
 * Die Karte wird deshalb aus `nginx.conf` GELESEN, nicht abgeschrieben: eine
 * handgepflegte Liste ist die naechste Doku, die still veraltet.
 */
const NGINX_WURZEL = "/usr/share/nginx/html";  // docker-compose: ./frontend

function wurzelKarte(konfig) {
  const karte = [];
  /* Nur prefix-locations: regex-locations (`~`, `~*`) beschreiben keine
     eigenen Teilbaeume, sie fassen nur Endungen zusammen. */
  const re = /location\s+(\/[^\s{~*]*)\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(konfig)) !== null) {
    const wurzel = /\broot\s+([^\s;]+)\s*;/.exec(m[2]);
    if (!wurzel) continue;  // Proxy-Bloecke haben keine Wurzel
    if (!wurzel[1].startsWith(NGINX_WURZEL)) continue;
    karte.push({ praefix: m[1], unter: wurzel[1].slice(NGINX_WURZEL.length) });
  }
  /* Laengster Treffer gewinnt — genau wie bei nginx selbst. */
  karte.sort((a, b) => b.praefix.length - a.praefix.length);
  return karte;
}

function zuDatei(roh, quelle, karte) {
  const rein = roh.split("#")[0].split("?")[0];
  if (!rein.startsWith("/")) return path.resolve(path.dirname(quelle), rein);
  const treffer = karte.find((k) => rein.startsWith(k.praefix));
  return path.join(ROOT, "frontend", treffer ? treffer.unter : "", rein);
}

/* nginx beantwortet einige Adressen mit `return 30x`, ohne dass eine Datei
 * existiert (`/public/login.html` -> `/`). Diese Liste wird aus der Konfiguration
 * GELESEN und nicht von Hand gepflegt — eine handgepflegte Ausnahmeliste ist die
 * naechste Doku, die still veraltet. */
function umgeleiteteAdressen(konfig) {
  const menge = new Set();
  const re = /location\s*=\s*(\S+)\s*\{\s*return\s+30[12]\s+/g;
  let m;
  while ((m = re.exec(konfig)) !== null) menge.add(m[1]);
  return menge;
}

describe("Asset-Waechter — jede Adresse im Markup gegen den echten Bestand", () => {
  let html = [];
  let css = [];
  let js = [];
  let adressen = [];
  let nginxKonfig = "";
  let landing = "";
  let karte = [];

  before(() => {
    if (!ROOT) return;
    html = dateienUnter("frontend", (n) => n.endsWith(".html"));
    css = dateienUnter("frontend/public", (n) => n.endsWith(".css"));
    js = dateienUnter("frontend/public/js", (n) => n.endsWith(".js") || n.endsWith(".mjs"));
    adressen = [...html, ...css, ...js].flatMap(adressenAus).filter((a) => istPruefbar(a.roh));
    nginxKonfig = fs.readFileSync(path.join(ROOT, "nginx", "nginx.conf"), "utf8")
      .replace(/(^|\n)\s*#[^\n]*/g, "$1");
    /* Ohne Kommentare: der Erklaerblock ueber den Story-Sektionen spricht selbst
       ueber `data-img` — C3 wuerde sonst die Erklaerung fuer die Verdrahtung
       halten. Genau dieser Fehler ist beim Gegentest von E1 aufgetreten. */
    karte = wurzelKarte(nginxKonfig);
    landing = ohneKommentare(
      fs.readFileSync(path.join(ROOT, "frontend", "landing.html"), "utf8"), "html");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Grundlage — prueft der Waechter ueberhaupt etwas?
   * ═══════════════════════════════════════════════════════════════════════ */

  it("findet die Wurzel des Repos", () => {
    /* Kein stiller Skip. Laege der Baum woanders, pruefte dieser Waechter
       nichts und niemand wuesste es — genau der Zustand, gegen den er da ist. */
    assert.ok(ROOT, "Weder von process.cwd() noch von der Testdatei aus war eine " +
      "Wurzel mit frontend/landing.html, frontend/public/*.html und nginx/nginx.conf erreichbar.");
  });

  it("liest einen echten Bestand", { skip: !ROOT && "keine Wurzel" }, () => {
    assert.ok(html.length >= MIN_HTML, `nur ${html.length} HTML-Dateien (erwartet >= ${MIN_HTML})`);
    assert.ok(css.length >= MIN_CSS, `nur ${css.length} CSS-Dateien (erwartet >= ${MIN_CSS})`);
    assert.ok(js.length >= MIN_JS, `nur ${js.length} JS-Dateien (erwartet >= ${MIN_JS})`);
    assert.ok(adressen.length >= MIN_ADRESSEN,
      `nur ${adressen.length} pruefbare Adressen (erwartet >= ${MIN_ADRESSEN}) — ` +
      "entweder greift ein Filter zu scharf oder die Extraktion ist kaputt.");
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Richtung A — Adresse ohne Datei
   * ═══════════════════════════════════════════════════════════════════════ */

  it("A0: die Wurzel-Karte kommt aus nginx.conf und kennt die Ausnahmen",
    { skip: !ROOT && "keine Wurzel" }, () => {
      /*
       * nginx hat nicht EINEN Dateibaum. `/staff/assets/` und `/legal/` liegen
       * eine Ebene tiefer (`root …/html/public`). Der erste Entwurf loeste alles
       * gegen `frontend/` auf und meldete im Haupt-Checkout beim ersten Lauf
       * `/staff/assets/index-…js` als tot — die Datei liegt dort und liefert
       * HTTP 200. Ein Waechter, der vorhandene Dateien als fehlend meldet, wird
       * abgeschaltet; deshalb haengt diese Zusicherung hier.
       *
       * Im Worktree faellt das nicht auf, weil die Vite-Ausgaben fehlen. Also
       * wird nicht das ERGEBNIS geprueft, sondern die AUFLOESUNG.
       */
      const unter = (adresse) =>
        schraeg(path.relative(path.join(ROOT, "frontend"), zuDatei(adresse, "", karte)));

      assert.equal(unter("/staff/assets/index-abc.js"), "public/staff/assets/index-abc.js",
        "`/staff/assets/` wird gegen die falsche Wurzel aufgeloest");
      assert.equal(unter("/legal/agb.html"), "public/legal/agb.html",
        "`/legal/` wird gegen die falsche Wurzel aufgeloest");
      assert.equal(unter("/public/enterprise.html"), "public/enterprise.html",
        "der Normalfall darf sich dadurch nicht verschieben");
      assert.equal(unter("/landing.html"), "landing.html");

      assert.ok(karte.some((k) => k.praefix === "/"),
        "die Standard-Wurzel `location /` fehlt in der Karte — dann faellt jede " +
        "Adresse ohne eigenes Praefix durch");
    });

  it("A1: jede Adresse mit Dateiendung zeigt auf eine vorhandene Datei",
    { skip: !ROOT && "keine Wurzel" }, () => {
      const umgeleitet = umgeleiteteAdressen(nginxKonfig);
      const tot = adressen
        .filter((a) => !umgeleitet.has(a.roh.split("#")[0].split("?")[0]))
        .filter((a) => !fs.existsSync(zuDatei(a.roh, a.datei, karte)))
        .map((a) => `${a.roh}\n      referenziert in ${schraeg(path.relative(ROOT, a.datei))}:${a.zeile}`);

      assert.deepEqual([...new Set(tot)], [],
        "Diese Adressen stehen im Markup, aber die Datei dazu gibt es nicht.\n" +
        "Der Server verraet das nicht von selbst: ausserhalb von /public/*.{html,js,css}\n" +
        "beantwortet der Catch-All in nginx.conf tote Adressen mit der Startseite (HTTP 200).\n" +
        "Entweder die Datei liefern — oder die Adresse aus dem Markup nehmen.\n" +
        "Ein Drittes gibt es nicht: eine Adresse ohne Datei ist ein Versprechen, das der\n" +
        "Server bricht, ohne dass es jemand mitbekommt.\n");
    });

  /* ═══════════════════════════════════════════════════════════════════════
   * Richtung B — Datei ohne Adresse
   * ═══════════════════════════════════════════════════════════════════════ */

  it("B1: keine Bilddatei liegt im Repo, ohne je ausgeliefert zu werden",
    { skip: !ROOT && "keine Wurzel" }, () => {
      const bilder = dateienUnter("frontend/public/img", () => true);
      if (bilder.length === 0) return;  // Stand 2026-08-22: es gibt das Verzeichnis noch nicht.

      const quelltext = [...html, ...css, ...js]
        .map((f) => fs.readFileSync(f, "utf8")).join("\n");

      const verwaist = bilder
        .map((b) => "/" + schraeg(path.relative(path.join(ROOT, "frontend"), b)))
        .filter((adresse) => !quelltext.includes(adresse));

      assert.deepEqual(verwaist, [],
        "Diese Dateien liegen im Repo, aber keine Seite verweist auf sie.\n" +
        "Entweder fehlt die Verdrahtung — dann ist das Bild bezahlt und unsichtbar —\n" +
        "oder die Datei ist ein Ueberbleibsel und gehoert geloescht.\n");
    });

  /* ═══════════════════════════════════════════════════════════════════════
   * Schicht C — die Landing-Bildwelt (P7c), exakt gegen ihr Register
   * ═══════════════════════════════════════════════════════════════════════ */

  describe("C: Landing-Bildwelt gegen docs/mockups/LANDING_KI_BILD_PROMPTS.md", () => {
    const REGISTER = "docs/mockups/LANDING_KI_BILD_PROMPTS.md";
    let motive = [];

    before(() => {
      if (!ROOT) return;
      const pfad = path.join(ROOT, REGISTER);
      if (!fs.existsSync(pfad)) return;
      const text = fs.readFileSync(pfad, "utf8");
      /* Das Register nennt zu jedem Motiv Sektion und Zieldatei. Der Waechter
         liest beides, statt eine zweite Liste im Test zu pflegen. */
      const re = /\*\*Sektion:\*\*\s*`(#[a-z0-9-]+)`[\s\S]*?\*\*Zieldatei:\*\*\s*`(frontend\/public\/img\/landing\/[^`]+)`/g;
      let m;
      while ((m = re.exec(text)) !== null) motive.push({ sektion: m[1], zieldatei: m[2] });
    });

    it("C1: das Register nennt die vier Motive mit Sektion und Zieldatei",
      { skip: !ROOT && "keine Wurzel" }, () => {
        assert.ok(motive.length >= 4,
          `nur ${motive.length} Motive in ${REGISTER} gefunden (erwartet >= 4) — ` +
          "entweder wurde das Register umgebaut oder die Zuordnung ist verloren gegangen. " +
          "Ohne sie kann niemand mehr sagen, welches Bild in welche Sektion gehoert.");
      });

    it("C2: jede Sektion aus dem Register existiert in der Landing",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const fehlend = motive
          .filter((mo) => !landing.includes(`id="${mo.sektion.slice(1)}"`))
          .map((mo) => `${mo.sektion} (Register: ${mo.zieldatei})`);
        assert.deepEqual(fehlend, [],
          `Diese Sektionen nennt ${REGISTER}, aber frontend/landing.html hat sie nicht.\n` +
          "Das Register beschreibt damit eine Seite, die es so nicht mehr gibt.\n");
      });

    it("C3: `data-img` steht genau dann in der Landing, wenn die Bilddatei existiert",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const fehler = [];
        for (const mo of motive) {
          const adresse = "/" + mo.zieldatei.replace(/^frontend\//, "");
          const dateiDa = fs.existsSync(path.join(ROOT, mo.zieldatei));
          const verdrahtet = landing.includes(`data-img="${adresse}"`);

          if (dateiDa && !verdrahtet) {
            fehler.push(
              `${mo.zieldatei}\n      Die Datei liegt da, wird aber nicht ausgeliefert.\n` +
              `      In frontend/landing.html an <figure> von ${mo.sektion} ergaenzen:\n` +
              `          data-img="${adresse}"`);
          }
          if (!dateiDa && verdrahtet) {
            fehler.push(
              `${mo.zieldatei}\n      Die Landing verweist darauf, aber die Datei fehlt.\n` +
              `      Jeder Seitenaufruf kostet dadurch eine echte Anfrage, die der Server\n` +
              `      mit der Startseite beantwortet (71 KB, HTTP 200). Entweder das Bild\n` +
              `      liefern — oder data-img="${adresse}" wieder entfernen.`);
          }
        }
        assert.deepEqual(fehler, [],
          "Bildbestand und Landing-Markup stimmen nicht ueberein.\n" +
          "Das ist die Richtung, die man vergisst: das Bild ist da, und niemand sieht es.\n");
      });
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Schicht D — der Server darf fehlende Assets nicht verstecken
   * ═══════════════════════════════════════════════════════════════════════ */

  describe("D: nginx antwortet auf fehlende Assets mit 404, nicht mit der Startseite", () => {
    it("D1: Assets unter /public/ enden im `=404`, nicht im Catch-All",
      { skip: !ROOT && "keine Wurzel" }, () => {
        /* `\bpng\b` in der Endungsliste ist die Unterscheidung, nicht Schmuck:
           unter /public/ gibt es bereits einen `~*`-Block mit `=404` fuer JS und
           CSS. Ohne dieses Merkmal hat der Gegentest genau ihn gefunden und D1
           gruen gemeldet, obwohl der Medien-Block geloescht war. */
        const block = /location\s+~\*\s+\^\/public\/[^{\n]*\bpng\b[^{\n]*\{[^}]*try_files\s+\$uri\s*=404\s*;[^}]*\}/.exec(nginxKonfig);
        assert.ok(block,
          "In nginx/nginx.conf fehlt der location-Block, der fehlende Assets unter /public/\n" +
          "mit 404 beantwortet. Ohne ihn faengt `try_files $uri $uri/ /landing.html` jede\n" +
          "tote Bild-/Medien-/Schrift-Adresse ab und liefert HTTP 200 mit der kompletten\n" +
          "Startseite — ein Soft-404, den kein Monitoring sieht.");
      });

    it("D2: der Asset-Block ist auf /public/ verankert (sonst kapert er die Proxys)",
      { skip: !ROOT && "keine Wurzel" }, () => {
        /* Eine regex-location ohne Pfad-Anker schlaegt in nginx JEDE prefix-location
           ausser `=` und `^~`. Ein `location ~* \.(png|json)$` wuerde damit
           /uploads/*.png aus dem API-Proxy und die immutable-Bundles unter
           /staff/assets/ und /owner-control/assets/ mitsamt Cache-Headern
           uebernehmen. Der Anker ist deshalb kein Stil, sondern die Bedingung. */
        const ohneAnker = /location\s+~\*?\s+(?!\^\/public\/)[^{\n]*\\\.\((?:[a-z0-9|?]*\|)*png/i.test(nginxKonfig);
        assert.equal(ohneAnker, false,
          "Es gibt eine regex-location fuer Bild-Endungen ohne `^/public/`-Anker.\n" +
          "Regex schlaegt Prefix: sie uebernimmt /uploads/ aus dem API-Proxy und die\n" +
          "gehashten Bundles unter /staff/assets/ bzw. /owner-control/assets/.");
      });

    it("D3: /favicon.ico wird nicht mit der Startseite beantwortet",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const block = /location\s*=\s*\/favicon\.ico\s*\{[^}]*try_files\s+\$uri\s*=404\s*;[^}]*\}/.exec(nginxKonfig);
        assert.ok(block,
          "Browser fordern /favicon.ico ungefragt an — auf jeder Seite, bei jedem\n" +
          "Erstbesuch. Ohne eigenen Block beantwortet der Catch-All jeden dieser\n" +
          "Aufrufe mit der vollstaendigen Startseite (gemessen 2026-08-22: 71016 Bytes).");
      });

    it("D4: der Catch-All fuer NAVIGATION bleibt erhalten",
      { skip: !ROOT && "keine Wurzel" }, () => {
        /* Die Gegenprobe zu D1: wer den Soft-404 abstellt, darf dabei nicht den
           Deep-Link-Fallback mitnehmen — sonst sind alle Routen ohne Datei tot. */
        assert.match(nginxKonfig, /location\s+\/\s*\{[^}]*try_files\s+\$uri\s+\$uri\/\s+\/landing\.html\s*;/,
          "Der Catch-All `try_files $uri $uri/ /landing.html` fehlt. Er ist der " +
          "Deep-Link-Fallback fuer Navigationsrouten und muss bleiben.");
      });
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Schicht E — das Drop-in-Werkzeug muss es noch geben
   * ═══════════════════════════════════════════════════════════════════════ */

  describe("E: das Einbau-Werkzeug fuer die Landing-Bilder ist noch vorhanden", () => {
    /* Schicht C verspricht, dass das Einbauen eines Bildes eine Zeile ist.
       Dieses Versprechen haelt nur, solange die Mechanik dahinter existiert.
       Verschwindet sie unbemerkt, waere die Fehlermeldung aus C3 eine Luege. */

    it("E1: landing.js wertet `data-img` weiterhin aus",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const p = path.join(ROOT, "frontend/public/js/pages/landing.js");
        assert.ok(fs.existsSync(p), "frontend/public/js/pages/landing.js fehlt");
        /* Ohne Kommentare UND auf den Aufruf statt auf die Zeichenkette geprueft:
           der Erklaerblock ueber der Funktion nennt `figure.story__visual[data-img]`
           woertlich. Beim Gegentest hat dieser Test deshalb gruen gemeldet,
           nachdem die echte Abfrage aus dem Code entfernt worden war. */
        const src = ohneKommentare(fs.readFileSync(p, "utf8"), "js");
        assert.match(src, /querySelectorAll\(\s*['"`]\.story__visual\[data-img\]['"`]\s*\)/,
          "landing.js fragt keine `.story__visual[data-img]` mehr ab. Ohne diese Abfrage " +
          "bleibt ein spaeter ergaenztes data-img wirkungslos — und C3 wuerde gruen " +
          "melden, dass ein Bild ausgeliefert wird, das niemand sieht.");
        assert.match(src, /classList\.add\(\s*['"`]has-img['"`]\s*\)/,
          "landing.js setzt die Klasse `has-img` nicht mehr — dann bleibt die " +
          "SVG-Illustration neben dem Bild stehen.");
      });

    it("E2: landing.css blendet die SVG aus, sobald ein Bild da ist",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const p = path.join(ROOT, "frontend/public/css/pages/landing.css");
        assert.ok(fs.existsSync(p), "frontend/public/css/pages/landing.css fehlt");
        const src = ohneKommentare(fs.readFileSync(p, "utf8"), "css");
        assert.match(src, /\.story__visual\.has-img\s+svg\s*\{[^}]*display:\s*none/,
          "Ohne `.story__visual.has-img svg { display: none }` stuenden KI-Bild und " +
          "SVG-Illustration uebereinander.");
      });

    it("E3: die vier Story-Visuals tragen ihre Spezifikation (Motiv + Alt-Text)",
      { skip: !ROOT && "keine Wurzel" }, () => {
        const motive = landing.match(/<figure class="story__visual"[^>]*data-motif=/g) || [];
        const alts = landing.match(/<figure class="story__visual"[\s\S]{0,400}?data-alt="/g) || [];
        assert.equal(motive.length, 4,
          `${motive.length} statt 4 <figure class="story__visual"> mit data-motif. ` +
          "data-motif ist der Anker, ueber den das Register die Sektion zuordnet.");
        assert.equal(alts.length, 4,
          `${alts.length} statt 4 Story-Visuals mit data-alt. Der Alt-Text ist die ` +
          "zweite Haelfte der Spezifikation und wird beim Einbau gebraucht — geht er " +
          "verloren, wird das Bild ohne Alternativtext eingebaut (Barrierefreiheit).");
      });
  });
});
