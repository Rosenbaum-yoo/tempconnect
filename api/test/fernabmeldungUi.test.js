/**
 * Fernabmeldung (P5.1-Rest) — Verdrahtungs-Nachweis der Oberflaeche.
 *
 * Das Backend existiert seit P5.1 (GET /auth/sessions, POST /auth/logout-all).
 * Dieser Test beweist, dass BEIDE Oberflaechen (Konto-Seite sla_profil +
 * Einsatzportal-Profil) die echten Endpunkte aufrufen, die Handler wirklich
 * gebunden sind und der "Andere Geraete"-Knopf ohne weitere Geraete
 * deaktiviert wird — kein toter Button, keine Deko (CLAUDE.md End-to-End-Pflicht).
 *
 * Run: node --test --test-force-exit test/fernabmeldungUi.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKER_REL = "frontend/public/sla_profil.html";
const ROOT_CWD = process.cwd();
const ROOT_LOCAL = path.resolve(__dirname, "..", "..");
const ROOT = fs.existsSync(path.join(ROOT_CWD, MARKER_REL)) ? ROOT_CWD : ROOT_LOCAL;
const AVAILABLE = fs.existsSync(path.join(ROOT, MARKER_REL));
const suite = AVAILABLE ? describe : describe.skip;

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

suite("Fernabmeldung — Konto-Seite (sla_profil)", () => {
  it("Karte vorhanden: Sitzungs-Anzeige + beide Aktions-Knoepfe gebunden", () => {
    const html = read("frontend/public/sla_profil.html");
    assert.match(html, /id="sec-security"/);
    assert.match(html, /id="security-sessions"/);
    assert.match(html, /id="btn-logout-others"[^>]*onclick="EP\.logoutOtherDevices\(\)"/);
    assert.match(html, /onclick="EP\.logoutEverywhere\(\)"/);
  });

  it("JS ruft die echten P5.1-Endpunkte und exportiert die Handler", () => {
    const js = read("frontend/public/js/pages/slaProfil.js");
    assert.match(js, /api\("\/api\/auth\/sessions"\)/);
    assert.match(js, /api\("\/api\/auth\/logout-all",\{method:"POST",body:\{\}\}\)/);
    assert.match(js, /body:\{include_current:true\}/);
    assert.match(js, /btn\.disabled = weitere===0/, "Knopf ohne weitere Geraete deaktiviert");
    assert.match(js, /logoutOtherDevices:logoutOtherDevices,logoutEverywhere:logoutEverywhere/, "Handler im EP-Export");
    assert.match(js, /loadSessions\(\);/, "Sitzungslage wird beim Seitenstart geladen");
  });
});

suite("Fernabmeldung — Einsatzportal-Profil", () => {
  it("Sicherheits-Karte erweitert: Anzeige + Knoepfe + Init-Aufruf", () => {
    const html = read("frontend/public/einsatzportal-profil.html");
    assert.match(html, /id="sessionInfo"/);
    assert.match(html, /id="btnLogoutOthers"[^>]*onclick="logoutOtherDevices\(\)"/);
    assert.match(html, /onclick="logoutEverywhere\(\)"/);
    assert.match(html, /PortalApi\.get\('\/auth\/sessions'\)/);
    assert.match(html, /PortalApi\.post\('\/auth\/logout-all', \{\}\)/);
    assert.match(html, /PortalApi\.post\('\/auth\/logout-all', \{ include_current: true \}\)/);
    assert.match(html, /loadSessions\(\)\.catch/, "Init laedt die Sitzungslage");
    assert.match(html, /btn\.disabled = weitere === 0/);
    // Nach Komplett-Abmeldung zurueck zur Worker-Login-Seite
    assert.match(html, /include_current: true \}\);\s*\n\s*window\.location\.href = 'worker-login\.html'/);
    // Portal-Button-Konvention (ein Bindestrich) — ep-btn--primary existiert dort nicht
    assert.doesNotMatch(html, /ep-btn--primary/);
  });
});
