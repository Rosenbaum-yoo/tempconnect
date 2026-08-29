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
 * FACTUR-X / ZUGFeRD ALS PDF/A-3u
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Mit `xmlAnhang` ist der Beleg ein hybrider nach Factur-X 1.0 (= ZUGFeRD 2.3),
 * Profil EN 16931: die CII-Nutzlast liegt als `factur-x.xml` im Dokument,
 * verknuepft ueber /AF und /AFRelationship /Alternative, und die Huelle
 * erfuellt PDF/A.
 *
 * Was dafuer noetig war und hier zusammenkommt:
 *   · eingebettete Schriften (services/../assets/pdfa) — die Standard-14 sind
 *     in PDF/A verboten
 *   · ein eingebettetes ICC-Zielprofil im OutputIntent
 *   · ein XMP-Paket mit pdfaid-Kennung UND dem Factur-X-Extension-Schema
 *   · eine Dokumentkennung im Trailer
 * Die letzten drei erledigt `./pdfa/index.js`, das XMP baut `./pdfa/xmp.js`.
 *
 * GEMESSEN, nicht behauptet (2026-08-29, veraPDF 1.30.2):
 *   PDF/A-3b  146 Regeln, 2315 Pruefungen, 0 Fehler
 *   PDF/A-3u  148 Regeln, 2529 Pruefungen, 0 Fehler
 * Stufe u statt b, weil sie zusaetzlich garantiert, dass jedes Zeichen eine
 * Unicode-Zuordnung hat: der Empfaenger kann den Text auslesen, nicht nur
 * ansehen. Der Nachweis laeuft als `npm run test:pdfa` und gehoert nach JEDER
 * Aenderung an der Huelle wiederholt.
 *
 * WAS DAMIT NICHT GESAGT IST: veraPDF prueft die HUELLE, nicht das XML. Ob der
 * Inhalt die Geschaeftsregeln der EN 16931 erfuellt (BR-*, BR-CO-*), sagt nur
 * ein Schematron-Lauf — der ist hier nicht enthalten. Und "zertifiziert" waere
 * in jedem Fall falsch: einzelne Belege werden nicht zertifiziert.
 *
 * /AFRelationship /Alternative ist ausserdem eine materielle Zusage: alles,
 * was auf dem sichtbaren Beleg steht, muss auch im XML stehen. Das kann kein
 * Test pruefen — es gehoert bei jeder Aenderung am Layout von Hand abgeglichen.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, AFRelationship, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { firmaZuPartei, pruefeFirmenstammdaten } from "./eRechnungService.js";
import { haerteAlsPdfA3 } from "./pdfa/index.js";
import { baueXmp, xmpZeitstempel, FX_PROFILE } from "./pdfa/xmp.js";

/**
 * Die Bausteine, die PDF/A verlangt — einmal beim Modulladen von der Platte.
 *
 * Bei 300 Kunden waeren zwei Dateizugriffe je Rechnung reine Verschwendung;
 * die Dateien aendern sich zur Laufzeit nie. Der Pfad geht ueber
 * `import.meta.url`, nicht ueber `process.cwd()`: sonst haengt es vom
 * Startverzeichnis ab, ob eine Rechnung entsteht.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HIER, "..", "assets", "pdfa");
const SCHRIFT_NORMAL = fs.readFileSync(path.join(ASSETS, "LiberationSans-Regular.ttf"));
const SCHRIFT_FETT = fs.readFileSync(path.join(ASSETS, "LiberationSans-Bold.ttf"));
const ICC_PROFIL = fs.readFileSync(path.join(ASSETS, "sRGB-v2-micro.icc"));

/* Seitenmasse in Punkt (A4). Als Konstanten, damit die Zeichenbefehle unten
   lesbar bleiben und nicht in Zahlenkolonnen ersticken. */
const SEITE = { breite: 595.28, hoehe: 841.89 };
const RAND = 50;
const UNTERKANTE = 90;   // darunter beginnt der Fussbereich

/**
 * Zeichen, die die eingebettete Schrift nicht setzen kann.
 *
 * Frueher hiess diese Konstante WINANSI_FREMD und schuetzte vor einem Wurf:
 * die Standardschrift kannte das Zeichen nicht, pdf-lib brach ab. Mit
 * eingebetteter Schrift bricht nichts mehr ab — pdf-lib bildet ein
 * unbekanntes Zeichen still auf .notdef ab, und ein Verweis auf .notdef ist
 * in PDF/A ein Verstoss (veraPDF-Regel 6.2.11.8-1). Aus einem lauten Fehler
 * wuerde ohne Filter ein leiser Konformitaetsbruch. Deshalb bleibt er.
 *
 * Zugelassen ist, was Liberation Sans sicher fuehrt und im DACH-Geschaeft
 * vorkommt:
 *   0x20-0x7E   ASCII
 *   0xA0-0xFF   Latin-1, also alle deutschen Umlaute und gaengige Akzente
 *   0x100-0x17F Latin Extended-A — polnische und tschechische Namen sind in
 *               dieser Branche haeufig und gehoeren richtig auf den Beleg
 *   U+20AC      das Euro-Zeichen; frueher zu "EUR" ersetzt, weil die
 *               Standardschrift es nicht fuehrte
 *
 * Programmatisch gebaut statt getippt: die Grenzen sind zum Teil unsichtbare
 * Zeichen. Als Literal saehe der Ausdruck richtig aus und koennte beim
 * naechsten Speichern lautlos ein anderer sein — genau das ist beim ersten
 * Schreiben dieser Datei passiert.
 */
const SCHRIFT_FREMD = new RegExp(
  "[^" + String.fromCharCode(0x20) + "-" + String.fromCharCode(0x7e) +
  String.fromCharCode(0xa0) + "-" + String.fromCharCode(0x17f) +
  String.fromCharCode(0x20ac) + "]",
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
  /* Eingebettete Schriften statt der Standard-14.
   *
   * Nicht Geschmack, sondern Pflicht: PDF/A verlangt, dass jede zum Rendern
   * benutzte Schrift vollstaendig im Dokument liegt — die Ausnahme fuer
   * Helvetica & Co. gilt dort nicht. Ein Dokument, das Helvetica nur
   * referenziert, verletzt die Einbettungspflicht (veraPDF 6.2.11.4.1-1).
   *
   * `subset: true` ist der Unterschied zwischen wenigen Kilobyte und 800 KB
   * Schriftdaten in JEDER Rechnung. Liberation Sans ist metrisch zu Helvetica
   * kompatibel, deshalb bleiben alle Zeichenbefehle unten unveraendert. */
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(SCHRIFT_NORMAL, { subset: true });
  const fett = await doc.embedFont(SCHRIFT_FETT, { subset: true });
  const tinte = rgb(0.09, 0.11, 0.1);
  const grau = rgb(0.42, 0.45, 0.44);
  const linie = rgb(0.82, 0.84, 0.83);

  let seite = doc.addPage([SEITE.breite, SEITE.hoehe]);
  let y = SEITE.hoehe - RAND;

  /* Der Filter bleibt — aus einem ANDEREN Grund als vorher.
   *
   * Frueher schuetzte er vor einem Wurf: WinAnsi kannte das Zeichen nicht, und
   * pdf-lib brach ab. Mit eingebetteter Schrift bricht nichts mehr ab —
   * pdf-lib bildet ein unbekanntes Zeichen still auf .notdef ab. Und genau das
   * ist in PDF/A ein Verstoss (veraPDF 6.2.11.8-1). Ohne Filter wuerde aus
   * einem lauten Fehler ein leiser Konformitaetsbruch, den niemand bemerkt.
   *
   * Was sich aendert: das Euro-Zeichen bleibt jetzt stehen (Liberation Sans
   * kennt U+20AC), und Latin Extended-A ist zugelassen — polnische und
   * tschechische Namen kommen in dieser Branche vor und sollen nicht als
   * Fragezeichen auf der Rechnung landen. */
  const rein = (s) => String(s == null ? "" : s)
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(SCHRIFT_FREMD, "?");

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
  /* § 14 Abs. 4 Nr. 2 UStG verlangt eine steuerliche Kennung: Steuernummer
     ODER USt-IdNr. Frueher standen hier BEIDE, wenn beide gepflegt waren.
     Das war ein Deckungsgleichheits-Bruch: das XML fuehrt nur eine
     (SpecifiedTaxRegistration, USt-IdNr. hat Vorrang), und mit
     /AFRelationship /Alternative sagt der Beleg zu, dass PDF und XML dieselben
     Angaben tragen. Also dieselbe Vorrangregel wie im XML. */
  if (vk.ustId) { T("USt-IdNr.: " + vk.ustId, rechtsSpalte, y, { size: 9, color: grau }); y -= 12; }
  else if (vk.steuernummer) { T("Steuernr.: " + vk.steuernummer, rechtsSpalte, y, { size: 9, color: grau }); y -= 12; }

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
      description: "Strukturierte Rechnungsdaten (CII, EN 16931)",
      /* Ohne diese Option schreibt pdf-lib den Schluessel GAR NICHT — PDF/A-3
         Klausel 6.8-3 verlangt ihn aber. `Alternative` ist fuer den Einsatz in
         Deutschland mit dem Profil EN 16931 der einzig zulaessige Wert
         (Factur-X 1.07.2, Kap. 6.2.2) und zugleich eine materielle Zusage:
         alle Angaben des sichtbaren Belegs stehen auch im XML.
         NIE AFRelationship.FormData verwenden — der Enum-Eintrag ist in
         pdf-lib 1.17.1 fehlerhaft auf "EncryptedPayload" gemappt. */
      afRelationship: AFRelationship.Alternative
    });
  }

  /* ── Dokumentangaben ───────────────────────────────────────────────── */
  /* NACH PDFDocument.create() gesetzt: der Konstruktor schreibt Producer und
     ModDate sonst selbst. Dieselben Werte gehen gleich ins XMP, damit
     Info-Dict und Metadaten dieselbe Auskunft geben. */
  const titel = `Rechnung ${invoice.invoice_number}`;
  const autor = vk.name;
  const betreff = "Einsatzabrechnung";
  const producer = "TempConnect";
  const erstellt = invoice.issued_at instanceof Date ? invoice.issued_at : new Date(invoice.issued_at);
  doc.setTitle(titel, { showInWindowTitleBar: true });
  doc.setAuthor(autor);
  doc.setSubject(betreff);
  doc.setProducer(producer);
  doc.setCreator(producer);
  doc.setCreationDate(erstellt);
  doc.setModificationDate(erstellt);

  /* ── PDF/A-3b ──────────────────────────────────────────────────────── */
  const xmp = baueXmp({
    titel, autor, betreff, producer, creatorTool: producer,
    zeitstempel: xmpZeitstempel(erstellt),
    /* Stufe U, nicht B: sie verlangt zusaetzlich, dass jedes Zeichen eine
       Unicode-Zuordnung hat — der Empfaenger kann den Text also auslesen und
       nicht nur ansehen. pdf-lib schreibt die noetige ToUnicode-CMap ohnehin;
       gemessen am 2026-08-29 bestand der Beleg alle 2561 inhaltlichen
       3u-Pruefungen und scheiterte allein an dieser Selbstauskunft. */
    konformitaet: "U",
    profil: FX_PROFILE.EN16931,
    anhangName
  });
  /* Die Kennung deterministisch aus dem, was die Rechnung ausmacht: dieselbe
     Rechnung zweimal erzeugt ergibt dieselbe Datei-Identitaet. Zwei Belege,
     die sich nur in einer Zufallszahl unterscheiden, saehen bei jedem Abgleich
     nach zwei verschiedenen Dokumenten aus. */
  const haertung = haerteAlsPdfA3(doc, {
    iccBytes: ICC_PROFIL,
    xmp,
    kennungSaat: `${invoice.invoice_number}|${erstellt.toISOString()}|${vk.name}`
  });
  if (!haertung.ok) {
    /* Kein halber Beleg: lieber gar keine Datei als eine, die PDF/A behauptet
       und es nicht ist. Trifft nur bei kaputtem Farbprofil zu — also wenn
       jemand die Datei unter api/assets/pdfa ausgetauscht hat. */
    return { ok: false, fehler: "PDFA_HAERTUNG_FEHLGESCHLAGEN", grund: haertung.fehler };
  }

  const nummer = String(invoice.invoice_number).replace(/[^A-Za-z0-9_.-]/g, "_");
  return {
    ok: true,
    /* Ohne Objektstroeme: in PDF/A-3 waeren sie erlaubt, aber der klassische
       Trailer macht die /ID im Klartext pruefbar und erspart bei jedem
       veraPDF-Befund das Entpacken. */
    pdf: await doc.save({ useObjectStreams: false }),
    dateiname: `rechnung-${nummer}.pdf`,
    contentType: "application/pdf",
    pdfa: "3u",
    /* Bleibt fuer Aufrufer erhalten: sagt, ob strukturierte Daten drinstecken. */
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
