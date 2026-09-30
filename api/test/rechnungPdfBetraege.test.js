/**
 * Die Zahlen auf dem Beleg — nachgerechnet, nicht nur vorhanden.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES DIESE DATEI GIBT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Am 2026-08-29 druckte der Renderer auf JEDER Rechnung einen falschen
 * Endbetrag: 1920,00 EUR statt 2284,80 EUR. Die Umsatzsteuer stand in ihrer
 * eigenen Zeile, fehlte aber in der Summe.
 *
 * Die Ursache war ein Feldname, der das Gegenteil dessen bedeutet, wonach er
 * klingt: `gross_amount_cents` ist NICHT der Bruttobetrag, sondern die
 * Positionssumme vor Rabatt (BT-106). Migration 170 setzt sie beim Anlegen auf
 * `amount_cents` — bei jeder Rechnung ohne Rabatt sind beide identisch, und
 * "Netto" und "Gesamtbetrag" zeigten denselben Wert.
 *
 * Kein bestehender Test hat das gesehen: `pdfaHuelle.test.js` prueft die
 * PDF/A-Struktur, `belegDeckungsgleich.test.js` vergleicht Textfelder. Beide
 * waren gruen, waehrend die Rechnung falsch war. Ein Beleg kann formal
 * einwandfrei sein und trotzdem die falsche Summe nennen.
 *
 * Diese Datei rechnet nach.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WIE HIER GEPRUEFT WIRD
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Der Text eines PDF liegt in komprimierten Zeichenbefehlen. Er wird deshalb
 * entpackt und aus den Tj/TJ-Operatoren zusammengesetzt — das ist umstaendlich,
 * aber der einzige Weg, das zu pruefen, was ein Mensch tatsaechlich SIEHT.
 * Eine Pruefung der Eingabewerte waere hier wertlos: der Fehler lag ja gerade
 * darin, WELCHES Feld gedruckt wurde.
 *
 * Run: node --test --test-force-exit test/rechnungPdfBetraege.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { erzeugeOperativesRechnungsPdf } from "../services/operationalInvoicePdfService.js";

const VERKAEUFER = {
  legal_name: "Muster Zeitarbeit GmbH", name: "Muster Zeitarbeit",
  billing_street: "Weg 12", billing_postal_code: "44135", billing_city: "Dortmund",
  billing_country_code: "DE", vat_id: "DE123456789",
  iban: "DE02120300000000202051", bic: "BYLADEM1001",
};
const KAEUFER = {
  legal_name: "Beispiel Logistik AG", billing_street: "Strasse 3",
  billing_postal_code: "20457", billing_city: "Hamburg",
  billing_country_code: "DE", vat_id: "DE987654321",
};
const POSITIONEN = [
  { worker_name: "A. Kraft", quantity: 40, unit_amount_cents: 4800, total_cents: 192000,
    week_start: "2026-08-03", week_end: "2026-08-09" },
];

/* Die Zahlen des Falls, der den Fehler zeigte: Netto 1920,00, Steuer 364,80,
   Gesamt 2284,80. `gross_amount_cents` traegt bewusst denselben Wert wie
   `amount_cents` — so legt Migration 170 jede Rechnung ohne Rabatt an, und
   genau dort war der Fehler unsichtbar. */
const NETTO = 192000;
const STEUER = 36480;
const GESAMT = NETTO + STEUER;
const RECHNUNG = {
  invoice_number: "2026-0042", status: "issued",
  issued_at: "2026-08-20T10:00:00.000Z", due_at: "2026-09-03T10:00:00.000Z",
  amount_cents: NETTO,          // BT-109
  gross_amount_cents: NETTO,    // BT-106 — Positionssumme, NICHT der Endbetrag
  tax_amount_cents: STEUER,     // BT-110
  total_cents: GESAMT,          // BT-112 / BT-115
  tax_rate_pct: 19,
};

/**
 * Der sichtbare Text eines PDF.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM DAS UMSTAENDLICH IST
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Seit der Beleg PDF/A ist, sind die Schriften EINGEBETTETE SUBSETS. Deren
 * Zeichenbefehle tragen nicht mehr lesbaren Text in Klammern, sondern
 * Glyph-Nummern in spitzen Klammern: `<00290048>` statt `(Netto)`. Eine Suche
 * nach der Zeichenkette findet dort nichts — der erste Anlauf dieses Tests ist
 * genau daran gescheitert und meldete "kein Text", obwohl die Seite voll war.
 *
 * Die Rueckuebersetzung liefert die ToUnicode-CMap, die pdf-lib ohnehin
 * schreibt (dieselbe, die den Beleg zu PDF/A-3u statt nur -3b macht). Sie
 * bildet jede Glyph-Nummer auf ihr Unicode-Zeichen ab.
 *
 * Der Aufwand lohnt: geprueft wird, was ein Mensch auf dem Papier SIEHT. Eine
 * Pruefung der Eingabewerte waere hier wertlos gewesen — der Fehler lag ja
 * gerade darin, WELCHES Feld gedruckt wurde.
 */
async function sichtbarerText(bytes) {
  const doc = await PDFDocument.load(bytes);
  const roh = Buffer.from(await doc.save({ useObjectStreams: false })).toString("latin1");

  const stroeme = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(roh)) !== null) {
    try { stroeme.push(zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1")); } catch { /* kein Flate */ }
  }
  const inhalt = stroeme.join("\n");

  const objektKoerper = new Map();
  for (const obj of roh.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)) {
    objektKoerper.set(obj[1], obj[2]);
  }

  /** Den Stream eines Objekts entpacken. */
  const streamVon = (nr) => {
    const koerper = objektKoerper.get(nr);
    if (!koerper) return null;
    const m = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(koerper);
    if (!m) return null;
    try { return zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); }
    catch { return m[1]; }
  };

  /** Aus einem CMap-Text die Zuordnung Glyph -> Zeichen bauen. */
  const tabelleAus = (text) => {
    const tabelle = new Map();
    if (!text) return tabelle;
    for (const b of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        tabelle.set(p[1].toUpperCase(), String.fromCharCode(parseInt(p[2].slice(0, 4), 16)));
      }
    }
    for (const b of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const von = parseInt(p[1], 16), bis = parseInt(p[2], 16), ziel = parseInt(p[3].slice(0, 4), 16);
        for (let i = von; i <= bis && i - von < 512; i++) {
          tabelle.set(i.toString(16).toUpperCase().padStart(4, "0"), String.fromCharCode(ziel + (i - von)));
        }
      }
    }
    return tabelle;
  };

  /* Jede CMap im Dokument als eigene Tabelle. Welche zu welcher Schrift
     gehoert, wird bewusst NICHT aufgeloest: die Verweiskette ueber die
     Objektkoerper zu verfolgen scheitert daran, dass Streams Binaerdaten
     enthalten, in denen "endobj" zufaellig vorkommen kann.
     Stattdessen wird jeder Textbefehl mit ALLEN Tabellen gelesen und jede
     Lesart in den Text aufgenommen. Fuer die Frage "steht dieser Betrag auf
     dem Beleg" genuegt das: eine Zahlenfolge wie "2.284,80" entsteht nicht
     zufaellig aus einer falschen Tabelle. Eine Lesart, die nichts ergibt,
     liefert eine leere Zeichenkette und stoert nicht. */
  const tabellen = stroeme
    .filter((s) => /beginbfchar|beginbfrange/.test(s))
    .map(tabelleAus)
    .filter((t) => t.size > 0);

  const teile = [];
  for (const t of inhalt.matchAll(/<([0-9A-Fa-f]+)>\s*Tj|\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
    if (t[2] !== undefined) { teile.push(t[2].replace(/\\([()\\])/g, "$1")); continue; }
    const hex = t[1];
    for (const tabelle of tabellen) {
      let wort = "";
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        wort += tabelle.get(hex.slice(i, i + 4).toUpperCase()) ?? "";
      }
      if (wort) teile.push(wort);
    }
  }
  return teile.join(" ");
}

/** Cent in die Schreibweise, die auf dem Beleg steht. */
function alsBetrag(cent) {
  return (cent / 100).toFixed(2).replace(".", ",");
}

describe("Die Summen auf dem Beleg", () => {
  let text;

  before(async () => {
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: RECHNUNG, items: POSITIONEN,
      verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true, "das Fixture erzeugt kein PDF: " + JSON.stringify(e.fehlend || e));
    text = await sichtbarerText(e.pdf);
    assert.ok(text.length > 50, "aus dem PDF liess sich kein Text lesen — der Test prueft sonst nichts");
  });

  it("der Nettobetrag steht auf dem Beleg", () => {
    assert.ok(text.includes(alsBetrag(NETTO)), `"${alsBetrag(NETTO)}" fehlt`);
  });

  it("die Umsatzsteuer steht auf dem Beleg", () => {
    assert.ok(text.includes(alsBetrag(STEUER)), `"${alsBetrag(STEUER)}" fehlt`);
  });

  it("DER GESAMTBETRAG IST NETTO PLUS STEUER", () => {
    /* Der eigentliche Befund. Hier stand 1920,00 statt 2284,80 — die Steuer
       war in ihrer Zeile sichtbar und fehlte in der Summe. */
    assert.ok(text.includes(alsBetrag(GESAMT)),
      `der Gesamtbetrag "${alsBetrag(GESAMT)}" steht nicht auf dem Beleg. ` +
      `Gedruckt wurde: ${text.match(/[\d.]+,\d\d/g)?.join(", ") || "keine Betraege"}`);
  });

  it("Netto und Gesamtbetrag sind verschiedene Werte", () => {
    /* Die Gegenprobe zum Feldnamen: `gross_amount_cents` traegt hier denselben
       Wert wie `amount_cents`. Wer es als Endbetrag druckt, bekommt zweimal
       dieselbe Zahl — und der Endbetrag fehlt. */
    assert.ok(text.includes(alsBetrag(GESAMT)),
      "der Endbetrag fehlt — vermutlich wird die Positionssumme statt total_cents gedruckt");
    assert.notEqual(alsBetrag(NETTO), alsBetrag(GESAMT),
      "das Fixture selbst unterscheidet die beiden nicht, dann prueft der Test nichts");
  });

  it("die Rechnung geht auf: was gedruckt ist, ergibt in Summe den Endbetrag", () => {
    assert.equal(RECHNUNG.amount_cents + RECHNUNG.tax_amount_cents, RECHNUNG.total_cents,
      "schon das Fixture geht nicht auf — dann prueft dieser Test nichts");
  });

  it("ein Rabatt aendert nichts an der Rechenprobe", async () => {
    /* Mit Rabatt weichen Positionssumme (BT-106) und Netto (BT-109)
       auseinander — genau dann zeigt sich, ob das richtige Feld gedruckt wird. */
    const mitRabatt = {
      ...RECHNUNG,
      gross_amount_cents: 200000,   // Positionssumme vor Rabatt
      amount_cents: NETTO,          // Netto nach Rabatt
      discount_amount_cents: 8000,
    };
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: mitRabatt, items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true);
    const t = await sichtbarerText(e.pdf);
    assert.ok(t.includes(alsBetrag(GESAMT)), "der Endbetrag fehlt bei einer Rechnung mit Rabatt");
    assert.ok(!t.includes(alsBetrag(200000)),
      "die Positionssumme vor Rabatt steht im Summenblock — das ist BT-106, nicht der Endbetrag");
  });

  it("der Steuersatz steht bei der Steuerzeile", () => {
    assert.match(text, /Umsatzsteuer \(19 %\)/,
      "ohne den Satz kann der Empfaenger die Steuer nicht nachvollziehen (§ 14 Abs. 4 Nr. 8 UStG)");
  });
});

describe("Der Renderer liest die richtigen Felder", () => {
  it("nutzt total_cents fuer den Endbetrag, nicht gross_amount_cents", async () => {
    /* Direkt am Verhalten geprueft: eine Rechnung, bei der die beiden Felder
       unterschiedliche Werte tragen. Steht die Positionssumme im Summenblock,
       faellt es hier auf. */
    const e = await erzeugeOperativesRechnungsPdf({
      invoice: { ...RECHNUNG, gross_amount_cents: 999900 },
      items: POSITIONEN, verkaeufer: VERKAEUFER, kaeufer: KAEUFER,
    });
    assert.equal(e.ok, true);
    const t = await sichtbarerText(e.pdf);
    assert.ok(!t.includes("9.999,00") && !t.includes("9999,00"),
      "gross_amount_cents landet im Beleg — es ist die Positionssumme, nicht der Endbetrag");
    assert.ok(t.includes(alsBetrag(GESAMT)), "der richtige Endbetrag fehlt");
  });

  it("kommt ohne das nicht existierende net_amount_cents aus", () => {
    /* Die Spalte gibt es im gesamten sql/-Verzeichnis nicht. Ein Ersatzwert
       fuer ein Feld, das nie gefuellt wird, verschleiert nur, welches Feld
       wirklich gelesen wird. */
    const quelle = new URL("../services/operationalInvoicePdfService.js", import.meta.url);
    const inhalt = fs.readFileSync(quelle, "utf8");
    const codeZeilen = inhalt.split(/\r?\n/)
      .filter((z) => { const t = z.trim(); return t && !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*"); })
      .join("\n");
    assert.ok(!/net_amount_cents/.test(codeZeilen),
      "der Renderer liest ein Feld, das die Datenbank nicht kennt");
  });
});
