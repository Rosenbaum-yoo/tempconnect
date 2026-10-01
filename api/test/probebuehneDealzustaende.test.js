/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SECHZEHN ZUSTÄNDE OHNE BEISPIEL (Y2.1 · Y2.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GEMESSEN AM 2026-10-01 — fünf Zustandsmengen, sechzehn unbesetzte Werte:
 *
 *   requests.status           CREATED · OFFER_SENT · DECLINED · CONFIRMED ·
 *                             ASSIGNMENT_STARTED · COMPLETED · CANCELED (7/11)
 *   demand_requests.status    closed · cancelled · paused               (3/7)
 *   offers.status             rejected · withdrawn · countered          (3/6)
 *   offers.agreement_status   none · expired                           (2/7)
 *   timesheets.status         cancelled                                (1/5)
 *
 * DREI PAARE, DIE IN EINER LISTE GLEICH AUSSEHEN UND DAS GEGENTEIL BEDEUTEN —
 * und genau deshalb stehen alle sechs Werte in der Saat:
 *
 *   `DECLINED` / `CANCELED`        die Gegenseite sagt nein / der Besteller zieht zurück
 *   `rejected` / `withdrawn`       dieselbe Unterscheidung beim Angebot
 *   `paused` / `closed`            der Bedarf lebt weiter / der Bedarf ist beendet
 *
 * Eine Oberfläche, die nur eine Hälfte kennt, nennt dem Nutzer den falschen
 * Urheber. `countered` kommt dazu: ein Gegenangebot ist gar keine Ablehnung.
 *
 * ALLE VORGÄNGE LAUFEN ZWISCHEN ZWEI ANMELDBAREN ORGANISATIONEN — Nordlicht
 * Logistik (Y1.2) und Hanse Personal Service (Y1.4). „Jeder Zustand einmal
 * sichtbar, auf BEIDEN Seiten" verlangt der Plan; ein Zustand an Organisationen,
 * die niemand betreten kann, ist kein vorführbarer Zustand.
 *
 * Geprüft wird die FORM der Saat — das Tor lädt keine Saat.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const saat = path.join(dir, "sql", "seeds", "y2-2-dealzustaende.sql");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 4000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y2-2-dealzustaende.sql"), "utf8") : "";
const OHNE_KOMMENTAR = SAAT.replace(/--[^\n]*/g, " ");
/* Nur der Teil, der Zeilen anlegt — die Notbremse nennt jeden Zustand selbst. */
const DATENTEIL = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(0, i) : OHNE_KOMMENTAR;
})();

/** Der Rumpf EINER Einfügung, abgegrenzt bis zum ON CONFLICT. */
function einfuegung(tabelle) {
  const re = new RegExp("INSERT INTO " + tabelle + "\\b[\\s\\S]*?(?=ON CONFLICT)", "i");
  return (DATENTEIL.match(re) || [""])[0];
}

const ZUSTAENDE = {
  requests: ["CREATED", "OFFER_SENT", "DECLINED", "CONFIRMED", "ASSIGNMENT_STARTED", "COMPLETED", "CANCELED"],
  demand_requests: ["closed", "cancelled", "paused"],
  offers: ["rejected", "withdrawn", "countered"],
  timesheets: ["cancelled"],
};

suite("Y2.1/Y2.2 — sechzehn Zustände bekommen ein Beispiel", () => {

  for (const [tabelle, werte] of Object.entries(ZUSTAENDE)) {
    it(`${tabelle}: jeder der ${werte.length} unbesetzten Zustände steht in SEINER Einfügung`, () => {
      const block = einfuegung(tabelle);
      /* Notbremse: ohne abgegrenzten Rumpf ist alles darunter leer grün. Genau
         diese Abgrenzung hat in Y3 zwei Rückmutationen davor bewahrt, grün zu
         bleiben — dort fand die Zusicherung den Wert in der ON-CONFLICT-Klausel. */
      assert.ok(block.length > 100,
        `Die Einfügung in ${tabelle} ließ sich nicht abgrenzen (${block.length} Zeichen) — `
        + "dann prüft diese Zusicherung nichts");
      const fehlt = werte.filter((w) => !new RegExp("'" + w + "'").test(block));
      assert.deepEqual(fehlt, [],
        `Diese Zustände stehen nicht in der Einfügung von ${tabelle}: ${fehlt.join(", ")}. `
        + "Gemessen hatten sie im ganzen Bestand kein Beispiel.");
    });
  }

  it("offers.agreement_status: 'none' UND 'expired' — beide waren unbesetzt", () => {
    const block = einfuegung("offers");
    assert.match(block, /'none'/,
      "agreement_status 'none' fehlt. Es ist der Zustand „es kam nie zu einer Vereinbarung\" "
      + "und war unbesetzt — ohne ihn sieht ein abgelehntes Angebot aus wie eines, bei dem "
      + "eine Vereinbarung verschwunden ist.");
    assert.match(block, /'expired'/,
      "agreement_status 'expired' fehlt — eine Vereinbarung, die abgelaufen ist, ohne storniert "
      + "worden zu sein. War ebenfalls unbesetzt.");
  });

  it("DIE DREI PAARE stehen zusammen — sonst nennt die Liste den falschen Urheber", () => {
    /* Der eigentliche Wert dieser Saat. Jedes Paar sieht in einer Liste gleich
       aus und bedeutet das Gegenteil; fehlt eine Hälfte, lernt niemand den
       Unterschied. */
    const anfragen = einfuegung("requests");
    assert.ok(/'DECLINED'/.test(anfragen) && /'CANCELED'/.test(anfragen),
      "DECLINED und CANCELED stehen nicht beide da. Das eine ist die Entscheidung der "
      + "Gegenseite, das andere der Rückzug des Bestellers — in einer Liste sehen sie gleich aus.");
    const angebote = einfuegung("offers");
    assert.ok(/'rejected'/.test(angebote) && /'withdrawn'/.test(angebote),
      "rejected und withdrawn stehen nicht beide da — dieselbe Unterscheidung beim Angebot.");
    const bedarfe = einfuegung("demand_requests");
    assert.ok(/'paused'/.test(bedarfe) && /'closed'/.test(bedarfe),
      "paused und closed stehen nicht beide da. Der eine Bedarf lebt weiter, der andere ist "
      + "beendet — ohne beide ist „angehalten\" nicht von „geschlossen\" zu unterscheiden.");
  });

  it("jeder Vorgang läuft zwischen ZWEI ANMELDBAREN Organisationen", () => {
    const anfragen = einfuegung("requests");
    const kunde = (anfragen.match(/'b0000000-0000-4000-8000-00000000c001'/g) || []).length;
    const lieferant = (anfragen.match(/'b1000000-0000-4000-8000-00000000c001'/g) || []).length;
    assert.equal(kunde, 7,
      `Nur ${kunde} von sieben Anfragen kommen vom Konto verwaltung@ (Y1.2). „Auf beiden Seiten `
      + "sichtbar\" verlangt, dass man sich in BEIDE Richtungen anmelden kann.");
    assert.equal(lieferant, 7,
      `Nur ${lieferant} von sieben Anfragen gehen an das Konto disponent@ (Y1.4).`);
  });

  it("der XOR-Riegel ist erfüllt: jede Anfrage nennt ein Listing", () => {
    /* `requests_capacity_listing_xor` verlangt GENAU EINES von capacity_id und
       listing_id. Beide NULL ist verboten — gemessen beim ersten Ladeversuch. */
    assert.match(DATENTEIL, /INSERT INTO listings/i,
      "Die Saat legt kein eigenes Listing an. Die sieben Anfragen brauchen eines "
      + "(requests_capacity_listing_xor), und ein fremdes aus der alten Demo-Welt wäre eine "
      + "Fremdbindung, die beim Aufräumen jener Welt mitstirbt.");
    const anfragen = einfuegung("requests");
    const verweise = (anfragen.match(/'b9000000-0000-4000-8000-00000000e001'/g) || []).length;
    assert.equal(verweise, 7,
      `Nur ${verweise} von sieben Anfragen zeigen auf das eigene Listing. Fehlt der Verweis, `
      + "bricht die Saat am XOR-Riegel ab.");
    assert.ok(!/'d0c00000-/.test(DATENTEIL),
      "Die Saat bindet an ein Listing der alten Demo-Welt (d0c00000-…). Wird jene Welt "
      + "aufgeräumt, verliert die Bühne stillschweigend ihre Anfragen.");
  });

  it("die erlaubten Werte sind eingehalten — priority kennt kein 'HIGH'", () => {
    /* `requests_priority_check` erlaubt NUR 'NORMAL' und 'NOTDIENST'. Der erste
       Entwurf schrieb 'HIGH' und scheiterte beim Laden. */
    const anfragen = einfuegung("requests");
    const prioritaeten = [...anfragen.matchAll(/'(NORMAL|NOTDIENST|HIGH|URGENT|LOW)'/g)].map((m) => m[1]);
    assert.ok(prioritaeten.length >= 7, `Nur ${prioritaeten.length} Prioritäten erkannt`);
    const falsch = [...new Set(prioritaeten)].filter((p) => p !== "NORMAL" && p !== "NOTDIENST");
    assert.deepEqual(falsch, [],
      `Unerlaubte Priorität: ${falsch.join(", ")}. requests_priority_check kennt nur NORMAL und `
      + "NOTDIENST — alles andere bricht beim Laden.");
    assert.ok(prioritaeten.includes("NOTDIENST"),
      "Keine Anfrage trägt NOTDIENST. Dann bleibt der zweite erlaubte Wert ohne Beispiel, "
      + "und die Eilfall-Oberfläche zeigt nichts.");
  });

  it("keine Prosa in Datenspalten, keine festen Datumswerte", () => {
    /* `demand_requests.requirements` ist jsonb und in keiner der 42 vorhandenen
       Zeilen benutzt. Eine Saat, die dort als Erste Text ablegt, erfindet eine
       Nutzung — die Begründungen gehören in die Kommentare. */
    assert.ok(!/requirements/.test(DATENTEIL),
      "Die Saat schreibt in demand_requests.requirements. Die Spalte ist jsonb und wird von "
      + "keiner der 42 vorhandenen Zeilen benutzt — die Saat wäre ihre erste und einzige "
      + "Nutzerin. Begründungen gehören in SQL-Kommentare.");
    const feste = OHNE_KOMMENTAR.match(/'20\d\d-\d\d-\d\d/g) || [];
    assert.deepEqual(feste, [],
      `Feste Kalenderdaten in der Saat: ${feste.join(", ")}. Alle Zeitwerte müssen relativ sein, `
      + "sonst ist der Zustand in drei Wochen falsch.");
  });

  it("die beendeten Bedarfe tragen ihren Zeitstempel", () => {
    const block = einfuegung("demand_requests");
    assert.match(block, /now\(\) - interval '25 days', NULL\)/,
      "Der geschlossene Bedarf hat kein closed_at. Ein Zustand ohne seinen Zeitstempel ist "
      + "halb: die Oberfläche zeigt „geschlossen\" und kann nicht sagen, seit wann.");
    assert.match(block, /NULL, now\(\) - interval '8 days'\)/,
      "Der zurückgezogene Bedarf hat kein cancelled_at.");
  });

  it("die Notbremse prüft alle sechzehn Zustände an ihrer Bedingung", () => {
    assert.match(SAAT, /array_length\(fehlt, 1\) > 0/,
      "Die Notbremse wertet ihre Sammelliste nicht aus");
    const pruefungen = (SAAT.match(/IF NOT EXISTS \(SELECT 1 FROM (requests|demand_requests|offers|timesheets)/g) || []).length;
    assert.equal(pruefungen, 16,
      `${pruefungen} Einzelprüfungen in der Notbremse, erwartet genau sechzehn — eine je `
      + "Zustand. Fehlt eine, kann die Saat erfolgreich durchlaufen und einen Zustand "
      + "unbesetzt hinterlassen.");
  });

  it("die Saat verlangt ihre beiden Seiten — und sagt welche", () => {
    for (const [id, datei] of [
      ["b0000000-0000-4000-8000-00000000c001", "y1-2-standorte.sql"],
      ["b1000000-0000-4000-8000-00000000c001", "y1-4-belegschaft.sql"],
    ]) {
      assert.match(SAAT, new RegExp("IF NOT EXISTS \\(SELECT 1 FROM users WHERE id = '" + id + "'\\) THEN"),
        `Die Saat prüft nicht, ob ${id} vorhanden ist`);
      assert.ok(SAAT.includes(datei), `Die Fehlermeldung nennt ${datei} nicht`);
    }
  });

  it("ein zweiter Lauf verdoppelt nichts", () => {
    const konflikte = (OHNE_KOMMENTAR.match(/ON CONFLICT/g) || []).length;
    assert.ok(konflikte >= 5, `Nur ${konflikte} ON-CONFLICT-Klauseln, erwartet mindestens fünf`);
    assert.ok(!/uuid_generate_v4\(\)|gen_random_uuid\(\)/.test(OHNE_KOMMENTAR),
      "Die Saat erzeugt Kennungen zur Laufzeit — dann ist sie nicht wiederholbar");
  });
});
