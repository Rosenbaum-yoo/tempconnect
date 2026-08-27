/**
 * eRechnung.test.js — E-Rechnung nach EN 16931 (XRechnung/UBL + ZUGFeRD/CII).
 *
 * Geprueft wird, was beim Empfaenger tatsaechlich ueber Annahme oder Ablehnung entscheidet:
 * Betragsformat, Datumsgrenze in Europe/Berlin, Maskierung von Freitext, rechnerische
 * Schluessigkeit (BR-13 / BR-CO-15), die Rabattdarstellung auf Dokumentebene und die
 * Wohlgeformtheit des erzeugten XML.
 *
 * Der Wohlgeformtheitspruefer unten ist bewusst selbst gebaut: Node bringt keinen
 * XML-Parser mit, und eine neue Abhaengigkeit nur fuer eine Tag-Balance-Pruefung waere
 * der falsche Tausch. Er faengt genau den Fehler, der beim Zusammenbau von XML aus
 * Zeichenketten entsteht — ein nicht geschlossenes oder falsch verschachteltes Element.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  baueRechnungsdokument, pruefePflichtfelder, baueXRechnung, baueZugferdXml,
  erzeugeERechnung, centsZuBetrag, mengeFormat, zuIsoDatum, xmlText,
  steuerkategorie, RECHNUNGSFORMATE, XRECHNUNG_CUSTOMIZATION, ZUGFERD_GUIDELINE,
  pruefeFirmenstammdaten, firmaZuPartei
} from "../services/eRechnungService.js";
import { createInvoicesRouter } from "../routes/invoices.js";

/* ── Wohlgeformtheitspruefer ───────────────────────────────── */

/**
 * Prueft Tag-Balance und Verschachtelung. Wirft mit Fundstelle, wenn etwas nicht aufgeht.
 * @returns {{tiefsteEbene:number, elemente:number}}
 */
function pruefeWohlgeformt(xml) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "XML-Deklaration fehlt");
  const ohneDeklaration = xml.replace(/<\?xml[^?]*\?>/g, "");
  const stapel = [];
  let elemente = 0;
  let tiefste = 0;
  const muster = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = muster.exec(ohneDeklaration)) !== null) {
    const [voll, schliessend, name, attribute, selbstschliessend] = m;
    if (selbstschliessend) { elemente++; continue; }
    if (schliessend) {
      const offen = stapel.pop();
      assert.equal(offen, name,
        `Falsch verschachtelt bei "${voll}": erwartet </${offen}>, gefunden </${name}>`);
    } else {
      stapel.push(name);
      elemente++;
      if (stapel.length > tiefste) tiefste = stapel.length;
      // Attribute muessen in Anfuehrungszeichen stehen
      if (attribute.trim()) {
        assert.ok(/^(\s+[\w.:-]+="[^"]*")+\s*$/.test(attribute),
          `Attribut nicht sauber gequotet bei "${voll}"`);
      }
    }
  }
  assert.equal(stapel.length, 0, `Nicht geschlossene Elemente: ${stapel.join(" > ")}`);
  return { tiefsteEbene: tiefste, elemente };
}

/** Textinhalt des ersten Vorkommens eines Elements. */
function inhalt(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

/** Schneidet den ersten Block eines Elements per Textsuche aus (keine Regex-Fallen). */
function ausschnitt(xml, tag) {
  const auf = "<" + tag + ">";
  const zu = "</" + tag + ">";
  const von = xml.indexOf(auf);
  if (von === -1) return null;
  const bis = xml.indexOf(zu, von);
  if (bis === -1) return null;
  return xml.slice(von, bis + zu.length);
}

/** Alle Bloecke eines Elements, in Dokumentreihenfolge. */
function alleAusschnitte(xml, tag) {
  const auf = "<" + tag + ">";
  const zu = "</" + tag + ">";
  const treffer = [];
  let pos = 0;
  for (;;) {
    const von = xml.indexOf(auf, pos);
    if (von === -1) break;
    const bis = xml.indexOf(zu, von);
    if (bis === -1) break;
    treffer.push(xml.slice(von, bis + zu.length));
    pos = bis + zu.length;
  }
  return treffer;
}

/** Alle Textinhalte eines Elements. */
function alleInhalte(xml, tag) {
  const treffer = [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))];
  return treffer.map((t) => t[1].trim());
}

/* ── Vorlagen ──────────────────────────────────────────────── */

const VERKAEUFER = {
  name: "Nordlicht Personal GmbH",
  legal_name: "Nordlicht Personal GmbH",
  billing_street: "Hafenstrasse 12",
  billing_postal_code: "20457",
  billing_city: "Hamburg",
  billing_country_code: "DE",
  vat_id: "DE123456789",
  tax_id: "22/815/00123",
  commercial_register: "HRB 98765",
  billing_email: "rechnung@nordlicht-personal.de",
  billing_contact: "Frau Ostermann",
  iban: "DE02120300000000202051",
  bic: "BYLADEM1001"
};

const KAEUFER = {
  name: "Werkbau Industrie AG",
  legal_name: "Werkbau Industrie AG",
  billing_street: "Industriering 4",
  billing_address_2: "Tor 3",
  billing_postal_code: "44137",
  billing_city: "Dortmund",
  billing_country_code: "DE",
  vat_id: "DE987654321",
  billing_email: "kreditoren@werkbau.example"
};

// 40,00 Std × 28,50 € = 1.140,00 € | 5,50 Std × 34,00 € = 187,00 € → netto 1.327,00 €
const POSITIONEN = [
  {
    description: "M. Brandt — Regelstunden 2026-07-06 bis 2026-07-10",
    quantity: 40, unit_amount_cents: 2850, total_cents: 114000,
    week_start: "2026-07-06", week_end: "2026-07-10"
  },
  {
    description: "M. Brandt — Ueberstunden 2026-07-06 bis 2026-07-10 (+25%)",
    quantity: 5.5, unit_amount_cents: 3400, total_cents: 18700,
    week_start: "2026-07-06", week_end: "2026-07-10"
  }
];

const RECHNUNG = {
  invoice_number: "TC-2026-001042",
  currency: "EUR",
  issued_at: "2026-07-15T09:00:00Z",
  due_at: "2026-07-29T09:00:00Z",
  billing_period_start: "2026-07-06",
  billing_period_end: "2026-07-10",
  reference_number: "BST-2026-8891",
  notes: "Ueberlassung nach AUeG, Vertrag 2026-114.",
  gross_amount_cents: 132700,
  discount_pct: 0,
  discount_amount_cents: 0,
  amount_cents: 132700,
  tax_rate_pct: 19,
  tax_amount_cents: 25213,
  total_cents: 157913
};

const dok = (over = {}) => baueRechnungsdokument({
  invoice: { ...RECHNUNG, ...over },
  items: POSITIONEN,
  verkaeufer: VERKAEUFER,
  kaeufer: KAEUFER
});

/* ═══════════════════════════════════════════════════════════
   Formatierung
   ═══════════════════════════════════════════════════════════ */

describe("eRechnung — Betrags- und Mengenformat", () => {
  it("centsZuBetrag: Punkt als Dezimaltrenner, immer zwei Stellen", () => {
    // Ein deutsches Komma macht das Dokument nach der Norm ungueltig.
    assert.equal(centsZuBetrag(157913), "1579.13");
    assert.equal(centsZuBetrag(0), "0.00");
    assert.equal(centsZuBetrag(5), "0.05");
    assert.equal(centsZuBetrag(100), "1.00");
  });

  it("centsZuBetrag: kein Tausendertrennzeichen bei grossen Betraegen", () => {
    assert.equal(centsZuBetrag(123456789), "1234567.89");
    assert.ok(!centsZuBetrag(123456789).includes(","));
  });

  it("mengeFormat: Viertelstunden bleiben erhalten", () => {
    // Auf ganze Stunden gerundet waere es schlicht eine falsche Rechnung.
    assert.equal(mengeFormat(40), "40.00");
    assert.equal(mengeFormat(5.5), "5.50");
    assert.equal(mengeFormat(7.25), "7.25");
    assert.equal(mengeFormat(0.75), "0.75");
  });

  it("steuerkategorie: Regelsatz S, Reverse Charge nur auf ausdrueckliche Angabe", () => {
    // § 13b UStG greift bei Arbeitnehmerueberlassung NICHT automatisch.
    assert.equal(steuerkategorie(19), "S");
    assert.equal(steuerkategorie(19, { reverseCharge: true }), "AE");
    assert.equal(steuerkategorie(0), "E");
  });
});

describe("eRechnung — Datumsgrenze in Europe/Berlin", () => {
  it("zuIsoDatum: Monatswechsel wird nach Ortszeit entschieden, nicht nach UTC", () => {
    // 28.02.2026 23:30 UTC ist in Berlin bereits der 01.03.2026 00:30.
    // Ein roher toISOString().slice(0,10) ergaebe "2026-02-28" — der Beleg landete
    // im falschen Voranmeldungszeitraum.
    assert.equal(zuIsoDatum("2026-02-28T23:30:00Z"), "2026-03-01");
    assert.equal(new Date("2026-02-28T23:30:00Z").toISOString().slice(0, 10), "2026-02-28");
  });

  it("zuIsoDatum: Sommerzeit — 30.06. 22:30 UTC ist in Berlin der 01.07.", () => {
    assert.equal(zuIsoDatum("2026-06-30T22:30:00Z"), "2026-07-01");
  });

  it("zuIsoDatum: reines Datum bleibt unveraendert", () => {
    assert.equal(zuIsoDatum("2026-07-06"), "2026-07-06");
  });

  it("zuIsoDatum: leere und unbrauchbare Werte ergeben null", () => {
    assert.equal(zuIsoDatum(null), null);
    assert.equal(zuIsoDatum(""), null);
    assert.equal(zuIsoDatum("kein Datum"), null);
  });
});

describe("eRechnung — Maskierung von Freitext", () => {
  it("xmlText: kaufmaennisches Und und spitze Klammern werden maskiert", () => {
    // Ein einzelnes "&" in einem Firmennamen macht die Datei beim Empfaenger unlesbar.
    assert.equal(xmlText("Meier & Sohn"), "Meier &amp; Sohn");
    assert.equal(xmlText("<script>"), "&lt;script&gt;");
    assert.equal(xmlText('Zoll "Nord"'), "Zoll &quot;Nord&quot;");
  });

  it("xmlText: Steuerzeichen werden entfernt, Umbruch und Tabulator bleiben", () => {
    assert.equal(xmlText("A\x00B\x07C"), "ABC");
    assert.equal(xmlText("Zeile1\nZeile2\tEnde"), "Zeile1\nZeile2\tEnde");
  });

  it("xmlText: Firmenname mit Sonderzeichen landet maskiert im Dokument", () => {
    const xml = baueXRechnung(baueRechnungsdokument({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, name: "Meier & Sohn <GmbH>" },
      kaeufer: KAEUFER
    }));
    assert.ok(xml.includes("Meier &amp; Sohn &lt;GmbH&gt;"));
    assert.ok(!xml.includes("Meier & Sohn <GmbH>"));
    pruefeWohlgeformt(xml);
  });
});

/* ═══════════════════════════════════════════════════════════
   Dokumentaufbau
   ═══════════════════════════════════════════════════════════ */

describe("eRechnung — Rechnungsrichtung", () => {
  it("Der Lieferant ist der Verkaeufer, die auftraggebende Firma der Kaeufer", () => {
    // In der Zeitarbeit laeuft die Rechnung immer von der ueberlassenden Firma
    // zum entleihenden Unternehmen. Vertauscht waere sie fachlich falsch.
    const d = dok();
    assert.equal(d.verkaeufer.name, "Nordlicht Personal GmbH");
    assert.equal(d.kaeufer.name, "Werkbau Industrie AG");
  });

  it("Landeskennzeichen faellt auf DE zurueck, wenn nicht gepflegt", () => {
    const d = baueRechnungsdokument({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, billing_country_code: null }, kaeufer: KAEUFER
    });
    assert.equal(d.verkaeufer.land, "DE");
  });

  it("Kaeuferreferenz nutzt die Bestellnummer, sonst ersatzweise die Rechnungsnummer", () => {
    assert.equal(dok().kaeuferreferenz, "BST-2026-8891");
    assert.equal(dok({ reference_number: null }).kaeuferreferenz, "TC-2026-001042");
  });

  it("Positionen uebernehmen Menge, Einzelpreis und Leistungszeitraum", () => {
    const d = dok();
    assert.equal(d.positionen.length, 2);
    assert.equal(d.positionen[0].nummer, "1");
    assert.equal(d.positionen[0].menge, 40);
    assert.equal(d.positionen[0].einheit, "HUR"); // Stunde nach UN/ECE Rec 20
    assert.equal(d.positionen[1].menge, 5.5);
    assert.equal(d.positionen[0].zeitraumVon, "2026-07-06");
  });
});

describe("eRechnung — Rabatt auf Dokumentebene", () => {
  const mitRabatt = {
    gross_amount_cents: 132700,
    discount_pct: 6,
    discount_amount_cents: 7962,
    discount_source: "bounty",
    amount_cents: 124738,
    tax_amount_cents: 23700,
    total_cents: 148438
  };

  it("Positionssumme, Nachlass und Netto werden getrennt ausgewiesen", () => {
    // Ohne diese Trennung schlaegt jede Rechnung mit Rabatt die Pruefregel BR-13.
    const d = dok(mitRabatt);
    assert.equal(d.summen.positionssummeCents, 132700); // BT-106
    assert.equal(d.summen.nachlaesseCents, 7962);       // BT-107
    assert.equal(d.summen.nettoCents, 124738);          // BT-109
    assert.equal(d.rabatt.grund, "Treue-Bonus");        // BT-97
  });

  it("Rechnung mit Rabatt ist rechnerisch schluessig", () => {
    const { vollstaendig, fehlend } = pruefePflichtfelder(dok(mitRabatt));
    assert.equal(vollstaendig, true, `Unerwartet bemaengelt: ${JSON.stringify(fehlend)}`);
  });

  it("Ohne Rabatt entspricht die Positionssumme dem Netto", () => {
    const d = dok();
    assert.equal(d.rabatt, null);
    assert.equal(d.summen.positionssummeCents, d.summen.nettoCents);
    assert.equal(d.summen.nachlaesseCents, 0);
  });

  it("Fehlt gross_amount_cents (Altbestand), wird die Positionssumme rekonstruiert", () => {
    const d = dok({ ...mitRabatt, gross_amount_cents: null });
    assert.equal(d.summen.positionssummeCents, 132700); // 124738 + 7962
  });
});

/* ═══════════════════════════════════════════════════════════
   Pflichtfeldpruefung
   ═══════════════════════════════════════════════════════════ */

describe("eRechnung — Pflichtfelder", () => {
  it("Vollstaendig gepflegte Stammdaten ergeben keine Beanstandung", () => {
    const { vollstaendig, fehlend } = pruefePflichtfelder(dok());
    assert.equal(vollstaendig, true, `Unerwartet bemaengelt: ${JSON.stringify(fehlend)}`);
  });

  it("Fehlende Anschrift wird mit Feldnummer und Fundort benannt", () => {
    // Ein Empfaengersystem meldet nur "BR-08". Damit kann im Buero niemand etwas anfangen.
    const d = baueRechnungsdokument({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, billing_street: null, billing_city: null },
      kaeufer: KAEUFER
    });
    const { vollstaendig, fehlend } = pruefePflichtfelder(d);
    assert.equal(vollstaendig, false);
    const strasse = fehlend.find((f) => f.bt === "BT-35");
    assert.ok(strasse, "BT-35 (Strasse) wurde nicht gemeldet");
    assert.match(strasse.feld, /Strasse/);
    assert.match(strasse.hinweis, /Firmenstammdaten/);
    assert.ok(fehlend.some((f) => f.bt === "BT-37"), "BT-37 (Ort) wurde nicht gemeldet");
  });

  it("Ohne USt-IdNr. UND ohne Steuernummer wird der Rechnungssteller bemaengelt", () => {
    const d = baueRechnungsdokument({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, vat_id: null, tax_id: null }, kaeufer: KAEUFER
    });
    const { fehlend } = pruefePflichtfelder(d);
    assert.ok(fehlend.some((f) => f.bt === "BT-31"));
  });

  it("Steuernummer allein genuegt — sie ist die zulaessige Alternative", () => {
    const d = baueRechnungsdokument({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, vat_id: null }, kaeufer: KAEUFER
    });
    assert.equal(pruefePflichtfelder(d).vollstaendig, true);
  });

  it("Ein Entwurf ohne Rechnungsdatum wird abgewiesen", () => {
    const d = dok({ issued_at: null, created_at: null });
    const { fehlend } = pruefePflichtfelder(d);
    assert.ok(fehlend.some((f) => f.bt === "BT-2"));
  });

  it("Rechnung ohne Position ist ungueltig", () => {
    const d = baueRechnungsdokument({
      invoice: { ...RECHNUNG, gross_amount_cents: 0, amount_cents: 0, tax_amount_cents: 0, total_cents: 0 },
      items: [], verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.ok(pruefePflichtfelder(d).fehlend.some((f) => f.bt === "BG-25"));
  });
});

describe("eRechnung — rechnerische Schluessigkeit", () => {
  it("Positionssumme, die nicht zu den Positionen passt, faellt auf (BR-CO-10)", () => {
    const d = dok({ gross_amount_cents: 999999, amount_cents: 999999 });
    const { fehlend } = pruefePflichtfelder(d);
    assert.ok(fehlend.some((f) => f.bt === "BR-CO-10"));
  });

  it("Netto, das nicht Positionssumme minus Nachlass ist, faellt auf (BR-13)", () => {
    const d = dok({ amount_cents: 120000 }); // ohne passenden Rabatt
    const { fehlend } = pruefePflichtfelder(d);
    assert.ok(fehlend.some((f) => f.bt === "BR-13"));
  });

  it("Brutto, das nicht Netto plus Steuer ist, faellt auf (BR-CO-15)", () => {
    const d = dok({ total_cents: 160000 });
    const { fehlend } = pruefePflichtfelder(d);
    const treffer = fehlend.find((f) => f.bt === "BR-CO-15");
    assert.ok(treffer);
    // Die Meldung nennt beide Betraege im Klartext, nicht nur die Regelnummer.
    assert.match(treffer.hinweis, /1579\.13/);
    assert.match(treffer.hinweis, /1600\.00/);
  });
});

/* ═══════════════════════════════════════════════════════════
   XRechnung (UBL 2.1)
   ═══════════════════════════════════════════════════════════ */

describe("XRechnung — UBL 2.1", () => {
  const xml = baueXRechnung(dok());

  it("ist wohlgeformt", () => {
    const { elemente } = pruefeWohlgeformt(xml);
    assert.ok(elemente > 40, `zu wenige Elemente: ${elemente}`);
  });

  it("traegt die XRechnung-Kennung und das Peppol-Profil", () => {
    assert.equal(inhalt(xml, "cbc:CustomizationID"), XRECHNUNG_CUSTOMIZATION);
    assert.ok(inhalt(xml, "cbc:ProfileID").startsWith("urn:fdc:peppol.eu"));
  });

  it("nennt Nummer, Datum, Faelligkeit, Art und Waehrung", () => {
    assert.equal(inhalt(xml, "cbc:ID"), "TC-2026-001042");        // BT-1
    assert.equal(inhalt(xml, "cbc:IssueDate"), "2026-07-15");      // BT-2
    assert.equal(inhalt(xml, "cbc:DueDate"), "2026-07-29");        // BT-9
    assert.equal(inhalt(xml, "cbc:InvoiceTypeCode"), "380");       // BT-3 Handelsrechnung
    assert.equal(inhalt(xml, "cbc:DocumentCurrencyCode"), "EUR");  // BT-5
    assert.equal(inhalt(xml, "cbc:BuyerReference"), "BST-2026-8891"); // BT-10
  });

  it("fuehrt beide Parteien mit vollstaendiger Anschrift", () => {
    assert.ok(xml.includes("<cac:AccountingSupplierParty>"));
    assert.ok(xml.includes("<cac:AccountingCustomerParty>"));
    assert.ok(xml.includes("Hafenstrasse 12"));   // BT-35
    assert.ok(xml.includes("<cbc:PostalZone>20457</cbc:PostalZone>")); // BT-38
    assert.ok(xml.includes("Industriering 4"));   // BT-50
    assert.ok(xml.includes("<cbc:AdditionalStreetName>Tor 3</cbc:AdditionalStreetName>")); // BT-51
    assert.ok(xml.includes("DE123456789"));       // BT-31
    assert.ok(xml.includes("HRB 98765"));         // BT-30
  });

  it("weist die Steuer als Summe und als Aufgliederung aus", () => {
    assert.ok(xml.includes("<cbc:TaxableAmount currencyID=\"EUR\">1327.00</cbc:TaxableAmount>")); // BT-116
    assert.ok(xml.includes("<cbc:Percent>19</cbc:Percent>"));  // BT-119
    assert.ok(xml.includes("<cbc:ID>S</cbc:ID>"));             // BT-118 Regelsatz
    const steuerbetraege = alleInhalte(xml, "cbc:TaxAmount");
    assert.deepEqual(steuerbetraege, ["252.13", "252.13"]);    // BT-110 und BT-117
  });

  it("die Gesamtsummen gehen auf", () => {
    assert.ok(xml.includes("<cbc:LineExtensionAmount currencyID=\"EUR\">1327.00</cbc:LineExtensionAmount>")); // BT-106
    assert.ok(xml.includes("<cbc:TaxExclusiveAmount currencyID=\"EUR\">1327.00</cbc:TaxExclusiveAmount>"));   // BT-109
    assert.ok(xml.includes("<cbc:TaxInclusiveAmount currencyID=\"EUR\">1579.13</cbc:TaxInclusiveAmount>"));   // BT-112
    assert.ok(xml.includes("<cbc:PayableAmount currencyID=\"EUR\">1579.13</cbc:PayableAmount>"));             // BT-115
  });

  it("jede Position traegt Menge in Stunden, Zeilensumme und Einzelpreis", () => {
    const mengen = alleInhalte(xml, "cbc:InvoicedQuantity");
    assert.deepEqual(mengen, ["40.00", "5.50"]);
    assert.ok(xml.includes('unitCode="HUR"'));   // BT-130
    assert.ok(xml.includes("<cbc:PriceAmount currencyID=\"EUR\">28.50</cbc:PriceAmount>")); // BT-146
    assert.equal((xml.match(/<cac:InvoiceLine>/g) || []).length, 2);
  });

  it("nennt die Zahlungsverbindung", () => {
    assert.ok(xml.includes("<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>")); // SEPA
    assert.ok(xml.includes("DE02120300000000202051"));                          // BT-84
    assert.ok(xml.includes("BYLADEM1001"));                                     // BT-86
  });

  it("Rabatt erscheint als Nachlass auf Dokumentebene", () => {
    const mitRabatt = baueXRechnung(dok({
      gross_amount_cents: 132700, discount_pct: 6, discount_amount_cents: 7962,
      discount_source: "bounty", amount_cents: 124738, tax_amount_cents: 23700, total_cents: 148438
    }));
    pruefeWohlgeformt(mitRabatt);
    assert.ok(mitRabatt.includes("<cbc:ChargeIndicator>false</cbc:ChargeIndicator>"));
    assert.ok(mitRabatt.includes("<cbc:Amount currencyID=\"EUR\">79.62</cbc:Amount>"));          // BT-92
    assert.ok(mitRabatt.includes("<cbc:BaseAmount currencyID=\"EUR\">1327.00</cbc:BaseAmount>")); // BT-93
    assert.ok(mitRabatt.includes("<cbc:AllowanceTotalAmount currencyID=\"EUR\">79.62</cbc:AllowanceTotalAmount>")); // BT-107
    assert.ok(mitRabatt.includes("Treue-Bonus"));                                                 // BT-97
  });

  it("ohne Rabatt fehlt der Nachlassblock vollstaendig", () => {
    assert.ok(!xml.includes("<cac:AllowanceCharge>"));
    assert.ok(!xml.includes("AllowanceTotalAmount"));
  });

  it("kein Betrag verwendet ein Komma als Dezimaltrenner", () => {
    const betraege = [
      ...alleInhalte(xml, "cbc:TaxAmount"), ...alleInhalte(xml, "cbc:PayableAmount"),
      ...alleInhalte(xml, "cbc:LineExtensionAmount"), ...alleInhalte(xml, "cbc:PriceAmount")
    ];
    assert.ok(betraege.length > 0);
    for (const b of betraege) assert.match(b, /^\d+\.\d{2}$/, `Betrag nicht normgerecht: ${b}`);
  });
});

/* ═══════════════════════════════════════════════════════════
   ZUGFeRD (CII)
   ═══════════════════════════════════════════════════════════ */

describe("ZUGFeRD — CrossIndustryInvoice", () => {
  const xml = baueZugferdXml(dok());

  it("ist wohlgeformt", () => {
    pruefeWohlgeformt(xml);
  });

  it("traegt die EN-16931-Kennung im Dokumentkontext", () => {
    assert.ok(xml.includes("<rsm:ExchangedDocumentContext>"));
    assert.ok(xml.includes(ZUGFERD_GUIDELINE));
  });

  it("Datumsangaben nutzen das CII-Format 102 (JJJJMMTT)", () => {
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260715</udt:DateTimeString>')); // BT-2
    assert.ok(xml.includes('<udt:DateTimeString format="102">20260710</udt:DateTimeString>')); // BT-74/BT-72
  });

  it("fuehrt Verkaeufer und Kaeufer als Handelspartner", () => {
    assert.ok(xml.includes("<ram:SellerTradeParty>"));
    assert.ok(xml.includes("<ram:BuyerTradeParty>"));
    assert.ok(xml.includes("<ram:PostcodeCode>20457</ram:PostcodeCode>"));
    assert.ok(xml.includes('<ram:ID schemeID="VA">DE123456789</ram:ID>')); // BT-31
  });

  it("die Gesamtsummen gehen auf", () => {
    // ACHTUNG: "ram:LineTotalAmount" vergibt die Norm ZWEIMAL — je Position (BT-131)
    // und noch einmal im Kopf (BT-106). Ein Test, der einfach das erste Vorkommen nimmt,
    // prueft in Wahrheit die erste Rechnungszeile. Deshalb gezielt der Kopfblock.
    const kopf = ausschnitt(xml, "ram:SpecifiedTradeSettlementHeaderMonetarySummation");
    assert.ok(kopf, "Kopf-Summationsblock fehlt");
    assert.equal(inhalt(kopf, "ram:LineTotalAmount"), "1327.00");     // BT-106
    assert.equal(inhalt(kopf, "ram:TaxBasisTotalAmount"), "1327.00"); // BT-109
    assert.equal(inhalt(kopf, "ram:GrandTotalAmount"), "1579.13");    // BT-112
    assert.equal(inhalt(kopf, "ram:DuePayableAmount"), "1579.13");    // BT-115
    assert.ok(kopf.includes('<ram:TaxTotalAmount currencyID="EUR">252.13</ram:TaxTotalAmount>')); // BT-110
  });

  it("die Positionszeilen tragen ihre eigenen Zeilensummen", () => {
    // Gegenprobe zur Doppelbenennung: die Zeilenwerte ergeben zusammen den Kopfwert.
    const zeilenwerte = alleAusschnitte(xml, "ram:SpecifiedTradeSettlementLineMonetarySummation")
      .map((block) => inhalt(block, "ram:LineTotalAmount"));
    assert.deepEqual(zeilenwerte, ["1140.00", "187.00"]);            // BT-131
    const summe = zeilenwerte.reduce((s, b) => s + Math.round(Number(b) * 100), 0);
    assert.equal(summe, 132700);
  });

  it("jede Position traegt Menge, Einzelpreis und Zeilensumme", () => {
    assert.equal((xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g) || []).length, 2);
    const mengen = alleInhalte(xml, "ram:BilledQuantity");
    assert.deepEqual(mengen, ["40.00", "5.50"]);
    assert.ok(xml.includes('unitCode="HUR"'));
  });

  it("Rabatt erscheint als SpecifiedTradeAllowanceCharge", () => {
    const mitRabatt = baueZugferdXml(dok({
      gross_amount_cents: 132700, discount_pct: 6, discount_amount_cents: 7962,
      discount_source: "bounty", amount_cents: 124738, tax_amount_cents: 23700, total_cents: 148438
    }));
    pruefeWohlgeformt(mitRabatt);
    assert.ok(mitRabatt.includes("<ram:SpecifiedTradeAllowanceCharge>"));
    assert.ok(mitRabatt.includes("<udt:Indicator>false</udt:Indicator>"));
    assert.equal(inhalt(mitRabatt, "ram:ActualAmount"), "79.62");          // BT-92
    assert.equal(inhalt(mitRabatt, "ram:AllowanceTotalAmount"), "79.62");  // BT-107
  });

  it("nennt IBAN und BIC in der Zahlungsanweisung", () => {
    assert.equal(inhalt(xml, "ram:IBANID"), "DE02120300000000202051");
    assert.equal(inhalt(xml, "ram:BICID"), "BYLADEM1001");
  });
});

/* ═══════════════════════════════════════════════════════════
   Einstieg erzeugeERechnung
   ═══════════════════════════════════════════════════════════ */

describe("erzeugeERechnung — Einstieg und Fail-closed", () => {
  const basis = { invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER };

  it("liefert XRechnung mit Dateiname und Inhaltstyp", () => {
    const r = erzeugeERechnung({ ...basis, format: "xrechnung" });
    assert.equal(r.ok, true);
    assert.equal(r.format, "xrechnung");
    assert.equal(r.dateiname, "xrechnung-TC-2026-001042.xml");
    assert.equal(r.contentType, "application/xml; charset=utf-8");
    assert.ok(r.xml.includes("<Invoice"));
  });

  it("liefert ZUGFeRD unter dem erwarteten Anhangsnamen", () => {
    const r = erzeugeERechnung({ ...basis, format: "zugferd" });
    assert.equal(r.ok, true);
    // ZUGFeRD erwartet den Anhang im PDF/A-3 genau unter diesem Namen.
    assert.equal(r.dateiname, "factur-x-TC-2026-001042.xml");
    assert.ok(r.xml.includes("<rsm:CrossIndustryInvoice"));
  });

  it("Grossschreibung im Format ist zulaessig", () => {
    assert.equal(erzeugeERechnung({ ...basis, format: "XRechnung" }).ok, true);
  });

  it("unbekanntes Format wird abgewiesen und nennt die erlaubten", () => {
    const r = erzeugeERechnung({ ...basis, format: "edifact" });
    assert.equal(r.ok, false);
    assert.equal(r.fehler, "FORMAT_UNBEKANNT");
    assert.deepEqual(r.erlaubt, RECHNUNGSFORMATE);
  });

  it("bei fehlenden Pflichtfeldern entsteht KEIN Dokument", () => {
    // Eine unvollstaendige E-Rechnung ist schlimmer als gar keine: sie sieht aus wie
    // eine Rechnung, wird aber abgewiesen — und niemand erfaehrt, warum.
    const r = erzeugeERechnung({
      ...basis, verkaeufer: { ...VERKAEUFER, billing_street: null }
    });
    assert.equal(r.ok, false);
    assert.equal(r.fehler, "PFLICHTFELDER_FEHLEN");
    assert.equal(r.xml, undefined);
    assert.ok(r.fehlend.some((f) => f.bt === "BT-35"));
  });

  it("Rechnungsnummer mit Sonderzeichen ergibt einen sicheren Dateinamen", () => {
    // Ein Schraegstrich in der Nummer duerfte niemals als Pfad im Dateinamen landen.
    const r = erzeugeERechnung({
      ...basis, invoice: { ...RECHNUNG, invoice_number: "TC/2026/../42" }
    });
    assert.equal(r.ok, true);
    assert.ok(!r.dateiname.includes("/"));
    assert.equal(r.dateiname, "xrechnung-TC_2026_.._42.xml");
  });
});

/* ═══════════════════════════════════════════════════════════
   Endpunkt GET /invoices/operational/:id/e-rechnung
   ═══════════════════════════════════════════════════════════ */

describe("GET /invoices/operational/:id/e-rechnung — Endpunkt", () => {
  function pool(handler) {
    const calls = [];
    const query = async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      return (handler && handler(String(sql), params)) || { rows: [], rowCount: 0 };
    };
    return { calls, query, connect: async () => ({ query, release() {} }) };
  }

  const RECHNUNGSZEILE = {
    id: "inv-1", ...RECHNUNG, invoice_type: "operational",
    org_id: "org-kaeufer", supplier_org_id: "org-verkaeufer",
    buyer_org_name: "Werkbau Industrie AG", supplier_org_name: "Nordlicht Personal GmbH"
  };

  // Reihenfolge zaehlt: die Rechnungsabfrage nennt "organizations" im JOIN mit.
  const standardPool = (over = {}) => pool((sql) => {
    if (/FROM invoice_items/.test(sql)) return { rows: over.items ?? POSITIONEN };
    if (/FROM invoices/.test(sql)) return { rows: over.invoice === null ? [] : [over.invoice || RECHNUNGSZEILE] };
    if (/FROM organizations/.test(sql)) {
      return { rows: over.orgs ?? [
        { id: "org-verkaeufer", ...VERKAEUFER },
        { id: "org-kaeufer", ...KAEUFER }
      ] };
    }
    return { rows: [] };
  });

  function hole(p) {
    const router = createInvoicesRouter({
      pool: p,
      requireAuth: (_q, _s, n) => n(),
      logger: { info() {}, warn() {}, error() {} },
      requestLimiter: (_q, _s, n) => n()
    });
    const layer = router.stack.find(
      (l) => l.route && l.route.path === "/invoices/operational/:id/e-rechnung"
    );
    assert.ok(layer, "Route ist nicht registriert");
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  async function rufe(p, query = {}, orgId = "org-verkaeufer") {
    const handler = hole(p);
    const antwort = { koerper: null, status: 200, header: {} };
    const res = {
      setHeader: (k, v) => { antwort.header[k] = v; },
      send: (b) => { antwort.koerper = b; return res; },
      status(c) { antwort.status = c; return res; },
      json(o) { antwort.koerper = o; return res; }
    };
    await handler(
      { orgId, params: { id: "inv-1" }, session: { userId: "u1" }, query },
      res,
      (e) => { if (e) throw e; }
    );
    return antwort;
  }

  it("liefert eine XRechnung als XML-Anhang", async () => {
    const a = await rufe(standardPool());
    assert.equal(a.status, 200);
    assert.match(a.header["Content-Type"], /application\/xml/);
    assert.match(a.header["Content-Disposition"], /xrechnung-TC-2026-001042\.xml/);
    assert.ok(String(a.koerper).includes("<Invoice"));
    assert.ok(String(a.koerper).includes(XRECHNUNG_CUSTOMIZATION));
  });

  it("liefert auf Wunsch das ZUGFeRD-Format", async () => {
    const a = await rufe(standardPool(), { format: "zugferd" });
    assert.equal(a.status, 200);
    assert.match(a.header["Content-Disposition"], /factur-x-/);
    assert.ok(String(a.koerper).includes("<rsm:CrossIndustryInvoice"));
  });

  it("holt beide Firmen in EINER Abfrage, nicht in zweien", async () => {
    // Der Aufruf haengt am Download-Pfad und wird pro Rechnung ausgeloest.
    const p = standardPool();
    await rufe(p);
    const orgAbfragen = p.calls.filter((c) => /FROM organizations/.test(c.sql));
    assert.equal(orgAbfragen.length, 1, "Es darf nur eine Firmen-Abfrage geben");
    assert.match(orgAbfragen[0].sql, /ANY\(\$1::uuid\[\]\)/);
    assert.deepEqual(orgAbfragen[0].params[0], ["org-verkaeufer", "org-kaeufer"]);
  });

  it("unbekanntes Format wird abgewiesen und nennt die erlaubten", async () => {
    const a = await rufe(standardPool(), { format: "edifact" });
    assert.equal(a.status, 400);
    assert.equal(a.koerper.error, "FORMAT_UNBEKANNT");
    assert.deepEqual(a.koerper.erlaubt, RECHNUNGSFORMATE);
  });

  it("fehlende Stammdaten ergeben 422 mit der Liste der Felder — kein halbes Dokument", async () => {
    const a = await rufe(standardPool({
      orgs: [
        { id: "org-verkaeufer", ...VERKAEUFER, billing_street: null, vat_id: null, tax_id: null },
        { id: "org-kaeufer", ...KAEUFER }
      ]
    }));
    assert.equal(a.status, 422);
    assert.equal(a.koerper.error, "PFLICHTFELDER_FEHLEN");
    assert.ok(Array.isArray(a.koerper.fehlend));
    assert.ok(a.koerper.fehlend.some((f) => f.bt === "BT-35"), "Strasse nicht gemeldet");
    assert.ok(a.koerper.fehlend.some((f) => f.bt === "BT-31"), "Steuerkennung nicht gemeldet");
    // Die Meldung sagt, WO nachzupflegen ist — nicht nur, dass etwas fehlt.
    assert.match(a.koerper.message, /Firmenstammdaten/);
  });

  it("eine fremde Organisation bekommt 403, nicht die Rechnung", async () => {
    const a = await rufe(standardPool(), {}, "org-fremd");
    assert.equal(a.status, 403);
    assert.equal(a.koerper.error, "ORG_BOUNDARY_VIOLATION");
  });

  it("unbekannte Rechnung ergibt 404", async () => {
    const a = await rufe(standardPool({ invoice: null }));
    assert.equal(a.status, 404);
    assert.equal(a.koerper.error, "NOT_FOUND");
  });

  it("die Gegenseite der Rechnung darf sie ebenfalls abrufen", async () => {
    // Eine operative Rechnung gehoert beiden Seiten — der Entleiher braucht sie
    // fuer seine eigene Buchhaltung genauso wie der Verleiher.
    const a = await rufe(standardPool(), {}, "org-kaeufer");
    assert.equal(a.status, 200);
    assert.ok(String(a.koerper).includes("<Invoice"));
  });
});

/* ═══════════════════════════════════════════════════════════
   Bereitschaftspruefung — bin ich ab 2027 versandfaehig?
   ═══════════════════════════════════════════════════════════ */

describe("pruefeFirmenstammdaten — einzelne Firma", () => {
  it("vollstaendige Stammdaten ergeben keine Beanstandung", () => {
    assert.deepEqual(pruefeFirmenstammdaten(firmaZuPartei(VERKAEUFER), "verkaeufer"), []);
  });

  it("der Rechnungssteller braucht eine steuerliche Kennung, der Empfaenger nicht", () => {
    // Nur die Verkaeuferseite traegt diese Pflicht — beim Kaeufer waere die
    // Forderung schlicht falsch und wuerde gueltige Rechnungen blockieren.
    const ohneKennung = { ...KAEUFER, vat_id: null, tax_id: null };
    const alsVerkaeufer = pruefeFirmenstammdaten(firmaZuPartei(ohneKennung), "verkaeufer");
    const alsKaeufer = pruefeFirmenstammdaten(firmaZuPartei(ohneKennung), "kaeufer");
    assert.ok(alsVerkaeufer.some((f) => f.bt === "BT-31"));
    assert.deepEqual(alsKaeufer, []);
  });

  it("die Feldnummern unterscheiden sich je Rolle", () => {
    const leer = {};
    const v = pruefeFirmenstammdaten(firmaZuPartei(leer), "verkaeufer").map((f) => f.bt);
    const k = pruefeFirmenstammdaten(firmaZuPartei(leer), "kaeufer").map((f) => f.bt);
    assert.ok(v.includes("BT-35"), "Verkaeufer-Strasse ist BT-35");
    assert.ok(k.includes("BT-50"), "Kaeufer-Strasse ist BT-50");
    // Das Land faellt auf DE zurueck und fehlt deshalb nie.
    assert.ok(!v.includes("BT-40"));
  });
});

describe("GET /invoices/e-rechnung/bereitschaft — Endpunkt", () => {
  function orgPool(orgZeile) {
    const calls = [];
    const query = async (sql, params = []) => {
      calls.push({ sql: String(sql), params });
      if (/FROM organizations/.test(String(sql))) {
        return { rows: orgZeile === null ? [] : [orgZeile] };
      }
      return { rows: [] };
    };
    return { calls, query, connect: async () => ({ query, release() {} }) };
  }

  async function rufe(p, orgId = "org-1") {
    const router = createInvoicesRouter({
      pool: p, requireAuth: (_q, _s, n) => n(),
      logger: { info() {}, warn() {}, error() {} }, requestLimiter: (_q, _s, n) => n()
    });
    const layer = router.stack.find(
      (l) => l.route && l.route.path === "/invoices/e-rechnung/bereitschaft"
    );
    assert.ok(layer, "Route ist nicht registriert");
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    const antwort = { koerper: null, status: 200 };
    const res = {
      setHeader() {}, send(b) { antwort.koerper = b; return res; },
      status(c) { antwort.status = c; return res; },
      json(o) { antwort.koerper = o; return res; }
    };
    await handler({ orgId, session: { userId: "u1" }, query: {}, params: {} }, res, (e) => { if (e) throw e; });
    return antwort;
  }

  it("meldet eine vollstaendig gepflegte Firma als versandfaehig", async () => {
    const a = await rufe(orgPool({ id: "org-1", ...VERKAEUFER }));
    assert.equal(a.status, 200);
    assert.equal(a.koerper.bereit, true);
    assert.deepEqual(a.koerper.fehlend, []);
    assert.deepEqual(a.koerper.hinweise, []);
  });

  it("nennt jedes fehlende Pflichtfeld mit Nummer und Klartext", async () => {
    const a = await rufe(orgPool({
      id: "org-1", name: "Halbfertig GmbH",
      billing_city: "Bremen", billing_country_code: "DE"
    }));
    assert.equal(a.koerper.bereit, false);
    const nummern = a.koerper.fehlend.map((f) => f.bt);
    assert.ok(nummern.includes("BT-35"), "Strasse");
    assert.ok(nummern.includes("BT-38"), "Postleitzahl");
    assert.ok(nummern.includes("BT-31"), "Steuerkennung");
    assert.ok(!nummern.includes("BT-37"), "Ort ist gepflegt und darf nicht gemeldet werden");
    for (const f of a.koerper.fehlend) {
      assert.ok(f.feld && f.hinweis, "jeder Eintrag nennt Feld und Fundort");
    }
  });

  it("fehlende Bankverbindung ist ein Hinweis, kein Fehler", async () => {
    // Die Norm verlangt sie nicht — die Rechnung bleibt gueltig.
    const a = await rufe(orgPool({ id: "org-1", ...VERKAEUFER, iban: null }));
    assert.equal(a.koerper.bereit, true);
    assert.equal(a.koerper.hinweise.length, 1);
    assert.equal(a.koerper.hinweise[0].feld, "IBAN");
  });

  it("nennt die gesetzlichen Fristen mit", async () => {
    const a = await rufe(orgPool({ id: "org-1", ...VERKAEUFER }));
    assert.equal(a.koerper.fristen.versandpflicht_ab_800k_umsatz, "2027-01-01");
    assert.equal(a.koerper.fristen.versandpflicht_alle, "2028-01-01");
    assert.equal(a.koerper.fristen.empfangspflicht_seit, "2025-01-01");
  });

  it("ohne Organisationskontext kommt 400, nicht ein stilles Ergebnis", async () => {
    const a = await rufe(orgPool({ id: "org-1", ...VERKAEUFER }), null);
    assert.equal(a.status, 400);
    assert.equal(a.koerper.error, "ORG_REQUIRED");
  });

  it("unbekannte Organisation ergibt 404", async () => {
    const a = await rufe(orgPool(null));
    assert.equal(a.status, 404);
    assert.equal(a.koerper.error, "ORG_NOT_FOUND");
  });

  it("fragt nur die eigene Organisation ab", async () => {
    const p = orgPool({ id: "org-1", ...VERKAEUFER });
    await rufe(p, "org-1");
    const abfragen = p.calls.filter((c) => /FROM organizations/.test(c.sql));
    assert.equal(abfragen.length, 1);
    assert.deepEqual(abfragen[0].params, ["org-1"]);
  });
});
