/**
 * Die PDF/A-3u-Huelle und die Factur-X-Verankerung — strukturell geprueft.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DIESE DATEI IST UND WAS SIE NICHT IST
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Sie ist SCHNELLES FEEDBACK, kein Nachweis. Der Nachweis ist veraPDF
 * (`npm run test:pdfa`, 148 Regeln, ueber 7000 Pruefungen). Der braucht Docker
 * und mehrere Sekunden; in jedem Testlauf waere er eine Zumutung.
 *
 * Diese Datei prueft dagegen in Millisekunden die rund 25 Merkmale, an denen
 * eine Aenderung typischerweise scheitert — und sie prueft sie am ECHTEN
 * erzeugten Beleg, nicht an einer Nachbildung. Wer die Huelle anfasst und hier
 * gruen bleibt, hat gute Chancen, auch bei veraPDF gruen zu sein. Umgekehrt
 * gilt nichts: gruen hier heisst NICHT PDF/A-konform.
 *
 * Beides gehoert gefahren, nicht eines statt des anderen.
 *
 * Run: node --test --test-force-exit test/pdfaHuelle.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { erzeugeOperativesRechnungsPdf } from "../services/operationalInvoicePdfService.js";

/* Ein Fixture mit allem, was in der Praxis Aerger macht: Umlaute, ein
   kaufmaennisches Und (zerlegt ein schlecht maskiertes XMP), polnische und
   tschechische Zeichen, ein Euro-Zeichen, ein Gedankenstrich. */
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
  { worker_name: "Jiří Novák – Nachtschicht 12,50 €", week_start: "2026-08-10", week_end: "2026-08-16",
    hours: 40, unit_amount_cents: 4800, total_cents: 192000 },
];
const RECHNUNG = {
  invoice_number: "2026-0042", status: "issued",
  issued_at: "2026-08-20T10:00:00.000Z", due_at: "2026-09-03T10:00:00.000Z",
  gross_amount_cents: 384000, amount_cents: 384000, net_amount_cents: 384000,
  tax_amount_cents: 72960, total_cents: 456960, tax_rate_pct: 19,
  period_start: "2026-08-01", period_end: "2026-08-31",
};
const XML_MARKE = "PRUEFMARKE-4711";
const XML = `<?xml version="1.0" encoding="UTF-8"?><rsm:CrossIndustryInvoice>${XML_MARKE}</rsm:CrossIndustryInvoice>`;

describe("Die erzeugte Huelle", () => {
  let beleg, roh, inhalt, seiten;

  before(async () => {
    beleg = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER, xmlAnhang: XML,
    });
    assert.equal(beleg.ok, true, "das Fixture erzeugt kein PDF: " + JSON.stringify(beleg.fehlend || beleg));
    /* Einmal laden und unkomprimiert zurueckschreiben: pdf-lib legt Objekte in
       Stroemen ab, in den Rohbytes findet eine Textsuche sonst nichts. */
    const doc = await PDFDocument.load(beleg.pdf);
    roh = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");
    seiten = doc.getPageCount();
    const stuecke = [];
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = re.exec(roh)) !== null) {
      try { stuecke.push(zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("utf8")); } catch { /* kein Flate */ }
    }
    inhalt = stuecke.join("\n");
  });

  it("meldet sich selbst als PDF/A-3u", () => {
    assert.equal(beleg.pdfa, "3u");
    assert.equal(beleg.hybrid, true);
  });

  it("traegt eine Dokumentkennung im Trailer", () => {
    /* Ein frisch erzeugtes pdf-lib-Dokument hat KEINE — das ist ein harter
       PDF/A-Verstoss (ISO 19005-2, 6.1.3). */
    assert.match(roh, /\/ID\s*\[\s*<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*\]/,
      "keine oder unvollstaendige /ID im Trailer");
  });

  it("die Kennung ist deterministisch", async () => {
    /* Zwei Belege derselben Rechnung, die sich nur in einer Zufallszahl
       unterscheiden, saehen bei jedem Abgleich nach zwei Dokumenten aus. */
    const zweiter = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER, xmlAnhang: XML,
    });
    const d2 = await PDFDocument.load(zweiter.pdf);
    const roh2 = Buffer.from(await d2.save({ useObjectStreams: false })).toString("latin1");
    const a = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>/.exec(roh);
    const b = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>/.exec(roh2);
    assert.ok(a && b, "keine Kennung gefunden");
    assert.equal(a[1], b[1], "dieselbe Rechnung ergibt zwei verschiedene Kennungen");
  });

  it("hat einen OutputIntent mit eingebettetem Farbprofil", () => {
    assert.match(roh, /\/OutputIntents\s*\[/, "/OutputIntents fehlt oder ist kein Array");
    assert.ok(roh.includes("/S /GTS_PDFA1"),
      "der Subtype muss GTS_PDFA1 sein — auch bei PDF/A-3, es gibt kein GTS_PDFA3");
    assert.match(roh, /\/DestOutputProfile\s+\d+\s+\d+\s+R/,
      "das Profil muss als eingebetteter Strom vorliegen, nicht als Wert");
    assert.ok(!roh.includes("/DestOutputProfileRef"),
      "/DestOutputProfileRef ist verboten — ein externer Verweis genuegt nicht");
    assert.match(roh, /\/N 3/, "der Profilstrom muss die Kanalzahl fuehren");
  });

  it("die Textfelder des OutputIntent sind Strings, keine Namen", () => {
    /* `context.obj("text")` macht daraus einen PDF-NAMEN. Als Name waere
       "sRGB IEC61966-2.1" mit seinen Leerzeichen eine andere Zeichenkette. */
    assert.match(roh, /\/OutputConditionIdentifier\s*\(/,
      "OutputConditionIdentifier steht als Name statt als String im Dokument");
  });

  it("traegt ein XMP-Paket mit der PDF/A-Kennung", () => {
    assert.match(roh, /\/Metadata\s+\d+\s+\d+\s+R/, "/Metadata fehlt im Katalog");
    assert.ok(roh.includes("<pdfaid:part>3</pdfaid:part>"), "pdfaid:part fehlt");
    assert.ok(roh.includes("<pdfaid:conformance>U</pdfaid:conformance>"),
      "die Konformitaetsstufe muss U sein — der Beleg besteht die 3u-Pruefung");
  });

  it("das XMP ist gueltiges XML und maskiert Sonderzeichen", () => {
    const anfang = roh.indexOf("<x:xmpmeta");
    const ende = roh.indexOf("</x:xmpmeta>");
    assert.ok(anfang > 0 && ende > anfang, "kein XMP-Paket im Dokument");
    const xmp = roh.slice(anfang, ende + 12);
    /* Der Firmenname traegt ein "&". Unmaskiert zerlegt es das XMP und damit
       die gesamte Konformitaet — wegen eines kaufmaennischen Und. */
    assert.ok(xmp.includes("&amp;"), "das Und-Zeichen im Firmennamen ist nicht maskiert");
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xmp),
      "im XMP steht ein unmaskiertes &");
  });

  it("die xpacket-Anweisung traegt weder bytes= noch encoding=", () => {
    const zeile = /<\?xpacket begin=[\s\S]{0,120}?\?>/.exec(roh);
    assert.ok(zeile, "keine xpacket-Anweisung");
    assert.ok(!/bytes=/.test(zeile[0]), "bytes= ist in PDF/A nicht zulaessig");
    assert.ok(!/encoding=/.test(zeile[0]), "encoding= ist in PDF/A nicht zulaessig");
  });

  it("das Factur-X-Extension-Schema ist vollstaendig deklariert", () => {
    /* PDF/A verbietet unbekannte XMP-Felder. Ohne diese Deklaration ist das
       Dokument nicht konform, obwohl die Felder inhaltlich richtig sind — die
       haeufigste Fehlerquelle bei selbstgebauten Belegen. */
    assert.ok(roh.includes("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"),
      "die Namespace-URI fehlt oder das abschliessende # fehlt");
    assert.ok(roh.includes("<pdfaSchema:prefix>fx</pdfaSchema:prefix>"), "das Praefix fehlt");
    const anzahl = (roh.match(/<pdfaProperty:name>/g) || []).length;
    assert.equal(anzahl, 4, `es muessen genau vier Eigenschaften deklariert sein, gefunden: ${anzahl}`);
  });

  it("die Factur-X-Felder tragen die normativen Werte", () => {
    assert.ok(roh.includes("<fx:DocumentType>INVOICE</fx:DocumentType>"));
    assert.ok(roh.includes("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>"),
      "der Dateiname im XMP muss mit dem Anhang uebereinstimmen");
    assert.ok(roh.includes("<fx:Version>1.0</fx:Version>"),
      "fx:Version ist die Fassung des Factur-X-Standards (1.0), nicht die von ZUGFeRD");
    assert.ok(roh.includes("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>"),
      'das Profil steht im XMP MIT Leerzeichen ("EN 16931"), anders als der URN im XML');
  });

  it("der Anhang haengt an beiden vorgeschriebenen Stellen", () => {
    /* PDF/A-3 verlangt beides: den klassischen Namensbaum UND das /AF-Array im
       Katalog. Ein Empfaengersystem sucht mal hier, mal dort. */
    assert.ok(roh.includes("/EmbeddedFiles"), "der Namensbaum fehlt");
    assert.match(roh, /\/AF\s*\[/, "das /AF-Array im Katalog fehlt");
  });

  it("der Anhang ist als Alternative gekennzeichnet", () => {
    /* Fuer EN 16931 in Deutschland der einzig zulaessige Wert — und eine
       materielle Zusage: alles auf dem sichtbaren Beleg steht auch im XML. */
    assert.ok(roh.includes("/AFRelationship /Alternative"),
      "/AFRelationship fehlt oder traegt den falschen Wert");
  });

  it("der Anhang heisst factur-x.xml und ist als text/xml deklariert", () => {
    assert.ok(roh.includes("(factur-x.xml)"), "der Dateiname fehlt");
    assert.ok(roh.includes("/text#2Fxml"),
      "der MIME-Typ muss text/xml sein, mit maskiertem Solidus (#2F)");
  });

  it("der INHALT des Anhangs ist wirklich im Dokument", () => {
    assert.ok(inhalt.includes(XML_MARKE),
      "der Anhang traegt zwar einen Namen, aber die Nutzlast fehlt");
  });

  it("alle Schriften sind eingebettet", () => {
    /* Der Kern der ganzen Umstellung. Die Base-14-Ausnahme gilt in PDF/A
       nicht: ein Dokument, das Helvetica nur referenziert, verletzt die
       Einbettungspflicht (veraPDF 6.2.11.4.1-1). */
    assert.match(roh, /\/FontFile2\s+\d+\s+\d+\s+R/, "keine eingebettete Schrift gefunden");
    assert.ok(roh.includes("/FontDescriptor"), "kein FontDescriptor");
    assert.ok(!/\/BaseFont\s*\/Helvetica\b/.test(roh),
      "eine Standard-14-Schrift ist zurueckgerutscht — das bricht die Konformitaet");
    assert.ok(!/\/BaseFont\s*\/(Times|Courier|Symbol|ZapfDingbats)/.test(roh),
      "eine weitere Standardschrift ohne Einbettung");
  });

  it("jede Schrift hat eine Unicode-Zuordnung", () => {
    /* Das ist der Unterschied zwischen Stufe b und u: der Empfaenger kann den
       Text auslesen, nicht nur ansehen. */
    assert.ok(roh.includes("/ToUnicode"), "keine ToUnicode-CMap — dann waere nur Stufe b erreichbar");
  });

  it("enthaelt nichts, was PDF/A verbietet", () => {
    for (const verboten of ["/Encrypt", "/JavaScript", "/Launch", "/Movie", "/Sound", "/RichMedia", "/XFA", "/LZWDecode"]) {
      assert.ok(!roh.includes(verboten), `${verboten} ist in PDF/A nicht zulaessig`);
    }
  });

  it("setzt eine Sprache", () => {
    assert.match(roh, /\/Lang\s*\(de-DE\)/, "die Sprachangabe fehlt");
  });

  it("bricht lange Rechnungen auf mehrere Seiten um", async () => {
    /* Ohne Umbruch schreibt pdf-lib stillschweigend unterhalb der Seite: der
       Text steht im Dokument und ist unsichtbar. */
    const viele = Array.from({ length: 60 }, (_, i) => ({
      worker_name: `Kraft ${i + 1}`, week_start: "2026-01-05", week_end: "2026-01-11",
      hours: 40, unit_amount_cents: 4800, total_cents: 192000,
    }));
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: viele, verkaeufer: VERKAEUFER, kaeufer: KAEUFER, xmlAnhang: XML,
    });
    assert.equal(e.ok, true);
    const d = await PDFDocument.load(e.pdf);
    assert.ok(d.getPageCount() >= 2, `nur ${d.getPageCount()} Seite(n) fuer 60 Positionen`);
    assert.equal(seiten, 1, "das Grundfixture sollte auf eine Seite passen");
  });

  it("bleibt klein genug fuer den taeglichen Versand", () => {
    /* Ohne Subsetting wanderten rund 800 KB Schriftdaten in JEDE Rechnung.
       Diese Grenze faengt ein versehentlich abgeschaltetes subset:true. */
    assert.ok(beleg.pdf.length < 120000,
      `der Beleg ist ${Math.round(beleg.pdf.length / 1024)} KB gross — steckt die ganze Schrift drin statt eines Subsets?`);
  });
});

describe("Ohne XML entsteht trotzdem eine gueltige Huelle", () => {
  it("ein Beleg ohne Anhang ist weiterhin PDF/A", async () => {
    /* Der Fall tritt ein, wenn die Pflichtfeldpruefung der E-Rechnung
       scheitert: dann liefert die Route ein reines PDF. Auch das muss
       konform sein — sonst waere der Ausweichweg schlechter als kein Weg. */
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true);
    assert.equal(e.hybrid, false);
    assert.equal(e.pdfa, "3u");
    const doc = await PDFDocument.load(e.pdf);
    const roh = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");
    assert.match(roh, /\/OutputIntents\s*\[/);
    assert.ok(roh.includes("<pdfaid:part>3</pdfaid:part>"));
    assert.match(roh, /\/FontFile2/);
    assert.ok(!roh.includes("/EmbeddedFiles"), "ohne Anhang darf kein leerer Namensbaum entstehen");
  });
});
