import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/*
 * DIE RICHTUNG IST DER GANZE PUNKT — und ich habe sie zuerst falsch gebaut.
 *
 * Am 2026-08-23 wurde die Ansprechperson in der Live-Belegschaft angezeigt,
 * gelesen aus `offers.contact_name`. Beim Nachpruefen fiel auf:
 *
 *   assignments.supplier_org_id  = die Agentur, deren Tafel das ist
 *   offers.supplier_company_id   = ein Mitglied ebendieser Agentur
 *
 * Die Agentur bekam also ihre EIGENE Kontaktperson angezeigt. Es sah richtig
 * aus, war aber wertlos — die schlimmste Sorte Fehler, weil niemand sie
 * bemerkt, bis jemand um sechs Uhr morgens die falsche Nummer waehlt.
 *
 * Owner-Vorgabe: "fuer BEIDE Seiten sichtbar ... an der Besetzung und in der
 * Live-Belegschaft". Besetzung und Live-Belegschaft sind ANBIETER-Flaechen —
 * dort gehoert die Nummer des KUNDEN hin. Die Gegenrichtung traegt
 * `offers.contact_name`, wo der Kunde hinsieht.
 *
 * Diese Datei haelt die Richtung fest. Sie ist billig und sie haette den
 * Fehler gefangen.
 */

const workforce = fs.readFileSync(new URL("../services/workforceService.js", import.meta.url), "utf8");
const staffing = fs.readFileSync(new URL("../services/assignmentStaffingService.js", import.meta.url), "utf8");
const tafel = fs.readFileSync(new URL("../../frontend/public/js/pages/mitarbeiter.js", import.meta.url), "utf8");
const besetzung = fs.readFileSync(new URL("../../frontend/public/js/pages/workerSubmissionsReview.js", import.meta.url), "utf8");

/** Der Ausschnitt einer Funktion, damit Zusicherungen nicht an der falschen Abfrage haengen. */
function funktion(quelle, name, bisName) {
  const a = quelle.indexOf(name);
  assert.ok(a >= 0, `${name} nicht gefunden — greift das Muster noch?`);
  const b = bisName ? quelle.indexOf(bisName, a) : -1;
  return quelle.slice(a, b > 0 ? b : quelle.length);
}

describe("Ansprechperson — auf Anbieter-Flaechen steht die Nummer des KUNDEN", () => {
  it("die Live-Belegschaft liest aus dem BEDARF", () => {
    const f = funktion(workforce, "export async function getWorkerLiveBoard");
    assert.match(f, /LEFT JOIN demand_requests bedarf ON bedarf\.id = a\.demand_request_id/,
      "Der Bedarf traegt die Ansprechperson des Einsatzunternehmens.");
    assert.match(f, /bedarf\.contact_name AS kunde_kontakt_name/);
  });

  it("und NICHT aus dem Angebot", () => {
    const f = funktion(workforce, "export async function getWorkerLiveBoard");
    assert.ok(!/JOIN offers .* ON .*a\.offer_id/.test(f),
      "`offers.contact_name` ist die Ansprechperson des ANBIETERS — also derselben " +
      "Organisation, deren Tafel das ist. Sie hier anzuzeigen heisst, der Agentur ihre " +
      "eigene Nummer zu zeigen.");
  });

  it("die Besetzungsliste ebenso", () => {
    const f = funktion(staffing, "export async function listOpenStaffingAssignments", "export async function listClosedDealAssignments");
    assert.match(f, /dr\.contact_name AS kunde_kontakt_name/,
      "`dr` ist `demand_requests` — der Bedarf des Kunden");
    assert.ok(!/o\.contact_name|offer.*contact_name/.test(f),
      "aus dem Angebot waere wieder die eigene Nummer");
  });
});

describe("Ansprechperson — die Anzeigen benutzen die richtigen Felder", () => {
  it("die Live-Belegschaft zeigt `kunde_kontakt_*`", () => {
    assert.match(tafel, /w\.kunde_kontakt_name \|\| w\.kunde_kontakt_telefon/);
    assert.ok(!/w\.kontakt_name\b/.test(tafel),
      "das alte, richtungslose Feld darf nicht zurueckkehren");
  });

  it("die Besetzungskarte zeigt sie ebenfalls", () => {
    assert.match(besetzung, /a\.kunde_kontakt_name\|\|a\.kunde_kontakt_telefon/,
      "Bis 2026-08-23 fuehrte von dieser Karte nur der Knopf 'Dealakte oeffnen' weiter — " +
      "genau der Umweg, den die Owner-Vorgabe abstellt.");
  });

  it("beide machen die Nummer WAEHLBAR", () => {
    /* Der Grund der ganzen Entscheidung ist ein Anruf, kein Text. Eine Nummer,
     * die man abtippen muss, ist um sechs Uhr morgens keine Nummer. */
    for (const [name, q] of [["Live-Belegschaft", tafel], ["Besetzung", besetzung]]) {
      assert.match(q, /href="tel:/, `${name}: die Nummer muss waehlbar sein`);
      assert.match(q, /replace\(\/\[\^\+0-9\]\/g, ?""\)|replace\(\/\[\^\+0-9\]\/g,''\)/,
        `${name}: Leerzeichen und Bindestriche gehoeren nicht in ein tel:-Ziel`);
    }
  });

  it("fehlt sie, steht NICHTS da — kein Platzhalter", () => {
    /* Gemessen am 2026-08-23: 61 von 68 Einsaetzen haben weder Bedarf noch Deal
     * noch Angebot noch Anforderung. Ein Platzhalter an 61 Zeilen waere Laerm,
     * und Laerm liest bald niemand mehr. */
    assert.match(tafel, /if \(w\.kunde_kontakt_name \|\| w\.kunde_kontakt_telefon\) \{/,
      "die Zeile entsteht nur, wenn es etwas zu zeigen gibt");
    assert.match(besetzung, /\?'<div style="margin-top:4px[^']*'/,
      "die Besetzungskarte ebenso");
  });
});

describe("Ansprechperson — die Gegenrichtung bleibt, wo sie hingehoert", () => {
  it("der Bedarf traegt die Nummer des Kunden", () => {
    const marktplatz = fs.readFileSync(new URL("../routes/marketplace.js", import.meta.url), "utf8");
    assert.match(marktplatz, /createDemandRequest\(pool, req\.session\.userId, plan, \{[\s\S]{0,200}?contact_name: kontakt\.name/,
      "Wer den Bedarf anlegt, ist das Einsatzunternehmen — seine Nummer gehoert dorthin.");
  });

  it("das Angebot traegt die Nummer der Agentur", () => {
    const marktplatz = fs.readFileSync(new URL("../routes/marketplace.js", import.meta.url), "utf8");
    assert.match(marktplatz, /createOffer\(pool, req\.session\.userId, demandId, \{[\s\S]{0,200}?contact_name: kontakt\.name/,
      "Wer das Angebot macht, ist die Agentur — ihre Nummer gehoert dorthin.");
  });

  it("die Migration sagt beides ausdruecklich", () => {
    const m = fs.readFileSync(
      new URL("../../sql/migrations/192_ansprechperson_auf_beiden_seiten.sql", import.meta.url), "utf8");
    assert.match(m, /Ansprechperson des EINSATZUNTERNEHMENS/,
      "Der Kommentar an der Spalte ist die einzige Stelle, an der die Richtung fuer den " +
      "naechsten Leser steht. Ohne ihn baut jemand denselben Fehler noch einmal.");
    assert.match(m, /offers\.contact_name/,
      "und er muss die Gegenrichtung benennen, sonst sucht sie jemand vergeblich");
  });
});
