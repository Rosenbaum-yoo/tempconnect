/**
 * Die Profil-Kennung — der Fehler, der zwei Jahre unsichtbar bleiben kann.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS AM 2026-08-29 GEFUNDEN WURDE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Die XRechnung trug die Kennung
 *
 *     urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0
 *
 * Gueltig ist
 *
 *     urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0
 *
 * Der Namensraum wechselte mit XRechnung 3.0 von "xoev-de" auf "xeinkauf.de".
 * Im Code stand der ALTE Namensraum mit der NEUEN Versionsnummer — eine
 * Kombination, die es nicht gibt. Beide Haelften sehen fuer sich richtig aus,
 * und genau deshalb faellt so etwas beim Lesen nicht auf.
 *
 * Die Folge war nicht "eine Regel verletzt", sondern schlimmer: der
 * KoSIT-Validator meldete `noScenarioMatched` — es wurde ueberhaupt keine
 * Geschaeftsregel geprueft. Ein Empfaenger haette das Dokument nicht als
 * XRechnung erkannt und zurueckgewiesen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DIESER TEST ZUSAETZLICH ZUM GATE EXISTIERT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `npm run test:schematron` faengt das zuverlaessig — aber es braucht Docker
 * und laeuft deshalb nicht in jedem Testlauf. Dieser Test kostet Millisekunden
 * und haelt genau die Zeichenkette fest, an der alles haengt. Wer sie aendert,
 * muss hier vorbei und findet die Begruendung gleich mit.
 *
 * Run: node --test --test-force-exit test/xrechnungKennung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  XRECHNUNG_CUSTOMIZATION,
  XRECHNUNG_PROFILE,
  erzeugeERechnung,
} from "../services/eRechnungService.js";

/* Abgelesen aus scenarios.xml der validator-configuration-xrechnung,
   Release v2026-01-31 — nicht aus einer Beschreibung uebernommen. */
const GUELTIG = "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
const REINES_EN16931 = "urn:cen.eu:en16931:2017";

const VERKAEUFER = {
  legal_name: "Muster Zeitarbeit GmbH", name: "Muster Zeitarbeit",
  billing_street: "Weg 1", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789",
  billing_contact: "Buchhaltung", billing_phone: "+49 231 5551234",
  billing_email: "rechnung@muster.de",
};
const KAEUFER = {
  legal_name: "Beispiel AG", billing_street: "Strasse 2", billing_postal_code: "20457",
  billing_city: "Hamburg", billing_country_code: "DE", vat_id: "DE987654321",
};
const POSITIONEN = [
  { worker_name: "A. Kraft", quantity: 40, unit_amount_cents: 4800, total_cents: 192000,
    week_start: "2026-08-03", week_end: "2026-08-09" },
];
const RECHNUNG = {
  invoice_number: "2026-0042", issued_at: "2026-08-20T10:00:00.000Z",
  due_at: "2026-09-03T10:00:00.000Z",
  gross_amount_cents: 192000, amount_cents: 192000,
  tax_amount_cents: 36480, total_cents: 228480, tax_rate_pct: 19,
  period_start: "2026-08-01", period_end: "2026-08-31",
};

describe("Die XRechnung-Kennung", () => {
  it("nennt den Namensraum xeinkauf.de", () => {
    assert.equal(XRECHNUNG_CUSTOMIZATION, GUELTIG);
  });

  it("traegt NICHT mehr den alten Namensraum xoev-de", () => {
    /* Der eigentliche Befund. "xoev-de" war bis XRechnung 2.x richtig; mit 3.0
       gilt "xeinkauf.de". Die Mischung aus altem Namensraum und neuer Version
       trifft kein Szenario — es wird dann GAR NICHTS geprueft. */
    assert.ok(!XRECHNUNG_CUSTOMIZATION.includes("xoev-de"),
      "der Namensraum aus der 2.x-Zeit steht wieder in der Kennung");
    assert.ok(!XRECHNUNG_CUSTOMIZATION.includes(":standard:"),
      "der alte Pfadbestandteil ':standard:' gehoert nicht in die 3.0-Kennung");
  });

  it("baut auf der EN-16931-Kennung auf", () => {
    assert.ok(XRECHNUNG_CUSTOMIZATION.startsWith(REINES_EN16931 + "#compliant#"),
      "eine XRechnung ist eine EN-16931-Rechnung mit Zusatzregeln — das muss die Kennung zeigen");
  });

  it("das Peppol-Profil bleibt unveraendert", () => {
    assert.equal(XRECHNUNG_PROFILE, "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0");
  });
});

describe("Die Kennungen im erzeugten XML", () => {
  it("die XRechnung traegt die gueltige CustomizationID", () => {
    const e = erzeugeERechnung({
      format: "xrechnung", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
    assert.ok(e.xml.includes(`<cbc:CustomizationID>${GUELTIG}</cbc:CustomizationID>`),
      "die Kennung im Dokument weicht von der Konstanten ab");
  });

  it("das ZUGFeRD traegt die reine EN-16931-Kennung", () => {
    /* Ein anderer Wert schaltete still auf ein anderes Pruefszenario um — oder
       auf gar keines. */
    const e = erzeugeERechnung({
      format: "zugferd", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
    assert.ok(e.xml.includes(`<ram:ID>${REINES_EN16931}</ram:ID>`),
      "die Profilkennung des ZUGFeRD fehlt oder weicht ab");
  });
});

describe("Kontaktstelle und Telefon (BR-DE-5, BR-DE-6)", () => {
  it("beide stehen in der XRechnung", () => {
    /* Die zwei Fehler, die nach der Kennungskorrektur uebrig blieben. Die
       Kontaktspalte gab es laengst, die Telefonspalte kam mit Migration 205. */
    const e = erzeugeERechnung({
      format: "xrechnung", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.ok(e.xml.includes("<cbc:Name>Buchhaltung</cbc:Name>"), "BT-41 fehlt");
    assert.ok(e.xml.includes("<cbc:Telephone>+49 231 5551234</cbc:Telephone>"), "BT-42 fehlt");
  });

  it("das Telefon steht VOR der E-Mail — die Reihenfolge ist schemagebunden", () => {
    /* cac:Contact verlangt Name, Telephone, ElectronicMail in dieser Folge.
       Vertauscht bricht die XSD-Pruefung, und der Validator kommt gar nicht
       erst zu den Geschaeftsregeln. */
    const e = erzeugeERechnung({
      format: "xrechnung", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    const tel = e.xml.indexOf("<cbc:Telephone>");
    const mail = e.xml.indexOf("<cbc:ElectronicMail>");
    assert.ok(tel > 0 && mail > tel, "die Reihenfolge in cac:Contact stimmt nicht");
  });

  it("im ZUGFeRD steht das Telefon ebenfalls vor der E-Mail", () => {
    const e = erzeugeERechnung({
      format: "zugferd", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.ok(e.xml.includes("<ram:CompleteNumber>+49 231 5551234</ram:CompleteNumber>"),
      "die Telefonnummer fehlt im CII");
    const tel = e.xml.indexOf("<ram:TelephoneUniversalCommunication>");
    const mail = e.xml.indexOf("<ram:EmailURIUniversalCommunication>");
    assert.ok(tel > 0 && mail > tel,
      "in DefinedTradeContact steht Telephone vor EmailURI — sonst bricht die XSD-Pruefung");
  });

  it("ohne Kontaktdaten entsteht kein leerer Kontaktblock", () => {
    /* Ein leeres <cac:Contact/> waere schlechter als keines: die XSD verlangt
       dort mindestens ein Kindelement. */
    const ohne = { ...VERKAEUFER, billing_contact: null, billing_phone: null, billing_email: null };
    const e = erzeugeERechnung({
      format: "xrechnung", invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: ohne, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, JSON.stringify(e.fehlend || []));
    assert.ok(!/<cac:Contact>\s*<\/cac:Contact>/.test(e.xml), "leerer Kontaktblock im XML");
  });
});
