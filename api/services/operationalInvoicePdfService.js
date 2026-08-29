/**
 * Das PDF zur operativen Rechnung — Zeitarbeitsfirma an Unternehmen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM NICHT `invoicePdfService.js`
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Der bestehende Renderer setzt `COMPANY` als Absender — die Plattformfirma.
 * Fuer die Abo-Rechnungen von TempConnect an seine Kunden ist das richtig. Fuer
 * eine operative Rechnung ist es falsch, und zwar nicht kosmetisch: dort stellt
 * die ZEITARBEITSFIRMA dem Unternehmen die Einsatzstunden in Rechnung.
 * TempConnect ist Vermittler, nicht Leistungserbringer. Ein PDF mit TempConnect
 * im Absenderfeld waere eine inhaltlich falsche Rechnung — der Empfaenger
 * zoege Vorsteuer bei der falschen Firma, und die Zeitarbeitsfirma haette
 * einen Beleg, der ihre eigene Leistung jemand anderem zuschreibt.
 *
 * Deshalb ein eigener Renderer, der beide Parteien aus den echten Stammdaten
 * nimmt. Die gemeinsame Wahrheit bleibt `eRechnungService`: dieselbe
 * `firmaZuPartei`, dieselbe `pruefeFirmenstammdaten`. Die Regeln, was auf eine
 * Rechnung gehoert, stehen an EINER Stelle — sonst laufen PDF und E-Rechnung
 * auseinander und niemand merkt es, bis ein Finanzamt fragt.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED, WIE BEI DER E-RECHNUNG
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Fehlt eine Pflichtangabe nach § 14 UStG, entsteht KEIN PDF. Stattdessen
 * kommt die Liste der fehlenden Felder zurueck — dieselbe, die die
 * Bereitschaftspruefung auf `integrations.html` anzeigt, und dieselbe, die die
 * Pflegemaske dort schliessen kann.
 *
 * Der bequeme Weg waere, das PDF trotzdem zu bauen und die Luecken leer zu
 * lassen. Das waere die schlechtere Wahl: ein Beleg ohne Steuernummer sieht aus
 * wie eine Rechnung, berechtigt den Empfaenger aber nicht zum Vorsteuerabzug.
 * Der Fehler faellt dann Monaten spaeter in der Buchhaltung auf, nicht hier.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ZUM ANHANG (hybrider Beleg)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `xmlAnhang` bettet die CII-Nutzlast als Datei ins PDF ein. Das ist die
 * Grundlage eines Factur-X/ZUGFeRD-Belegs — aber NICHT dasselbe: ein
 * zertifiziertes ZUGFeRD verlangt zusaetzlich PDF/A-3 (Farbprofil, XMP-
 * Metadaten mit Profilkennung, eingebettete Schriften). Das leistet dieser
 * Renderer nicht, und deshalb behauptet er es auch nirgends.
 *
 * Was der Anhang trotzdem bringt: ein Empfaenger, dessen System eingebettete
 * Rechnungs-XML liest, bekommt die strukturierten Daten mitgeliefert statt nur
 * ein Bild. Wer es nicht liest, sieht ein normales PDF. Beides besser als
 * nichts — und ehrlicher, als ein PDF "ZUGFeRD" zu nennen, das die Norm nicht
 * erfuellt.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { firmaZuPartei, pruefeFirmenstammdaten } from "./eRechnungService.js";

/* Seitenmasse in Punkt (A4). Als Konstanten, damit die Zeichenbefehle unten
   lesbar bleiben und nicht in Zahlenkolonnen ersticken. */
const SEITE = { breite: 595.28, hoehe: 841.89 };
const RAND = 50;
const UNTERKANTE = 90;   // darunter beginnt der Fussbereich

/**
 * Zeichen, die die Standardschrift nicht setzen kann.
 *
 * pdf-lib WIRFT beim Zeichnen eines Zeichens ausserhalb von WinAnsi — das PDF
 * entstuende dann gar nicht, nur weil ein Kunde ein Zeichen im Namen fuehrt,
 * das Helvetica nicht kennt. Erlaubt bleiben ASCII (0x20-0x7E) und Latin-1
 * (0xA0-0xFF), also alle deutschen Umlaute und die gaengigen Akzente.
 *
 * Programmatisch gebaut statt getippt: die Grenzen dieses Bereichs sind zum
 * Teil unsichtbare Zeichen. Als Literal in der Quelldatei saehe der Ausdruck
 * richtig aus und koennte beim naechsten Speichern lautlos ein anderer sein —
 * genau das ist beim ersten Schreiben dieser Datei passiert.
 */
const WINANSI_FREMD = new RegExp(
  "[^" + String.fromCharCode(0x20) + "-" + String.fromCharCode(0x7e) +
  String.fromCharCode(0xa0) + "-" + String.fromCharCode(0xff) + "]",
  "g",
);

/**
 * Baut das PDF.
 *
 * @param {object} arg
 * @param {object} arg.invoice    Rechnung aus `getOperationalInvoice`
 * @param {Array}  arg.items      Positionen (mit worker_name, week_start, hours)
 * @param {object} arg.verkaeufer Organisation des Rechnungsstellers
 * @param {object} arg.kaeufer    Organisation des Empfaengers
 * @param {Buffer|Uint8Array|string} [arg.xmlAnhang]  CII-XML zum Einbetten
 * @param {string} [arg.anhangName]                   Dateiname des Anhangs
 * @returns {Promise<{ok:true, pdf:Uint8Array, dateiname:string, contentType:string}
 *                 | {ok:false, fehler:"PFLICHTFELDER_FEHLEN", fehlend:Array}>}
 */
export async function erzeugeOperativesRechnungsPdf({
  invoice, items = [], verkaeufer, kaeufer, xmlAnhang = null, anhangName = "factur-x.xml"
}) {
  if (!invoice) return { ok: false, fehler: "KEINE_RECHNUNG" };

  const vk = firmaZuPartei(verkaeufer || {});
  const ka = firmaZuPartei(kaeufer || {});

  /* Beide Seiten pruefen, in dieser Reihenfolge: der Rechnungssteller ist die
     strengere Rolle (er braucht zusaetzlich eine steuerliche Kennung), und
     seine Luecken kann der Nutzer selbst schliessen. Die des Empfaengers nicht
     — die stehen trotzdem in der Liste, sonst faende er nie heraus, warum kein
     Beleg entsteht. */
  const fehlend = [
    ...pruefeFirmenstammdaten(vk, "verkaeufer"),
    ...pruefeFirmenstammdaten(ka, "kaeufer")
  ];
  if (!invoice.invoice_number) {
    fehlend.push({
      bt: "BT-1",
      feld: "Rechnungsnummer",
      hinweis: "Ein Entwurf hat noch keine Nummer. Die Nummer entsteht beim Stellen der Rechnung.",
      schluessel: "nummer"
    });
  }
  if (!invoice.issued_at) {
    fehlend.push({
      bt: "BT-2",
      feld: "Rechnungsdatum",
      hinweis: "Das Datum entsteht beim Stellen der Rechnung.",
      schluessel: "datum"
    });
  }
  if (fehlend.length) return { ok: false, fehler: "PFLICHTFELDER_FEHLEN", fehlend };

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const tinte = rgb(0.09, 0.11, 0.1);
  const grau = rgb(0.42, 0.45, 0.44);
  const linie = rgb(0.82, 0.84, 0.83);

  let seite = doc.addPage([SEITE.breite, SEITE.hoehe]);
  let y = SEITE.hoehe - RAND;

  /* WinAnsi kennt kein Euro-Zeichen in Helvetica-Standardkodierung und keine
     Gedankenstriche. Ohne diese Ersetzung wirft pdf-lib beim Zeichnen — das
     PDF entstuende gar nicht, weil ein Kunde "Müller & Söhne – GmbH" heisst. */
  const rein = (s) => String(s == null ? "" : s)
    .replace(/[–—]/g, "-")
    .replace(/€/g, "EUR")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    /* Bereich als Escape, nicht als Literal: ein getipptes "A-y" mit Akzenten
       sieht im Editor richtig aus und kann beim naechsten Speichern lautlos zu
       etwas anderem werden. WinAnsi deckt U+00A0 bis U+00FF ab. */
        .replace(WINANSI_FREMD, "?");

  const T = (s, x, yy, o = {}) => seite.drawText(rein(s), {
    x, y: yy, size: o.size || 10, font: o.f || font, color: o.color || tinte
  });
  const HR = (yy) => seite.drawLine({
    start: { x: RAND, y: yy }, end: { x: SEITE.breite - RAND, y: yy },
    thickness: 0.5, color: linie
  });
  /* Neue Seite, wenn der Platz nicht mehr reicht. Ohne das schreibt pdf-lib
     stillschweigend ausserhalb der Seite: der Text ist dann im Dokument, aber
     unsichtbar — die schlechteste Art, Positionen zu verlieren. */
  const platz = (brauche) => {
    if (y - brauche > UNTERKANTE) return;
    seite = doc.addPage([SEITE.breite, SEITE.hoehe]);
    y = SEITE.hoehe - RAND;
  };

  /* ── Kopf: wer stellt die Rechnung ─────────────────────────────────── */
  T("RECHNUNG", RAND, y, { size: 22, f: fett });
  const rechtsSpalte = SEITE.breite - RAND - 220;
  T(vk.name, rechtsSpalte, y, { size: 10, f: fett });
  y -= 14;
  if (vk.handelsname && vk.handelsname !== vk.name) {
    T(vk.handelsname, rechtsSpalte, y, { size: 9, color: grau }); y -= 12;
  }
  T(vk.strasse, rechtsSpalte, y, { size: 9, color: grau }); y -= 12;
  if (vk.strasse2) { T(vk.strasse2, rechtsSpalte, y, { size: 9, color: grau }); y -= 12; }
  T(`${vk.plz} ${vk.ort}`, rechtsSpalte, y, { size: 9, color: grau }); y -= 12;
  T(vk.land, rechtsSpalte, y, { size: 9, color: grau }); y -= 12;
  /* § 14 Abs. 4 Nr. 2 UStG: Steuernummer ODER USt-IdNr. Beide zu zeigen, wenn
     beide da sind, ist zulaessig und hilft dem Empfaenger bei der Zuordnung. */
  if (vk.ustId) { T("USt-IdNr.: " + vk.ustId, rechtsSpalte, y, { size: 9, color: grau }); y -= 12; }
  if (vk.steuernummer) { T("Steuernr.: " + vk.steuernummer, rechtsSpalte, y, { size: 9, color: grau }); y -= 12; }

  y -= 12; HR(y); y -= 20;

  /* ── Eckdaten ──────────────────────────────────────────────────────── */
  T("Rechnungsnr.", RAND, y, { size: 8, color: grau });
  T("Rechnungsdatum", RAND + 160, y, { size: 8, color: grau });
  T("Faellig", RAND + 290, y, { size: 8, color: grau });
  T("Status", RAND + 390, y, { size: 8, color: grau });
  y -= 13;
  T(invoice.invoice_number, RAND, y, { f: fett });
  T(datum(invoice.issued_at), RAND + 160, y);
  T(datum(invoice.due_at), RAND + 290, y);
  T(String(invoice.status || "issued").toUpperCase(), RAND + 390, y);
  y -= 26;

  /* ── Empfaenger ────────────────────────────────────────────────────── */
  T("RECHNUNGSEMPFAENGER", RAND, y, { size: 8, color: grau }); y -= 14;
  T(ka.name, RAND, y, { f: fett }); y -= 13;
  T(ka.strasse, RAND, y, { size: 9, color: grau }); y -= 12;
  if (ka.strasse2) { T(ka.strasse2, RAND, y, { size: 9, color: grau }); y -= 12; }
  T(`${ka.plz} ${ka.ort}`, RAND, y, { size: 9, color: grau }); y -= 12;
  T(ka.land, RAND, y, { size: 9, color: grau }); y -= 12;
  if (ka.ustId) { T("USt-IdNr.: " + ka.ustId, RAND, y, { size: 9, color: grau }); y -= 12; }

  y -= 10; HR(y); y -= 18;

  /* ── Positionen ────────────────────────────────────────────────────── */
  const spalteMenge = SEITE.breite - RAND - 200;
  const spalteSatz = SEITE.breite - RAND - 130;
  const spalteBetrag = SEITE.breite - RAND - 60;
  const kopfzeile = () => {
    T("Leistung", RAND, y, { size: 8, color: grau });
    T("Stunden", spalteMenge, y, { size: 8, color: grau });
    T("Satz", spalteSatz, y, { size: 8, color: grau });
    T("Betrag", spalteBetrag, y, { size: 8, color: grau });
    y -= 6; HR(y); y -= 15;
  };
  kopfzeile();

  for (const it of items) {
    platz(30);
    if (y === SEITE.hoehe - RAND) kopfzeile();   // frische Seite: Kopfzeile mit
    /* § 14 Abs. 4 Nr. 5 UStG verlangt Menge UND Art der Leistung, Nr. 6 den
       Leistungszeitpunkt. Beides steckt in Kraft + Woche — ohne die Woche
       waere der Zeitraum nur pauschal aus dem Rechnungskopf ablesbar. */
    const wer = it.worker_name || it.description || "Leistung";
    const zeitraum = it.week_start
      ? `${datum(it.week_start)} - ${datum(it.week_end || it.week_start)}`
      : null;
    T(String(wer).slice(0, 46), RAND, y, { size: 9 });
    T(stunden(it), spalteMenge, y, { size: 9 });
    T(betrag(it.unit_amount_cents), spalteSatz, y, { size: 9 });
    T(betrag(it.total_cents ?? it.amount_cents), spalteBetrag, y, { size: 9 });
    y -= 12;
    if (zeitraum) { T("Einsatzwoche " + zeitraum, RAND + 8, y, { size: 8, color: grau }); y -= 13; }
    else y -= 3;
  }

  platz(120);
  y -= 4; HR(y); y -= 16;

  /* ── Summen ────────────────────────────────────────────────────────── */
  const summe = (bezeichnung, cent, dick) => {
    T(bezeichnung, SEITE.breite - RAND - 250, y, {
      size: dick ? 11 : 9, f: dick ? fett : font, color: dick ? tinte : grau
    });
    T(betrag(cent) + " EUR", spalteBetrag, y, { size: dick ? 11 : 9, f: dick ? fett : font });
    y -= dick ? 18 : 14;
  };
  const satz = invoice.tax_rate_pct == null ? 19 : invoice.tax_rate_pct;
  summe("Netto", invoice.net_amount_cents ?? invoice.amount_cents);
  summe(`Umsatzsteuer (${satz} %)`, invoice.tax_amount_cents);
  summe("Gesamtbetrag", invoice.gross_amount_cents ?? invoice.total_cents, true);

  y -= 8; HR(y); y -= 16;

  /* ── Fuss: Zahlungsweg und Zeitraum ───────────────────────────────── */
  if (invoice.period_start || invoice.billing_period_start) {
    T("Abrechnungszeitraum: " +
      datum(invoice.period_start || invoice.billing_period_start) + " - " +
      datum(invoice.period_end || invoice.billing_period_end),
      RAND, y, { size: 8, color: grau });
    y -= 12;
  }
  if (vk.iban) {
    T("Zahlbar auf " + vk.iban + (vk.bic ? "  (BIC " + vk.bic + ")" : ""), RAND, y, { size: 8, color: grau });
    y -= 12;
  }
  if (vk.handelsregister) { T("Handelsregister: " + vk.handelsregister, RAND, y, { size: 8, color: grau }); y -= 12; }
  if (vk.email) { T(vk.email, RAND, y, { size: 8, color: grau }); y -= 12; }

  /* ── Anhang ────────────────────────────────────────────────────────── */
  if (xmlAnhang) {
    const daten = typeof xmlAnhang === "string" ? Buffer.from(xmlAnhang, "utf8") : xmlAnhang;
    await doc.attach(daten, anhangName, {
      mimeType: "text/xml",
      description: "Strukturierte Rechnungsdaten (CII, EN 16931)"
    });
  }

  const nummer = String(invoice.invoice_number).replace(/[^A-Za-z0-9_.-]/g, "_");
  return {
    ok: true,
    pdf: await doc.save(),
    dateiname: `rechnung-${nummer}.pdf`,
    contentType: "application/pdf",
    /* Ehrlich benannt: mit Anhang ist es ein hybrider Beleg, kein
       zertifiziertes ZUGFeRD — dafuer fehlt die PDF/A-3-Konformitaet. */
    hybrid: !!xmlAnhang
  };
}

/* ── Helfer ────────────────────────────────────────────────────────────── */

function betrag(cent) {
  return (Number(cent || 0) / 100).toFixed(2).replace(".", ",");
}

/**
 * Datum in deutscher Schreibweise.
 *
 * Ueber die Bestandteile zusammengesetzt statt per `toLocaleDateString`: der
 * Container laeuft in Europe/Berlin, aber ein Datum aus der Datenbank kommt als
 * UTC-Zeitstempel. `toISOString().slice(0,10)` waere abends der Vortag — der
 * Fehler, den `kalendertagDE` im Projekt verbietet. `getDate()` und Geschwister
 * lesen die LOKALE Zeit und sind damit richtig.
 */
function datum(d) {
  if (!d) return "-";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "-";
  const zwei = (n) => String(n).padStart(2, "0");
  return `${zwei(x.getDate())}.${zwei(x.getMonth() + 1)}.${x.getFullYear()}`;
}

function stunden(it) {
  const h = it.hours ?? it.quantity ?? it.timesheet_total_hours;
  if (h == null) return "-";
  return String(Number(h)).replace(".", ",");
}
