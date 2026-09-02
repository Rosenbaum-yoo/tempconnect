/**
 * Seiten an der Wurzel duerfen nicht relativ verweisen (M1.4).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND, GEMESSEN AM LAUFENDEN STAPEL (2026-09-02)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `worker-login.html` ist die Seite, auf der ein eingeladener Mitarbeiter
 * landet. Sie liegt unter `frontend/public/`, wird aber ueber einen
 * nginx-Alias an der WURZEL ausgeliefert, damit der Link in der
 * Einladungsmail huebsch ist:
 *
 *     location = /worker-login.html { try_files /public/worker-login.html; }
 *
 * Ihre Verweise sind relativ. An der Wurzel loesen die aber nicht nach
 * `/public/…` auf, sondern nach `/…` — und dort greift der Catch-all:
 *
 *     GET /worker-login.html            200  text/html  22034 B   (richtig)
 *     GET /worker.css                   200  text/html  71681 B   LANDESEITE
 *     GET /einsatzportal-dashboard.html 200  text/html  71681 B   LANDESEITE
 *
 * Beide liefern `<title>TempConnect – Personal in Stunden…</title>`, also die
 * Marketing-Landeseite. **Kein 404.** Ein 404 waere sichtbar; ein 200 mit der
 * falschen Seite ist es nicht. Das Ergebnis: das Stylesheet wird vom Browser
 * als MIME-Fehler verworfen (die Seite erscheint ungestaltet), und wer sein
 * Passwort gesetzt hat, landet auf der Verkaufsseite statt im Portal.
 *
 * Der Rest der Anwendung macht es richtig — `pageShell.js` und
 * `worker-portal.html` verweisen an vier Stellen absolut auf
 * `/public/einsatzportal-dashboard.html`. Genau diese eine Seite fiel heraus,
 * weil sie als einzige nicht unter `/public/` ausgeliefert wird.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS DER WAECHTER TUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Er liest die nginx-Konfiguration, findet JEDE Seite, die an der Wurzel
 * ausgeliefert wird, und verlangt von ihr absolute Verweise. Damit waechst er
 * mit: kommt morgen ein zweiter Alias dazu, ist die neue Seite sofort bewacht.
 *
 * Run: node --test --test-force-exit test/wurzelSeiten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NGINX_REL = path.join("nginx", "nginx.conf");

function findeRepoRoot() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      try {
        if (fs.statSync(path.join(dir, NGINX_REL)).size > 500) return dir;
      } catch { /* weiter aufwaerts */ }
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const REPO_ROOT = findeRepoRoot();
const suite = REPO_ROOT ? describe : describe.skip;

/**
 * Jede Seite, die an der WURZEL liegt und aus `/public/` bedient wird.
 *
 * Gelesen wird die Konfiguration, nicht eine Liste: eine Liste waere in vier
 * Wochen falsch, und der naechste Alias brächte denselben Fehler zurueck.
 */
export function wurzelSeiten(conf) {
  const ohneKommentar = conf.replace(/^\s*#.*$/gm, "");
  const raus = [];
  const muster = /location\s*=\s*(\/[A-Za-z0-9._-]+)\s*\{([^}]*)\}/g;
  for (const m of ohneKommentar.matchAll(muster)) {
    const url = m[1];
    const koerper = m[2];
    const tf = koerper.match(/try_files\s+(\/public\/[A-Za-z0-9._/-]+)/);
    if (tf) raus.push({ url, datei: tf[1].replace(/^\//, "") });
  }
  return raus;
}

/** Relative Verweise einer Seite — href/src ohne fuehrenden /, # oder Schema. */
export function relativeVerweise(html) {
  const ohneKommentar = html.replace(/<!--[\s\S]*?-->/g, "");
  const raus = [];
  for (const m of ohneKommentar.matchAll(/\b(href|src)\s*=\s*"([^"]+)"/g)) {
    const wert = m[2].trim();
    if (!wert) continue;
    if (/^([a-z]+:|\/\/|\/|#|data:|mailto:|tel:)/i.test(wert)) continue;
    raus.push({ attribut: m[1], ziel: wert });
  }
  /* Sprungziele im Skript zaehlen genauso — sie sind der eigentliche Fund. */
  for (const m of ohneKommentar.matchAll(/location\s*\.\s*(href|replace|assign)\s*(?:=|\()\s*['"]([^'"]+)['"]/g)) {
    const ziel = m[2].trim();
    if (/^([a-z]+:|\/\/|\/|#)/i.test(ziel)) continue;
    raus.push({ attribut: `location.${m[1]}`, ziel });
  }
  return raus;
}

suite("M1.4 · Seiten an der Wurzel verweisen absolut", () => {
  const conf = () => fs.readFileSync(path.join(REPO_ROOT, NGINX_REL), "utf8");

  it("die Konfiguration nennt mindestens eine Wurzel-Seite (Selbstprobe)", () => {
    const seiten = wurzelSeiten(conf());
    assert.ok(seiten.length >= 1,
      "keine Wurzel-Seite gefunden — das Muster liest an der Konfiguration vorbei");
    assert.ok(seiten.some((s) => s.url === "/worker-login.html"),
      "der bekannte Alias fehlt — Muster defekt");
  });

  it("jede Wurzel-Seite existiert wirklich", () => {
    for (const { url, datei } of wurzelSeiten(conf())) {
      const p = path.join(REPO_ROOT, "frontend", datei);
      assert.ok(fs.existsSync(p), `${url} zeigt auf ${datei} — die Datei gibt es nicht`);
    }
  });

  it("KEINE relativen Verweise — sonst faellt die Adresse in den Catch-all", () => {
    const befunde = [];
    for (const { url, datei } of wurzelSeiten(conf())) {
      const html = fs.readFileSync(path.join(REPO_ROOT, "frontend", datei), "utf8");
      for (const v of relativeVerweise(html)) {
        befunde.push(`  ${url}: ${v.attribut}="${v.ziel}" wird zu /${v.ziel} und liefert die Landeseite`);
      }
    }
    assert.equal(befunde.length, 0,
      `${befunde.length} relative(r) Verweis(e) auf einer Wurzel-Seite:\n${befunde.join("\n")}`);
  });

  it("erkennt einen relativen Verweis, wenn es einen gibt (Gegenprobe)", () => {
    const html = [
      '<link rel="stylesheet" href="worker.css">',
      '<link rel="stylesheet" href="/public/gut.css">',
      '<a href="#anker">Sprung</a>',
      '<a href="https://example.de">Extern</a>',
      "<script>location.href = 'einsatzportal-dashboard.html';</script>",
      "<script>location.href = '/public/gut.html';</script>"
    ].join("\n");
    const r = relativeVerweise(html);
    assert.deepEqual(r.map((x) => x.ziel), ["worker.css", "einsatzportal-dashboard.html"]);
  });

  it("liest die Konfiguration, nicht ihre Kommentare (Gegenprobe)", () => {
    const conf = [
      "# location = /erfunden.html { try_files /public/erfunden.html =404; }",
      "location = /echt.html {",
      "    root /usr/share/nginx/html;",
      "    try_files /public/echt.html =404;",
      "}"
    ].join("\n");
    assert.deepEqual(wurzelSeiten(conf), [{ url: "/echt.html", datei: "public/echt.html" }]);
  });
});
