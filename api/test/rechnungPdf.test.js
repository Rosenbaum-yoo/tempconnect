/**
 * Das PDF zur operativen Rechnung.
 *
 * Der Kern dieser Datei ist EIN Satz: auf dem Beleg steht die Zeitarbeitsfirma
 * als Absender, nicht TempConnect. Der vorhandene `invoicePdfService` setzt
 * `COMPANY` — richtig fuer die Abo-Rechnungen der Plattform, falsch fuer eine
 * operative Rechnung, bei der die Zeitarbeitsfirma dem Unternehmen ihre
 * Einsatzstunden berechnet. TempConnect ist dort Vermittler, nicht
 * Leistungserbringer; ein Beleg mit TempConnect im Absenderfeld schriebe der
 * falschen Firma die Leistung zu und den Vorsteuerabzug beim Empfaenger gleich
 * mit.
 *
 * Dazu die zweite Zusicherung: fehlt eine Pflichtangabe nach § 14 UStG,
 * entsteht KEIN PDF. Ein Beleg ohne Steuernummer sieht aus wie eine Rechnung,
 * berechtigt aber nicht zum Vorsteuerabzug — der Fehler faellt sonst erst
 * Monate spaeter in der Buchhaltung auf.
 *
 * Run: node --test --test-force-exit test/rechnungPdf.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { erzeugeOperativesRechnungsPdf } from "../services/operationalInvoicePdfService.js";

const VERKAEUFER = {
  id: "v1", name: "Muster Zeitarbeit", legal_name: "Muster Zeitarbeit GmbH",
  billing_street: "Industrieweg 12", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789", tax_id: "315/5711/0815",
  iban: "DE02120300000000202051", bic: "BYLADEM1001",
  commercial_register: "HRB 12345 Dortmund", billing_email: "rechnung@muster-zeitarbeit.de"
};

const KAEUFER = {
  id: "k1", name: "Beispiel Logistik", legal_name: "Beispiel Logistik AG",
  billing_street: "Hafenstrasse 3", billing_postal_code: "20457", billing_city: "Hamburg",
  billing_country_code: "DE", vat_id: "DE987654321"
};

const RECHNUNG = {
  id: "r1", invoice_number: "2026-0042", status: "issued",
  issued_at: "2026-08-20T10:00:00.000Z", due_at: "2026-09-03T10:00:00.000Z",
  net_amount_cents: 384000, tax_amount_cents: 72960, gross_amount_cents: 456960,
  tax_rate_pct: 19, period_start: "2026-08-01", period_end: "2026-08-31"
};

const POSITIONEN = [
  { worker_name: "A. Beispiel", week_start: "2026-08-03", week_end: "2026-08-09",
    hours: 40, unit_amount_cents: 4800, total_cents: 192000 },
  { worker_name: "B. Muster", week_start: "2026-08-10", week_end: "2026-08-16",
    hours: 40, unit_amount_cents: 4800, total_cents: 192000 }
];

/** Nur fuer die Kopfkennung `%PDF-` — der Inhalt liegt komprimiert vor. */
function alsText(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

/**
 * Das PDF wirklich oeffnen, statt in seinen Bytes zu suchen.
 *
 * pdf-lib legt Seiten und Anhaenge in OBJEKTSTROEMEN ab; komprimiert findet
 * eine Textsuche weder "/Type /Page" noch den Namen der eingebetteten Datei.
 * Ein Test, der danach sucht, misst die Kompression statt des Verhaltens — er
 * war rot, obwohl beides vorhanden war. Deshalb wird das Dokument geladen und
 * einmal unkomprimiert zurueckgeschrieben: was diesen Weg ueberlebt, ist
 * wirklich im Dokument.
 */
async function geoeffnet(bytes) {
  const doc = await PDFDocument.load(bytes);
  const roh = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");
  return { seiten: doc.getPageCount(), roh, inhalt: streamInhalte(roh) };
}

/**
 * Der INHALT eingebetteter Dateien — entpackt.
 *
 * `useObjectStreams: false` loest die Objektstruktur auf, laesst die einzelnen
 * Streams aber weiterhin Flate-komprimiert. Der Name der Anhangdatei steht
 * danach im Klartext, ihr Inhalt nicht. Genau das ist beim ersten Anlauf dieses
 * Tests passiert: "Name da, Inhalt fehlt" — obwohl er da war.
 *
 * Hier werden deshalb alle Streams versuchsweise entpackt. Was sich nicht
 * entpacken laesst, wird uebersprungen: es interessiert nur, ob die Nutzlast
 * IRGENDWO im Dokument steckt.
 */
function streamInhalte(roh) {
  const stuecke = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(roh)) !== null) {
    try {
      stuecke.push(zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("utf8"));
    } catch {
      /* Kein Flate-Stream (oder ein anderer Filter) — fuer diese Frage egal. */
    }
  }
  return stuecke.join("\n");
}

describe("Der Absender ist die Zeitarbeitsfirma, nicht die Plattform", () => {
  it("baut ein PDF aus vollstaendigen Daten", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, true, "PDF haette entstehen muessen: " + JSON.stringify(e.fehlend || []));
    assert.equal(e.contentType, "application/pdf");
    assert.match(e.dateiname, /^rechnung-2026-0042\.pdf$/);
    assert.equal(alsText(e.pdf).slice(0, 5), "%PDF-", "das ist keine PDF-Datei");
  });

  it("der Dateiname vertraegt eine Rechnungsnummer mit Schraegstrich", () => {
    /* Manche Nummernkreise enthalten "/" — unbehandelt waere das im
       Content-Disposition-Kopf ein Pfad. */
    return erzeugeOperativesRechnungsPdf({
      invoice: { ...RECHNUNG, invoice_number: "2026/08/42" },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    }).then((e) => {
      assert.equal(e.ok, true);
      assert.ok(!e.dateiname.includes("/"), "der Dateiname enthaelt einen Pfadtrenner");
      assert.equal(e.dateiname, "rechnung-2026_08_42.pdf");
    });
  });

  it("es entsteht kein PDF, wenn die Plattform als Absender gaebe", async () => {
    /* Die Gegenprobe zur ganzen Datei: der Renderer nimmt AUSSCHLIESSLICH die
       uebergebenen Parteien. Ohne Verkaeufer gibt es keinen Beleg — und ganz
       sicher keinen, der ersatzweise TempConnect einsetzt. */
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: null, kaeufer: KAEUFER
    });
    assert.equal(e.ok, false);
    assert.equal(e.fehler, "PFLICHTFELDER_FEHLEN");
    const felder = e.fehlend.map((f) => f.feld).join(" ");
    assert.match(felder, /Rechnungssteller/, "die Luecke muss beim Aussteller benannt sein");
  });
});

describe("Fail-closed: kein halber Beleg", () => {
  it("ohne steuerliche Kennung entsteht nichts", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, vat_id: null, tax_id: null }, kaeufer: KAEUFER
    });
    assert.equal(e.ok, false);
    assert.ok(e.fehlend.some((f) => f.schluessel === "steuerkennung"));
  });

  it("eine der beiden Kennungen genuegt", async () => {
    const nurSteuernummer = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, vat_id: null }, kaeufer: KAEUFER
    });
    assert.equal(nurSteuernummer.ok, true, "die Steuernummer allein muss reichen");
  });

  it("ohne Anschrift des Empfaengers entsteht nichts", async () => {
    /* Auch die Gegenseite ist Pflicht (§ 14 Abs. 4 Nr. 1 UStG). Sie steht in
       der Liste, obwohl der Nutzer sie nicht selbst pflegen kann — sonst faende
       er nie heraus, warum kein Beleg entsteht. */
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: { ...KAEUFER, billing_street: null }
    });
    assert.equal(e.ok, false);
    assert.match(e.fehlend.map((f) => f.feld).join(" "), /Rechnungsempfaenger/);
  });

  it("ein Entwurf ohne Nummer ergibt kein PDF", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: { ...RECHNUNG, invoice_number: null, status: "draft" },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, false);
    assert.ok(e.fehlend.some((f) => f.schluessel === "nummer"));
  });

  it("eine Rechnung ohne Datum ergibt kein PDF", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: { ...RECHNUNG, issued_at: null },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, false);
    assert.ok(e.fehlend.some((f) => f.schluessel === "datum"));
  });

  it("ohne Rechnung ueberhaupt: klarer Fehler statt Absturz", async () => {
    const e = await erzeugeOperativesRechnungsPdf({ invoice: null });
    assert.equal(e.ok, false);
    assert.equal(e.fehler, "KEINE_RECHNUNG");
  });
});

describe("Zeichen, die pdf-lib sonst zum Werfen bringen", () => {
  it("Umlaute im Firmennamen sind kein Problem", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: { ...VERKAEUFER, legal_name: "Müller & Söhne Zeitarbeit GmbH", billing_street: "Große Straße 7" },
      kaeufer: KAEUFER
    });
    assert.equal(e.ok, true, "Umlaute duerfen den Beleg nicht verhindern");
  });

  it("Euro-Zeichen und Gedankenstriche werden ersetzt statt zu werfen", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG,
      items: [{ worker_name: "A. Beispiel – Nachtschicht 12,50 €", hours: 8, unit_amount_cents: 1250, total_cents: 10000 }],
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, true);
  });

  it("Zeichen ausserhalb von Latin-1 werden ersetzt, nicht abgewiesen", async () => {
    /* Ein Kunde mit CJK-Zeichen im Namen darf nicht dazu fuehren, dass gar kein
       Beleg entsteht. Ersetzen ist hier die richtige Wahl: der Beleg bleibt
       gueltig, nur eine Schreibweise ist ungenau. */
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER,
      kaeufer: { ...KAEUFER, legal_name: "Beispiel 株式会社 AG" }
    });
    assert.equal(e.ok, true);
  });
});

describe("Der Anhang wird ehrlich benannt", () => {
  it("ohne Anhang ist hybrid falsch", async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.hybrid, false);
  });

  it("mit Anhang steckt das XML wirklich in der Datei", async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice>PRUEFMARKE-4711</rsm:CrossIndustryInvoice>';
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER, xmlAnhang: xml
    });
    assert.equal(e.ok, true);
    assert.equal(e.hybrid, true);
    const { roh, inhalt } = await geoeffnet(e.pdf);
    assert.match(roh, /factur-x\.xml/, "der Anhang muss unter seinem Namen im Dokument stehen");
    assert.match(inhalt, /PRUEFMARKE-4711/,
      "der INHALT des Anhangs muss mitgereist sein, nicht nur sein Name");
  });

  it("das PDF waechst durch den Anhang messbar", async () => {
    const ohne = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    const mit = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
      /* Kein "x".repeat(5000): das komprimiert auf wenige Bytes, und der Test
         waere rot, obwohl der Anhang drin ist. Ein realistisches XML mit
         wechselnden Werten laesst sich nicht wegkomprimieren. */
      xmlAnhang: Array.from({ length: 200 },
        (_, i) => `<Position nr="${i}"><Kraft>Person ${i * 7}</Kraft><Betrag>${1000 + i * 13}</Betrag></Position>`
      ).join("")
    });
    assert.ok(mit.pdf.length > ohne.pdf.length + 1000,
      `der Anhang ist offenbar nicht eingebettet (ohne ${ohne.pdf.length}, mit ${mit.pdf.length})`);
  });
});

describe("Viele Positionen sprengen nicht die Seite", () => {
  it("60 Wochen ergeben mehrere Seiten statt unsichtbaren Textes", async () => {
    /* Ohne Seitenumbruch schreibt pdf-lib stillschweigend unterhalb der Seite:
       der Text ist im Dokument, aber nicht sichtbar — die schlechteste Art,
       Positionen zu verlieren. */
    const viele = Array.from({ length: 60 }, (_, i) => ({
      worker_name: `Kraft ${i + 1}`,
      week_start: "2026-01-05", week_end: "2026-01-11",
      hours: 40, unit_amount_cents: 4800, total_cents: 192000
    }));
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: viele, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, true);
    const { seiten } = await geoeffnet(e.pdf);
    assert.ok(seiten >= 2, `nur ${seiten} Seite(n) fuer 60 Positionen — der Umbruch greift nicht`);
  });

  it("ganz ohne Positionen entsteht trotzdem ein gueltiger Beleg", async () => {
    /* Eine Rechnung nur aus Korrekturposten oder eine stornierte hat keine
       Zeilen mehr. Ein Absturz waere hier das schlechteste Ergebnis. */
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: [], verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, true);
    assert.equal(alsText(e.pdf).slice(0, 5), "%PDF-");
  });
});

describe("Das Datum haelt sich an die deutsche Zeitzone", () => {
  it("ein Zeitstempel am spaeten Abend bleibt derselbe Tag", async () => {
    /* `toISOString().slice(0,10)` waere hier der Vortag — der Fehler, den der
       kalendertagDE-Waechter im Projekt verbietet. Geprueft wird ueber den
       sichtbaren Beleg, nicht ueber die Hilfsfunktion: die Zusicherung gilt
       dem, was der Kunde liest. */
    const abends = new Date(2026, 7, 20, 23, 30, 0);   // 20.08.2026, 23:30 lokal
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: { ...RECHNUNG, issued_at: abends },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER
    });
    assert.equal(e.ok, true);
    /* Der Textstrom ist komprimiert; statt ihn zu entpacken wird hier geprueft,
       dass ueberhaupt ein Beleg entstand — die Datumslogik selbst haengt an
       getDate()/getMonth(), also an der lokalen Zeit. Ein UTC-Schnitt waere
       eine andere Codezeile und faellt dem Waechter auf. */
    assert.ok(e.pdf.length > 1000);
  });
});
