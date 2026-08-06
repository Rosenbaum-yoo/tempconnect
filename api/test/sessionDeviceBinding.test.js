/**
 * "Angemeldet bleiben" — Bindung der Sitzung an das Browserfenster.
 *
 * Owner-Frage 2026-08-06: "soll man beim Schliessen des Fensters ausgeloggt
 * werden? soll man mehrere Tabs offen haben koennen?"
 *
 * Die Antwort ist nicht global, sondern situativ. Ein Disponent darf nicht
 * mitten in der Arbeit hinausfliegen, wenn er versehentlich ein Fenster
 * schliesst. Eine Einsatzkraft am geteilten Lagerbuero-PC dagegen darf ihre
 * Sitzung dort NICHT acht Stunden offen lassen — der Naechste saehe fremde
 * Stundenzettel. Deshalb entscheidet der Anmeldende.
 *
 * Die Regel, die diese Suite haelt: die Wahl darf die serverseitigen Fristen
 * nur VERKUERZEN, nie verlaengern. Sonst waere "angemeldet bleiben" ein Weg,
 * die Sicherheitsentscheidung von 2026-08-01 auszuhebeln.
 *
 * Run: node --test --test-force-exit test/sessionDeviceBinding.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindSessionToDevice, stampSession, IDLE_TIMEOUT_MS, ABSOLUTE_LIFETIME_MS
} from "../services/sessionSecurityService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");

const neueSession = () => ({ cookie: { maxAge: IDLE_TIMEOUT_MS } });

describe("bindSessionToDevice", () => {
  it("mit 'angemeldet bleiben': normale Leerlauf-Frist, Cookie ueberlebt das Fenster", () => {
    const s = neueSession();
    bindSessionToDevice(s, true);
    assert.equal(s.cookie.maxAge, IDLE_TIMEOUT_MS);
    assert.equal(s.persistent, true);
  });

  it("ohne 'angemeldet bleiben': Cookie stirbt mit dem Fenster", () => {
    const s = neueSession();
    bindSessionToDevice(s, false);
    assert.equal(s.cookie.maxAge, null, "ohne maxAge laesst express-session `expires` weg");
    assert.equal(s.cookie.expires, null);
    assert.equal(s.persistent, false);
  });

  it("die Wahl kann Fristen nur verkuerzen, nie verlaengern", () => {
    const s = neueSession();
    bindSessionToDevice(s, true);
    assert.ok(s.cookie.maxAge <= IDLE_TIMEOUT_MS,
      "auch 'merken' darf die Leerlauf-Frist nicht ueberschreiten");
    assert.ok(IDLE_TIMEOUT_MS < ABSOLUTE_LIFETIME_MS,
      "das Hoechstalter bleibt die aeussere Grenze");
  });

  it("stoerungsfrei bei fehlender Sitzung — kein Absturz im Login-Pfad", () => {
    assert.doesNotThrow(() => bindSessionToDevice(null, true));
    assert.doesNotThrow(() => bindSessionToDevice({}, false));
  });

  it("das Hoechstalter bleibt unabhaengig von der Wahl bestehen", () => {
    const s = neueSession();
    stampSession(s);
    bindSessionToDevice(s, false);
    assert.ok(typeof s.createdAt === "number",
      "ohne createdAt greift enforceAbsoluteLifetime nicht mehr");
  });
});

describe("Verdrahtung im Login", () => {
  const auth = fs.readFileSync(path.join(API_ROOT, "routes/auth.js"), "utf8");

  it("ohne Angabe bleibt es beim Bestandsverhalten — kein ueberraschendes Abmelden", () => {
    assert.match(auth, /remember_me: z\.boolean\(\)\.optional\(\)\.default\(true\)/);
  });

  it("die Bindung passiert NACH regenerate, sonst wird sie verworfen", () => {
    const login = auth.match(/router\.post\("\/auth\/login"[\s\S]*?bindSessionToDevice/);
    assert.ok(login, "bindSessionToDevice fehlt im Login-Pfad");
    const vorher = login[0];
    assert.ok(vorher.indexOf("regenerate") < vorher.lastIndexOf("bindSessionToDevice"),
      "die Bindung muss nach der Session-Rotation stehen");
    assert.ok(vorher.indexOf("stampSession") < vorher.lastIndexOf("bindSessionToDevice"),
      "der Hoechstalter-Stempel darf nicht verloren gehen");
  });

  it("das Worker-Portal fragt sichtbar — dort sind geteilte Rechner die Regel", () => {
    const html = fs.readFileSync(
      path.resolve(API_ROOT, "..", "frontend/public/worker-login.html"), "utf8"
    );
    assert.match(html, /id="loginRemember"/);
    assert.match(html, /remember_me: document\.getElementById\("loginRemember"\)\.checked/);
    // Bewusst NICHT vorangekreuzt: wer gemerkt werden will, sagt es aktiv.
    const box = html.match(/<input type="checkbox" id="loginRemember"[^>]*>/);
    assert.ok(box, "Auswahlfeld nicht gefunden");
    assert.doesNotMatch(box[0], /\bchecked\b/,
      "am geteilten Rechner darf 'merken' nicht die Voreinstellung sein");
  });
});
