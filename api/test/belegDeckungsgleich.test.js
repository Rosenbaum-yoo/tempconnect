/**
 * Sagen PDF und XML dasselbe?
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DAS EIN TEST IST UND KEIN GUTER VORSATZ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Der Beleg wird mit /AFRelationship /Alternative eingebettet. Fuer das Profil
 * EN 16931 ist das in Deutschland der einzig zulaessige Wert (Factur-X 1.07.2,
 * Kap. 6.2.2) — und er ist eine materielle Zusage: "alle Informationen, die im
 * menschenlesbaren Teil gegenwaertig sind, muessen auch im XML-Teil enthalten
 * sein" (Kap. 5.3, "identisches Mehrstueck").
 *
 * Beim Abgleich am 2026-08-29 stimmte das an vier Stellen NICHT:
 *
 *   · Das PDF nannte in jeder Zeile die Kraft, das XML sagte "Leistung".
 *   · Das PDF druckte den Abrechnungszeitraum, das XML liess ihn weg — weil
 *     die operativen Rechnungen ihn als `period_*` fuehren und das XML nur
 *     `billing_period_*` las.
 *   · Das PDF zeigte den Rechtsnamen, das XML den Handelsnamen: ram:Name ist
 *     BT-27 und damit die Rechtsperson, nicht BT-28.
 *   · Das PDF druckte USt-IdNr. UND Steuernummer, das XML fuehrt nur eine.
 *
 * Jede einzelne Abweichung macht die Zusage unwahr. Keine davon faellt beim
 * Ansehen auf — beide Teile sehen fuer sich genommen richtig aus. Deshalb
 * diese Datei: sie vergleicht sie miteinander.
 *
 * WAS SIE NICHT LEISTET: eine vollstaendige Deckungsgleichheitspruefung ist
 * maschinell nicht moeglich — der Text im PDF liegt in komprimierten
 * Zeichenbefehlen, nicht als Fliesstext. Geprueft werden die Angaben, die der
 * Renderer nachweislich druckt. Bei jeder Aenderung am Layout gehoert der
 * Abgleich von Hand nachgezogen.
 *
 * Run: node --test --test-force-exit test/belegDeckungsgleich.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { erzeugeERechnung } from "../services/eRechnungService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const RENDERER = path.join(HIER, "..", "services", "operationalInvoicePdfService.js");

const VERKAEUFER = {
  name: "Müller Zeitarbeit", legal_name: "Müller & Söhne Zeitarbeit GmbH",
  billing_street: "Große Straße 12", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789", tax_id: "315/5711/0815",
  iban: "DE02120300000000202051", bic: "BYLADEM1001",
  commercial_register: "HRB 12345 Dortmund", billing_email: "rechnung@mueller.de",
};
const KAEUFER = {
  legal_name: "Beispiel Logistik AG", billing_street: "Hafenstraße 3",
  billing_postal_code: "20457", billing_city: "Hamburg",
  billing_country_code: "DE", vat_id: "DE987654321",
};
const POSITIONEN = [
  { worker_name: "Anna Świątek", week_start: "2026-08-03", week_end: "2026-08-09",
    hours: 40, unit_amount_cents: 4800, total_cents: 192000 },
];
/* Bewusst mit `period_*` statt `billing_period_*`: so fuehren die operativen
   Rechnungen den Zeitraum, und genau daran ist der Abgleich gescheitert. */
const RECHNUNG = {
  invoice_number: "2026-0042", status: "issued",
  issued_at: "2026-08-20T10:00:00.000Z", due_at: "2026-09-03T10:00:00.000Z",
  gross_amount_cents: 192000, amount_cents: 192000,
  tax_amount_cents: 36480, total_cents: 228480, tax_rate_pct: 19,
  period_start: "2026-08-01", period_end: "2026-08-31",
};

describe("Was das PDF druckt, steht auch im XML", () => {
  let xml;

  before(() => {
    const e = erzeugeERechnung({
      format: "zugferd", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, "das Fixture erzeugt kein XML: " + JSON.stringify(e.fehlend || []));
    xml = e.xml;
  });

  it("der Rechtsname des Ausstellers — und zwar als BT-27", () => {
    /* ram:Name IST BT-27, die Rechtsperson. Hier stand einmal der
       Handelsname, waehrend das PDF den Rechtsnamen zeigte: zwei Namen fuer
       denselben Rechnungssteller auf demselben Dokument. */
    assert.match(xml, /<ram:Name>Müller &amp; Söhne Zeitarbeit GmbH<\/ram:Name>/,
      "der Rechtsname fehlt an der Stelle, an der das PDF ihn zeigt");
  });

  it("der Handelsname steht dort, wo er hingehoert (BT-28)", () => {
    assert.ok(xml.includes("<ram:TradingBusinessName>Müller Zeitarbeit</ram:TradingBusinessName>"),
      "der Handelsname gehoert unter SpecifiedLegalOrganization, nicht an die Stelle von BT-27");
  });

  it("die Kraft aus jeder Position", () => {
    /* Die gravierendste der vier Abweichungen: das PDF nennt sie namentlich,
       das XML sagte "Leistung". */
    assert.match(xml, /<ram:Name>Anna Świątek<\/ram:Name>/,
      "die Position nennt die Kraft nicht — das PDF tut es");
    assert.ok(!/<ram:Name>Leistung<\/ram:Name>/.test(xml),
      "die Position traegt den Platzhalter statt des Namens");
  });

  it("der Abrechnungszeitraum, auch wenn er period_* heisst", () => {
    /* Zwei Feldnamen fuer denselben Zeitraum: `period_*` bei operativen,
       `billing_period_*` bei Abo-Rechnungen. Das XML las nur den zweiten. */
    assert.ok(xml.includes("20260801"), "der Anfang des Zeitraums fehlt (BT-73)");
    assert.ok(xml.includes("20260831"), "das Ende des Zeitraums fehlt (BT-74)");
  });

  it("die Bankverbindung, die im Fuss steht", () => {
    assert.ok(xml.includes("DE02120300000000202051"), "die IBAN fehlt");
    assert.ok(xml.includes("BYLADEM1001"), "die BIC fehlt");
  });

  it("Handelsregister und Kontaktadresse", () => {
    assert.ok(xml.includes("HRB 12345 Dortmund"), "das Handelsregister fehlt");
    assert.ok(xml.includes("rechnung@mueller.de"), "die E-Mail-Adresse fehlt");
  });

  it("die vollstaendige Anschrift beider Parteien", () => {
    for (const wert of ["Große Straße 12", "44135", "Dortmund", "Hafenstraße 3", "20457", "Hamburg"]) {
      assert.ok(xml.includes(wert), `"${wert}" steht im PDF, aber nicht im XML`);
    }
  });

  it("genau EINE steuerliche Kennung — dieselbe wie im PDF", () => {
    /* Das XML fuehrt nur eine SpecifiedTaxRegistration je Partei, mit Vorrang
       der USt-IdNr. Das PDF folgt seit dem Abgleich derselben Regel. Wer hier
       auf zwei erweitert, muss den Renderer mitnehmen. */
    assert.ok(xml.includes('schemeID="VA">DE123456789'), "die USt-IdNr. fehlt");
    assert.ok(!xml.includes("315/5711/0815"),
      "die Steuernummer steht zusaetzlich im XML — dann muss das PDF sie auch drucken");
  });
});

describe("Der Renderer haelt sich an dieselbe Vorrangregel", () => {
  let quelle;
  before(() => { quelle = fs.readFileSync(RENDERER, "utf8"); });

  it("druckt die Steuernummer NUR ohne USt-IdNr.", () => {
    /* Ein `if (ustId)` gefolgt von einem eigenstaendigen `if (steuernummer)`
       druckte beide — genau der Bruch, der hier zugehalten wird. */
    assert.match(quelle, /if \(vk\.ustId\)[\s\S]{0,200}?else if \(vk\.steuernummer\)/,
      "der Renderer druckt beide Kennungen, das XML fuehrt nur eine");
  });

  it("liest den Zeitraum unter beiden Feldnamen", () => {
    assert.match(quelle, /invoice\.period_start \|\| invoice\.billing_period_start/,
      "der Renderer kennt nur einen der beiden Feldnamen");
  });

  it("nennt in den Positionen die Kraft", () => {
    assert.match(quelle, /it\.worker_name/,
      "der Renderer druckt die Kraft nicht mehr — dann gehoert sie auch aus dem XML");
  });
});
