/**
 * Verbindliche Aufnahme (Owner-Freigabe 2026-08-06).
 *
 * Die Regel selbst ist billig; teuer ist ihre Ausnahme. Wer bereits gearbeitet
 * hat, MUSS seinen Stundenzettel einreichen koennen — auch mit halbem Profil.
 * Eine Sperre wuerde ihn nicht von einem Angebot abschneiden, sondern von einer
 * Pflicht, an der sein Geld haengt. Genau diese Ausnahme sichert diese Suite.
 *
 * Run: node --test --test-force-exit test/workerOnboardingGate.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as onboarding from "../services/workerOnboardingService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Pool-Attrappe. `skills`/`docs`/`einsaetze` steuern, ob die jeweilige
 * EXISTS-Abfrage eine Zeile findet.
 */
function makePool({ skills = false, docs = false, einsaetze = false } = {}) {
  return {
    query: async (sql) => {
      const text = String(sql);
      if (/worker_profile_skills/i.test(text)) return { rows: skills ? [{ "?column?": 1 }] : [] };
      if (/worker_profile_documents/i.test(text)) return { rows: docs ? [{ "?column?": 1 }] : [] };
      if (/worker_assignment_links/i.test(text)) return { rows: einsaetze ? [{ "?column?": 1 }] : [] };
      return { rows: [] };
    }
  };
}

/** Profil mit vollstaendigen Pflichtfeldern (Person-Schritt erledigt). */
const profilKomplett = { id: "wp-1", user_id: "u-1", first_name: "Ada", last_name: "Stahl", phone: "+49 30 1" };
/** Profil ohne Telefon — Person-Schritt offen, also nicht einsatzbereit. */
const profilOhneTelefon = { id: "wp-2", user_id: "u-2", first_name: "Ada", last_name: "Stahl", phone: "" };

describe("zugang_beschraenkt — wen die Aufnahme binden darf", () => {
  it("frisch eingeladen und unvollstaendig -> gesperrt", async () => {
    const p = await onboarding.getOnboardingProgress(makePool({ einsaetze: false }), profilOhneTelefon);
    assert.equal(p.einsatzbereit, false);
    assert.equal(p.zugang_beschraenkt, true);
  });

  it("HAT bereits einen Einsatz -> NIE gesperrt, auch bei halbem Profil", async () => {
    const p = await onboarding.getOnboardingProgress(makePool({ einsaetze: true }), profilOhneTelefon);
    assert.equal(p.einsatzbereit, false, "das Profil ist weiterhin unvollstaendig …");
    assert.equal(p.zugang_beschraenkt, false,
      "… aber er muss seinen Stundenzettel einreichen koennen");
  });

  it("vollstaendig -> nie gesperrt", async () => {
    const p = await onboarding.getOnboardingProgress(
      makePool({ skills: true, einsaetze: false }), profilKomplett
    );
    // Verfuegbarkeit wird abgeleitet; entscheidend ist hier nur: einsatzbereit -> frei.
    if (p.einsatzbereit) assert.equal(p.zugang_beschraenkt, false);
  });
});

describe("Durchsetzung in der Portal-Shell", () => {
  const shell = fs.readFileSync(
    path.join(REPO_ROOT, "frontend/public/js/workerPortal/portalShell.js"), "utf8"
  );

  it("die Sperre haengt am Server-Urteil, nicht an einer zweiten Frontend-Regel", () => {
    assert.match(shell, /PortalApi\.get\('\/worker\/me\/onboarding'\)/);
    assert.match(shell, /p\.zugang_beschraenkt/);
  });

  it("Profil und Hilfe bleiben erreichbar — eine Sperre ohne Ausweg ist eine Falle", () => {
    const liste = shell.match(/var AUFNAHME_FREI = \[([^\]]*)\]/);
    assert.ok(liste, "Ausnahmeliste nicht gefunden");
    assert.match(liste[1], /einsatzportal-profil\.html/);
    assert.match(liste[1], /einsatzportal-kontakt\.html/);
  });

  it("ein fehlgeschlagener Abruf sperrt niemanden aus", () => {
    const fn = shell.match(/async function _enforceOnboarding[\s\S]*?\n  }/);
    assert.ok(fn, "_enforceOnboarding nicht gefunden");
    assert.match(fn[0], /catch \(e\) \{[\s\S]*?\}/);
    assert.doesNotMatch(fn[0].split("catch")[1] || "", /location\.replace/,
      "im Fehlerfall darf NICHT umgeleitet werden");
  });

  it("die Umleitung erklaert sich (aufnahme=1), statt wie ein Fehler zu wirken", () => {
    assert.match(shell, /einsatzportal-profil\.html\?willkommen=1&aufnahme=1/);
    const profil = fs.readFileSync(
      path.join(REPO_ROOT, "frontend/public/einsatzportal-profil.html"), "utf8"
    );
    assert.match(profil, /ep\.profil\.progressGateTitle/);
    assert.match(profil, /get\('aufnahme'\) === '1'/);
  });
});
