/**
 * P10 Spur D / Welle D5 — die Oberflaeche kommt ohne Konto zurecht.
 *
 * DIE FALLE
 * Die Mitarbeiterliste sprach jeden Menschen ueber seine KONTO-ID an:
 *
 *     onclick="openEdit('" + w.user_id + "')"
 *
 * Ohne Konto ist `w.user_id` leer, und daraus entsteht woertlich
 * `openEdit('null')` — ein Klick, der eine Anfrage auf /workers/null ausloest.
 * Kein Absturz, keine Meldung, nur ein Knopf, der nichts tut.
 *
 * ZWEITE FALLE
 * Der Einladen-Knopf erschien nur bei `w.is_verified === false` (strikter
 * Vergleich). Ohne Konto ist `is_verified` undefined — der Knopf fehlte
 * ausgerechnet dort, wo er gebraucht wird.
 *
 * Die Zeilen werden hier wirklich gebaut, nicht im Quelltext gesucht.
 *
 * Run: node --test --test-force-exit test/mitarbeiterOhneKonto.browser.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEITE_REL = "frontend/public/js/pages/mitarbeiter.js";
const SEITE = [process.cwd(), path.resolve(__dirname, "..", "..")]
  .map((w) => path.join(w, SEITE_REL))
  .find((p) => fs.existsSync(p));

const vorhanden = Boolean(SEITE);
const quelle = vorhanden ? fs.readFileSync(SEITE, "utf8") : "";

function ausschnitt(kopf) {
  const start = quelle.indexOf(kopf);
  assert.ok(start >= 0, `${kopf} nicht gefunden`);
  let tiefe = 0, i = quelle.indexOf("{", start);
  const auf = i;
  for (; i < quelle.length; i++) {
    if (quelle[i] === "{") tiefe++;
    else if (quelle[i] === "}" && --tiefe === 0) break;
  }
  assert.ok(i > auf, `${kopf} nicht abgrenzbar`);
  return quelle.slice(start, i + 1);
}

/** Ein Mitarbeiter, wie ihn der Erstimport hinterlaesst: erfasst, ohne Konto. */
const OHNE_KONTO = {
  id: "p1", profile_id: "p1", user_id: null, email: null, has_account: false,
  is_verified: undefined, invite_status: null,
  first_name: "Anna", last_name: "Beck", personnel_number: "P-4711",
  phone: "030 123", is_active: true
};

/** Ein regulaerer Mitarbeiter mit Konto. */
const MIT_KONTO = {
  id: "p2", profile_id: "p2", user_id: "u9", email: "bo@firma.de", has_account: true,
  is_verified: true, invite_status: "accepted",
  first_name: "Bo", last_name: "Cell", personnel_number: "P-1", phone: null, is_active: true
};

function zeilenHtml(workers) {
  const ziel = { innerHTML: "" };
  const ctx = {
    document: { getElementById: () => ziel },
    esc: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    TCi18n: { t: (k, v) => k + (v && v.name ? ":" + v.name : "") },
    _workers: workers
  };
  vm.createContext(ctx);
  vm.runInContext(ausschnitt("function renderWorkers("), ctx);
  ctx.renderWorkers(workers);
  return ziel.innerHTML;
}

const suite = vorhanden ? describe : describe.skip;

suite("P10/D5 · Kein Knopf zeigt mehr auf 'null'", () => {
  it("adressiert einen Mitarbeiter ohne Konto ueber sein Profil", () => {
    const html = zeilenHtml([OHNE_KONTO]);
    assert.ok(!/\('null'\)/.test(html) && !/\(''\)/.test(html) && !/\(undefined\)/.test(html),
      "genau das war der Defekt: openEdit('null') — ein Knopf, der nichts tut");
    assert.match(html, /openEdit\('p1'\)/);
    assert.match(html, /openWorkerProfileHub\('p1'\)/);
  });

  it("laesst Mitarbeiter MIT Konto unveraendert ueber ihr Konto laufen", () => {
    const html = zeilenHtml([MIT_KONTO]);
    assert.match(html, /openEdit\('u9'\)/,
      "der bisherige Weg darf sich nicht aendern — sonst braechen alle Bestandsaufrufe");
  });

  it("weist den Zustand aus, statt ihn zu verschweigen", () => {
    const html = zeilenHtml([OHNE_KONTO]);
    assert.match(html, /mit\.reg\.dataOnly/,
      "wer 200 Mitarbeiter ohne E-Mail importiert, muss sehen, dass sie noch nicht einsatzfaehig sind");
    assert.match(html, /mit\.reg\.noAccountHint/, "und WARUM, samt Weg da raus");
  });

  it("bietet das Einladen genau dort an, wo es fehlte", () => {
    const html = zeilenHtml([OHNE_KONTO]);
    assert.match(html, /inviteOhneKonto\('p1'\)/,
      "der alte Knopf haing an is_verified === false — ohne Konto ist das undefined, " +
      "er erschien also nie");
  });

  it("bietet es nicht doppelt an, wenn schon eingeladen wurde", () => {
    const html = zeilenHtml([{ ...OHNE_KONTO, invite_status: "pending" }]);
    assert.ok(!/inviteOhneKonto/.test(html), "eine zweite offene Einladung waere ein zweites Konto");
    assert.match(html, /mit\.reg\.invited/, "der laufende Vorgang muss trotzdem sichtbar sein");
  });

  it("zeigt in der Spalte E-Mail keinen leeren Fleck", () => {
    const html = zeilenHtml([OHNE_KONTO]);
    assert.match(html, /mit\.reg\.noAccount/,
      "eine leere Zelle sieht aus wie ein Datenfehler, nicht wie ein Zustand");
  });
});

suite("P10/D5 · Die Einladung nennt das gemeinte Profil", () => {
  it("schickt worker_profile_id mit", () => {
    const fn = ausschnitt("function inviteOhneKonto(");
    assert.match(fn, /worker_profile_id:\s*profileId/,
      "ohne diesen Bezug legte die Annahme ein ZWEITES Profil an, und Personalnummer, " +
      "Anschrift und Notizen blieben an einem verwaisten Datensatz zurueck");
  });

  it("fragt die Adresse, statt sie zu erfinden", () => {
    const fn = ausschnitt("function inviteOhneKonto(");
    assert.match(fn, /window\.prompt/);
    assert.match(fn, /mit\.reg\.askEmail/);
    assert.match(fn, /\[\^\\s@\]\+@\[\^\\s@\]\+/,
      "eine ungueltige Adresse wuerde erst der Server ablehnen — das kann die Seite selbst");
  });

  it("bricht ab, wenn der Nutzer abbricht", () => {
    const fn = ausschnitt("function inviteOhneKonto(");
    assert.match(fn, /if \(email === null\) return;/,
      "ein Abbruch darf keine Einladung an die leere Adresse ausloesen");
  });
});

suite("P10/D5 · Alle neuen Texte stehen in beiden Sprachen", () => {
  it("DE und EN", () => {
    for (const key of [
      "mit.reg.noAccount", "mit.reg.dataOnly", "mit.reg.noAccountHint", "mit.reg.askEmail"
    ]) {
      const treffer = quelle.split(`'${key}'`).length - 1;
      assert.ok(treffer >= 2, `${key} steht ${treffer}-mal — erwartet DE und EN`);
    }
  });
});
