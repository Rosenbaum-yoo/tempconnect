/**
 * eRechnungService — E-Rechnung nach EN 16931 (Integrations-Epic Welle C, Teil 3).
 *
 * WARUM DIESE DATEI
 * Seit dem 01.01.2025 muss jedes inlaendische Unternehmen strukturierte E-Rechnungen
 * EMPFANGEN koennen. Ab dem 01.01.2027 muessen Unternehmen mit mehr als 800.000 EUR
 * Vorjahresumsatz sie auch VERSENDEN, ab dem 01.01.2028 alle (ausser Kleinunternehmer
 * nach § 19 UStG). Ein PDF per Mail ist ausdruecklich keine E-Rechnung — verlangt ist
 * ein strukturiertes, maschinenlesbares Format nach EN 16931.
 *
 * TempConnect erzeugt operative Rechnungen bereits aus freigegebenen Stundenzetteln
 * (operationalInvoiceService) und liefert sie als CSV und PDF aus. Beides ist ab 2027
 * als Rechnungsweg unzulaessig. Diese Datei schliesst genau diese Luecke.
 *
 * ZWEI FORMATE, EIN DOKUMENT
 *   - XRechnung  → UBL 2.1 (`Invoice`). Der Standard der oeffentlichen Verwaltung in
 *                  Deutschland und im B2B weit verbreitet. Reines XML.
 *   - ZUGFeRD    → UN/CEFACT CII (`CrossIndustryInvoice`), Profil EN 16931 ("COMFORT").
 *                  Dasselbe XML wird bei ZUGFeRD zusaetzlich in ein PDF/A-3 eingebettet;
 *                  diese Datei erzeugt den XML-Teil, der dort hineingehoert.
 * Beide entstehen aus DERSELBEN normalisierten Zwischenstruktur (`baueRechnungsdokument`),
 * damit die Formate nicht auseinanderlaufen koennen.
 *
 * PURE FUNKTIONEN — keine DB, kein IO, kein Netz. Damit vollstaendig testbar; der Aufrufer
 * laedt die Rechnung und setzt Content-Type/Dateiname. Ausgabe ist immer UTF-8.
 *
 * BEGRIFFE: Die Norm nummeriert ihre Felder als "Business Terms" (BT-1, BT-2, …). Diese
 * Nummern stehen an jedem erzeugten Element im Kommentar — sie sind die gemeinsame Sprache
 * mit Steuerberatern, Pruefwerkzeugen (KoSIT-Validator, Mustang) und Empfaengersystemen.
 *
 * GRENZE DIESER DATEI: Sie erzeugt ein NORM-konformes Dokument aus den vorhandenen Daten.
 * Sie ersetzt keine steuerliche Beratung — insbesondere Steuersatz und Steuerkategorie
 * verantwortet der Rechnungssteller. Vor dem produktiven Versand gehoert jede Vorlage
 * einmal durch den KoSIT-Pruefwerkzeugkasten.
 */

/** Unterstuetzte Ausgabeformate. */
export const RECHNUNGSFORMATE = ["xrechnung", "zugferd"];

/**
 * XRechnung-Kennung (CustomizationID, BT-24), Fassung 3.0.
 *
 * DER NAMENSRAUM IST `xeinkauf.de`, NICHT `xoev-de`.
 *
 * Hier stand bis zum 2026-08-29 `urn:xoev-de:kosit:standard:xrechnung_3.0` —
 * der alte Namensraum aus der 2.x-Zeit, kombiniert mit der neuen
 * Versionsnummer. Diese Kennung gibt es nicht. Gemessen mit dem
 * KoSIT-Validator 1.6.3: der Bericht meldete `noScenarioMatched`, also wurde
 * KEINE einzige Geschaeftsregel geprueft. Ein Empfaenger haette die Rechnung
 * nicht als XRechnung erkannt.
 *
 * Der Fehler war unsichtbar, weil beide Bestandteile fuer sich richtig
 * aussehen und kein Test die Kennung je gegen eine echte Szenarienliste
 * gehalten hat. Genau das tut jetzt `npm run test:schematron`.
 */
export const XRECHNUNG_CUSTOMIZATION =
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";

/** Peppol-Profil BILLING 01 — der uebliche ProfileID-Wert (BT-23) fuer Rechnungen. */
export const XRECHNUNG_PROFILE = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

/** CII-Kennung fuer das EN-16931-Profil (ZUGFeRD 2.x "COMFORT"). */
export const ZUGFERD_GUIDELINE = "urn:cen.eu:en16931:2017";

/**
 * Rechnungsart (BT-3). 380 = Handelsrechnung nach UNTDID 1001. 381 waere eine Gutschrift.
 */
const TYPCODE_HANDELSRECHNUNG = "380";

/**
 * Mengeneinheit (BT-130) nach UN/ECE Recommendation 20. HUR = Stunde.
 * Zeitarbeit rechnet in Stunden ab; alles andere waere hier die Ausnahme.
 */
const EINHEIT_STUNDE = "HUR";

/** Zahlungsart (BT-81) nach UNTDID 4461. 58 = SEPA-Ueberweisung. */
const ZAHLUNGSART_SEPA = "58";

/* ═══════════════════════════════════════════════════════════
   Formatierung — alles, was in XML landet, geht hier durch
   ═══════════════════════════════════════════════════════════ */

/**
 * XML-Maskierung. Rechnungspositionen tragen Freitext aus der Datenbank
 * (Mitarbeitername, Beschreibung) — ohne Maskierung erzeugt ein einzelnes `&`
 * in einem Firmennamen eine unlesbare Datei beim Empfaenger.
 */
export function xmlText(wert) {
  if (wert === null || wert === undefined) return "";
  return String(wert)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Steuerzeichen sind in XML 1.0 nicht darstellbar und kippen sonst den Parser
    // beim Empfaenger. Tab/Zeilenumbruch bleiben erhalten.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/**
 * Cent → Betrag mit Punkt als Dezimaltrenner und exakt zwei Nachkommastellen.
 * Die Norm verlangt einen Punkt; ein deutsches Komma macht das Dokument ungueltig.
 */
export function centsZuBetrag(cents) {
  const n = Math.round(Number(cents) || 0);
  return (n / 100).toFixed(2);
}

/**
 * Menge → bis zu vier Nachkommastellen, ohne ueberfluessige Nullen am Ende,
 * aber mindestens zwei Stellen (BT-129). Stundenzettel fuehren Viertelstunden;
 * eine auf ganze Zahlen gerundete Menge waere schlicht eine falsche Rechnung.
 */
export function mengeFormat(menge) {
  const n = Number(menge) || 0;
  const feststellig = n.toFixed(4).replace(/(\.\d{2}\d*?)0+$/, "$1");
  return feststellig;
}

/**
 * Datum → "YYYY-MM-DD" (BT-2, BT-9, BT-73/74).
 * Bewusst in Europe/Berlin gelesen: ein UTC-Schnitt macht aus dem Rechnungsdatum
 * 01.03. um 00:30 Ortszeit den 28.02. — ein Beleg im falschen Voranmeldungszeitraum.
 */
export function zuIsoDatum(wert) {
  if (!wert) return null;
  const d = wert instanceof Date ? wert : new Date(wert);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA liefert bereits das ISO-Muster YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

/** Datum → "YYYYMMDD" (CII-Format 102). */
function zuCiiDatum(wert) {
  const iso = zuIsoDatum(wert);
  return iso ? iso.replace(/-/g, "") : null;
}

/**
 * Steuerkategorie (BT-118/BT-151) nach UNTDID 5305.
 *   S  = Regelsteuersatz (Arbeitnehmerueberlassung im Inland: 19 %)
 *   AE = Steuerschuldnerschaft des Leistungsempfaengers (Reverse Charge, § 13b UStG)
 *   E  = steuerbefreit
 * Reverse Charge greift bei Arbeitnehmerueberlassung NICHT automatisch — § 13b UStG
 * erfasst Bauleistungen, nicht die Ueberlassung als solche. Deshalb wird "AE" nur
 * gesetzt, wenn der Rechnungssteller es ausdruecklich angibt.
 */
export function steuerkategorie(satzPct, { reverseCharge = false } = {}) {
  if (reverseCharge) return "AE";
  return Number(satzPct) > 0 ? "S" : "E";
}

/** Satz → Prozentangabe ohne ueberfluessige Nachkommastellen ("19", "7", "16.5"). */
function satzFormat(satzPct) {
  const n = Number(satzPct) || 0;
  return String(Number(n.toFixed(2)));
}

/* ═══════════════════════════════════════════════════════════
   Normalisierung — aus DB-Zeilen wird ein Rechnungsdokument
   ═══════════════════════════════════════════════════════════ */

/**
 * Baut aus Rechnung, Positionen und den beiden Firmen die normalisierte Zwischenstruktur,
 * aus der beide Formate erzeugt werden.
 *
 * RICHTUNG: `supplier_org_id` ist der Leistungserbringer und damit der VERKAEUFER,
 * `org_id` der Rechnungsempfaenger und damit der KAEUFER. Die Rechnung laeuft in der
 * Zeitarbeit immer von der ueberlassenden Firma zum entleihenden Unternehmen.
 *
 * BETRAGSLOGIK (siehe Migration 170): `gross_amount_cents` ist die Summe der Positionen
 * VOR Rabatt, `amount_cents` das Netto NACH Rabatt. Die Norm verlangt beides getrennt:
 * BT-106 (Positionssumme), BT-107 (Nachlaesse), BT-109 (Netto). Ohne diese Trennung
 * schlaegt jede Rechnung mit Rabatt die Pruefregel BR-13 und wird abgewiesen.
 *
 * @param {object} arg
 * @param {object} arg.invoice   Zeile aus `invoices`
 * @param {Array}  arg.items     Zeilen aus `invoice_items`
 * @param {object} arg.verkaeufer Organisation des Leistungserbringers
 * @param {object} arg.kaeufer    Organisation des Rechnungsempfaengers
 * @param {object} [arg.optionen] { reverseCharge, steuerbefreiungsgrund }
 */
export function baueRechnungsdokument({ invoice, items = [], verkaeufer = {}, kaeufer = {}, optionen = {} }) {
  if (!invoice) throw new Error("baueRechnungsdokument: invoice fehlt");

  const waehrung = String(invoice.currency || "EUR").toUpperCase();
  const satzPct = Number(invoice.tax_rate_pct) || 0;
  const kategorie = steuerkategorie(satzPct, optionen);

  const nettoCents = Math.round(Number(invoice.amount_cents) || 0);
  const rabattCents = Math.max(0, Math.round(Number(invoice.discount_amount_cents) || 0));
  // Positionssumme: `gross_amount_cents` fuehrt sie, faellt aber bei Altzeilen aus
  // (die Spalte kam erst mit Migration 170). Dann ist Netto + Rabatt der richtige Wert.
  const positionssummeCents = invoice.gross_amount_cents !== null && invoice.gross_amount_cents !== undefined
    ? Math.round(Number(invoice.gross_amount_cents))
    : nettoCents + rabattCents;

  // Beide Seiten einmal normalisieren — der Zahlungsblock unten greift auf dieselbe
  // Struktur zu wie die Parteiangaben. Zwei Quellen fuer dieselbe Angabe waeren genau
  // die Art Abweichung, die erst beim Empfaenger auffaellt.
  const verkaeuferPartei = firmaZuPartei(verkaeufer);
  const kaeuferPartei = firmaZuPartei(kaeufer);

  const positionen = items.map((it, i) => ({
    nummer: String(i + 1),
    /* Der Name der Kraft, wenn es keinen eigenen Text gibt.
     *
     * Nicht Kosmetik, sondern eine Bedingung des Formats: der Beleg wird mit
     * /AFRelationship /Alternative eingebettet, und das ist die Zusage, dass
     * XML und sichtbares PDF DIESELBEN Angaben tragen ("identisches
     * Mehrstueck", Factur-X 1.07.2 Kap. 5.3). Das PDF nennt in jeder Zeile die
     * Kraft; stuende im XML nur "Leistung", waere die Zusage unwahr — gemessen
     * am 2026-08-29 war genau das der Fall. */
    bezeichnung: it.description || it.worker_name || "Leistung",
    menge: Number(it.quantity) || 0,
    einheit: EINHEIT_STUNDE,
    einzelpreisCents: Math.round(Number(it.unit_amount_cents) || 0),
    zeilensummeCents: Math.round(Number(it.total_cents) || 0),
    zeitraumVon: zuIsoDatum(it.week_start),
    zeitraumBis: zuIsoDatum(it.week_end)
  }));

  return {
    format: null, // wird vom jeweiligen Generator gesetzt
    waehrung,
    nummer: invoice.invoice_number || null,                       // BT-1
    ausstellungsdatum: zuIsoDatum(invoice.issued_at || invoice.created_at), // BT-2
    faelligkeitsdatum: zuIsoDatum(invoice.due_at),                // BT-9
    typcode: TYPCODE_HANDELSRECHNUNG,                             // BT-3
    // BT-10 Kaeuferreferenz: bei XRechnung ein Pflichtfeld. Beste verfuegbare Quelle ist
    // die vom Kunden vergebene Bestell-/Referenznummer; ersatzweise die Rechnungsnummer,
    // damit das Dokument nicht an einem leeren Pflichtfeld scheitert.
    kaeuferreferenz: invoice.reference_number || invoice.invoice_number || null,
    hinweis: invoice.notes || null,                               // BT-22
    /* BEIDE Feldnamen lesen, so wie es der PDF-Renderer tut.
     *
     * Die operativen Rechnungen fuehren den Zeitraum als `period_start/end`,
     * die Abo-Rechnungen als `billing_period_start/end`. Wurde hier nur der
     * zweite Name gelesen, DRUCKTE das PDF den Abrechnungszeitraum und das XML
     * liess ihn weg — bei /AFRelationship /Alternative ist das ein Bruch der
     * Zusage, dass beide Teile dieselben Angaben tragen. Gemessen am
     * 2026-08-29 an einer operativen Rechnung. */
    leistungszeitraumVon: zuIsoDatum(invoice.billing_period_start ?? invoice.period_start), // BT-73
    leistungszeitraumBis: zuIsoDatum(invoice.billing_period_end ?? invoice.period_end),     // BT-74

    verkaeufer: verkaeuferPartei,
    kaeufer: kaeuferPartei,

    zahlung: {
      art: ZAHLUNGSART_SEPA,                                      // BT-81
      iban: verkaeuferPartei.iban,                                // BT-84
      bic: verkaeuferPartei.bic,                                  // BT-86
      bedingungen: invoice.due_at
        ? `Zahlbar ohne Abzug bis ${zuIsoDatum(invoice.due_at)}.`
        : null                                                    // BT-20
    },

    steuer: {
      satzPct,                                                    // BT-119
      kategorie,                                                  // BT-118
      grundlageCents: nettoCents,                                 // BT-116
      betragCents: Math.round(Number(invoice.tax_amount_cents) || 0), // BT-117/BT-110
      befreiungsgrund: kategorie === "E"
        ? (optionen.steuerbefreiungsgrund || "Steuerfreie Leistung")
        : kategorie === "AE"
          ? (optionen.steuerbefreiungsgrund || "Steuerschuldnerschaft des Leistungsempfaengers")
          : null                                                  // BT-120
    },

    rabatt: rabattCents > 0
      ? {
          betragCents: rabattCents,                               // BT-92
          satzPct: Number(invoice.discount_pct) || 0,             // BT-94
          grundlageCents: positionssummeCents,                    // BT-93
          grund: rabattGrundText(invoice.discount_source)         // BT-97
        }
      : null,

    summen: {
      positionssummeCents,                                        // BT-106
      nachlaesseCents: rabattCents,                               // BT-107
      nettoCents,                                                 // BT-109
      bruttoCents: Math.round(Number(invoice.total_cents) || 0),  // BT-112
      zahlbetragCents: Math.round(Number(invoice.total_cents) || 0) // BT-115
    },

    positionen
  };
}

/** Rabattherkunft → Klartext fuer BT-97. Der Beleg muss sagen, warum er niedriger ist. */
function rabattGrundText(quelle) {
  if (!quelle) return "Nachlass";
  const texte = {
    bounty: "Treue-Bonus",
    loyalty: "Treue-Bonus",
    pilot: "Pilotkonditionen",
    individual: "Individuell vereinbarter Nachlass"
  };
  return texte[String(quelle).toLowerCase()] || "Nachlass";
}

/** Organisationszeile → Parteistruktur der Norm. */
export function firmaZuPartei(org = {}) {
  return {
    name: org.legal_name || org.name || null,          // BT-27 / BT-44
    handelsname: org.name || null,                     // BT-28 / BT-45
    strasse: org.billing_street || null,               // BT-35 / BT-50
    strasse2: org.billing_address_2 || null,           // BT-36 / BT-51
    plz: org.billing_postal_code || null,              // BT-38 / BT-53
    ort: org.billing_city || null,                     // BT-37 / BT-52
    land: (org.billing_country_code || "DE").toUpperCase(), // BT-40 / BT-55
    ustId: org.vat_id || null,                         // BT-31 / BT-48
    steuernummer: org.tax_id || null,                  // BT-32
    handelsregister: org.commercial_register || null,  // BT-30
    email: org.billing_email || null,                  // BT-43 / BT-58
    kontakt: org.billing_contact || null,              // BT-41 / BT-56
    /* BT-42: Pflicht fuer XRechnung (BR-DE-6), optional fuer reines EN 16931.
       Bewusst `organizations.billing_phone` und NICHT `users.phone`: die Norm
       meint die Kontaktstelle der FIRMA, nicht die Nummer eines Menschen —
       sonst stuende die private Nummer eines Disponenten auf jeder Rechnung,
       die das Haus verlaesst. (Migration 205) */
    telefon: org.billing_phone || null,                // BT-42 / BT-57
    iban: org.iban || null,                            // BT-84
    bic: org.bic || null                               // BT-86
  };
}

/* ═══════════════════════════════════════════════════════════
   Pflichtfeldpruefung — sagen, WAS fehlt, nicht nur DASS
   ═══════════════════════════════════════════════════════════ */

/**
 * Feldnummern der Norm je Rolle. Verkaeufer und Kaeufer tragen dieselben Angaben,
 * die Norm vergibt dafuer aber unterschiedliche Nummern.
 */
const PARTEI_FELDER = {
  verkaeufer: { rolle: "Rechnungssteller",     name: "BT-27", strasse: "BT-35", ort: "BT-37", plz: "BT-38", land: "BT-40" },
  kaeufer:    { rolle: "Rechnungsempfaenger", name: "BT-44", strasse: "BT-50", ort: "BT-52", plz: "BT-53", land: "BT-55" }
};

/**
 * Prueft die Stammdaten EINER Firma gegen die Pflichtangaben der Norm.
 *
 * Eigenstaendig aufrufbar, damit eine Firma ihre Versandfaehigkeit pruefen kann,
 * BEVOR die erste Rechnung entsteht — die Frist zum 01.01.2027 laesst niemandem Zeit,
 * das am Tag der ersten abgewiesenen Rechnung zu merken. `pruefePflichtfelder` benutzt
 * dieselbe Funktion, damit die Regeln nicht an zwei Stellen gepflegt werden muessen.
 *
 * Jeder Eintrag traegt zusaetzlich einen `schluessel`: einen stabilen,
 * maschinenlesbaren Bezeichner des fehlenden Feldes. Der Klartext in `feld` ist
 * fuer Menschen und darf sich aendern; eine Oberflaeche, die das fehlende
 * Eingabefeld markieren will, braucht etwas, das sich NICHT aendert. Bewusst
 * kein DB-Spaltenname — diese Funktion soll nicht wissen muessen, woher die
 * Daten kommen.
 *
 * @param {object} partei Ergebnis von `firmaZuPartei`
 * @param {"verkaeufer"|"kaeufer"} rolle
 * @returns {Array<{bt: string, feld: string, hinweis: string, schluessel: string}>}
 */
export function pruefeFirmenstammdaten(partei, rolle = "verkaeufer") {
  const f = PARTEI_FELDER[rolle] || PARTEI_FELDER.verkaeufer;
  const wo = `Firmenstammdaten des ${f.rolle}s`;
  const fehlend = [];
  const fehlt = (bt, feld, schluessel) =>
    fehlend.push({ bt, feld: `${f.rolle}: ${feld}`, hinweis: wo, schluessel });

  if (!partei?.name) fehlt(f.name, "Name", "name");
  if (!partei?.strasse) fehlt(f.strasse, "Strasse", "strasse");
  if (!partei?.ort) fehlt(f.ort, "Ort", "ort");
  if (!partei?.plz) fehlt(f.plz, "Postleitzahl", "plz");
  if (!partei?.land) fehlt(f.land, "Land", "land");

  // Nur der Rechnungssteller braucht zwingend eine steuerliche Kennung —
  // USt-IdNr. ODER Steuernummer, eines von beiden genuegt.
  if (rolle === "verkaeufer" && !partei?.ustId && !partei?.steuernummer) {
    fehlend.push({
      bt: "BT-31",
      feld: `${f.rolle}: USt-IdNr. oder Steuernummer`,
      hinweis: `Mindestens eine steuerliche Kennung ist Pflicht. ${wo}.`,
      /* Ein Schluessel fuer zwei Felder: die Norm verlangt eines von beiden,
         also markiert die Oberflaeche auch beide — und nicht willkuerlich das
         eine, das ein Kleinunternehmer ohne USt-IdNr. nie ausfuellen wird. */
      schluessel: "steuerkennung"
    });
  }
  return fehlend;
}

/**
 * Prueft die Pflichtfelder der Norm, die aus den TempConnect-Daten kommen muessen.
 *
 * Bewusst VOR der Erzeugung aufrufbar: Ein Empfaengersystem, das eine unvollstaendige
 * Rechnung ablehnt, nennt Regelnummern wie "BR-08" — damit kann niemand im Buero etwas
 * anfangen. Diese Pruefung nennt stattdessen das fehlende Feld im Klartext und wo es
 * gepflegt wird. Sie ersetzt keinen Schema-Validator, sondern faengt genau die Luecken
 * ab, die in der Praxis entstehen: nicht gepflegte Firmenstammdaten.
 *
 * @returns {{ vollstaendig: boolean, fehlend: Array<{bt: string, feld: string, hinweis: string}> }}
 */
export function pruefePflichtfelder(doc) {
  const fehlend = [];
  const fehlt = (bt, feld, hinweis) => fehlend.push({ bt, feld, hinweis });

  if (!doc.nummer) fehlt("BT-1", "Rechnungsnummer", "Die Rechnung hat keine Nummer.");
  if (!doc.ausstellungsdatum) fehlt("BT-2", "Rechnungsdatum", "Die Rechnung ist noch nicht gestellt (Entwurf).");
  if (!doc.waehrung) fehlt("BT-5", "Waehrung", "Waehrungskennung fehlt.");

  fehlend.push(...pruefeFirmenstammdaten(doc.verkaeufer, "verkaeufer"));
  fehlend.push(...pruefeFirmenstammdaten(doc.kaeufer, "kaeufer"));

  if (!doc.kaeuferreferenz) {
    fehlt("BT-10", "Kaeuferreferenz",
      "XRechnung verlangt eine Referenz des Empfaengers (Bestellnummer oder Leitweg-ID).");
  }

  if (!doc.positionen?.length) {
    fehlt("BG-25", "Rechnungspositionen", "Eine Rechnung ohne Position ist nicht gueltig.");
  }

  // Rechnerische Schluessigkeit (BR-CO-10 / BR-13 / BR-CO-15). Eine Rechnung, deren
  // Summen nicht aufgehen, wird vom Empfaenger abgewiesen — besser hier auffallen.
  const summePositionen = (doc.positionen || []).reduce((s, p) => s + p.zeilensummeCents, 0);
  if (doc.positionen?.length && summePositionen !== doc.summen.positionssummeCents) {
    fehlt("BR-CO-10", "Positionssumme",
      `Summe der Positionen (${centsZuBetrag(summePositionen)}) weicht von der ausgewiesenen ` +
      `Positionssumme (${centsZuBetrag(doc.summen.positionssummeCents)}) ab.`);
  }
  const erwartetNetto = doc.summen.positionssummeCents - doc.summen.nachlaesseCents;
  if (erwartetNetto !== doc.summen.nettoCents) {
    fehlt("BR-13", "Nettobetrag",
      `Positionssumme minus Nachlaesse (${centsZuBetrag(erwartetNetto)}) ergibt nicht den ` +
      `ausgewiesenen Nettobetrag (${centsZuBetrag(doc.summen.nettoCents)}).`);
  }
  const erwartetBrutto = doc.summen.nettoCents + doc.steuer.betragCents;
  if (erwartetBrutto !== doc.summen.bruttoCents) {
    fehlt("BR-CO-15", "Bruttobetrag",
      `Netto plus Steuer (${centsZuBetrag(erwartetBrutto)}) ergibt nicht den ausgewiesenen ` +
      `Bruttobetrag (${centsZuBetrag(doc.summen.bruttoCents)}).`);
  }

  return { vollstaendig: fehlend.length === 0, fehlend };
}

/* ═══════════════════════════════════════════════════════════
   XRechnung — UBL 2.1
   ═══════════════════════════════════════════════════════════ */

/** Element nur ausgeben, wenn ein Wert da ist — leere Pflichtelemente sind schlimmer als fehlende. */
function el(tag, wert, attr = "") {
  if (wert === null || wert === undefined || wert === "") return null;
  return `<${tag}${attr}>${xmlText(wert)}</${tag}>`;
}

/** Zeilen zusammensetzen und Leerwerte (null) verwerfen. */
function zeilen(...eintraege) {
  return eintraege.flat(Infinity).filter(Boolean).join("\n");
}

/** Einrueckung fuer Lesbarkeit im Zielsystem — reine Kosmetik, ohne Bedeutung fuer XML. */
function tiefe(text, stufen) {
  const pad = "  ".repeat(stufen);
  return text.split("\n").map((z) => (z ? pad + z : z)).join("\n");
}

/** UBL-Partei (cac:Party). Reihenfolge folgt dem UBL-2.1-Schema und ist bindend. */
function ublPartei(p, waehrungslos = true) {
  void waehrungslos;
  return zeilen(
    el("cbc:EndpointID", p.email, ' schemeID="EM"'),                  // BT-34 / BT-49
    "<cac:PartyName>",
    tiefe(el("cbc:Name", p.handelsname || p.name) || "", 1),          // BT-28 / BT-45
    "</cac:PartyName>",
    "<cac:PostalAddress>",
    tiefe(zeilen(
      el("cbc:StreetName", p.strasse),                                // BT-35 / BT-50
      el("cbc:AdditionalStreetName", p.strasse2),                     // BT-36 / BT-51
      el("cbc:CityName", p.ort),                                      // BT-37 / BT-52
      el("cbc:PostalZone", p.plz),                                    // BT-38 / BT-53
      "<cac:Country>",
      tiefe(el("cbc:IdentificationCode", p.land) || "", 1),           // BT-40 / BT-55
      "</cac:Country>"
    ), 1),
    "</cac:PostalAddress>",
    p.ustId ? zeilen(
      "<cac:PartyTaxScheme>",
      tiefe(zeilen(
        el("cbc:CompanyID", p.ustId),                                 // BT-31 / BT-48
        "<cac:TaxScheme>",
        tiefe(el("cbc:ID", "VAT") || "", 1),
        "</cac:TaxScheme>"
      ), 1),
      "</cac:PartyTaxScheme>"
    ) : null,
    // Steuernummer als zweites TaxScheme (BT-32) — Kennung "FC" fuer "Fiscal Code".
    p.steuernummer && !p.ustId ? zeilen(
      "<cac:PartyTaxScheme>",
      tiefe(zeilen(
        el("cbc:CompanyID", p.steuernummer),                          // BT-32
        "<cac:TaxScheme>",
        tiefe(el("cbc:ID", "FC") || "", 1),
        "</cac:TaxScheme>"
      ), 1),
      "</cac:PartyTaxScheme>"
    ) : null,
    "<cac:PartyLegalEntity>",
    tiefe(zeilen(
      el("cbc:RegistrationName", p.name),                             // BT-27 / BT-44
      el("cbc:CompanyID", p.handelsregister)                          // BT-30 / BT-47
    ), 1),
    "</cac:PartyLegalEntity>",
    (p.kontakt || p.telefon || p.email) ? zeilen(
      "<cac:Contact>",
      tiefe(zeilen(
        el("cbc:Name", p.kontakt),                                    // BT-41 / BT-56
        /* Reihenfolge in cac:Contact ist schemagebunden: Name, Telephone,
           ElectronicMail. Vertauscht bricht die XSD-Pruefung. */
        el("cbc:Telephone", p.telefon),                               // BT-42 / BT-57
        el("cbc:ElectronicMail", p.email)                             // BT-43 / BT-58
      ), 1),
      "</cac:Contact>"
    ) : null
  );
}

/**
 * Erzeugt eine XRechnung im UBL-2.1-Format.
 * @param {object} doc Ergebnis von `baueRechnungsdokument`
 * @returns {string} XML (UTF-8)
 */
export function baueXRechnung(doc) {
  const w = doc.waehrung;
  const cur = ` currencyID="${xmlText(w)}"`;
  const s = doc.steuer;
  const kat = zeilen(
    el("cbc:ID", s.kategorie),                                        // BT-118
    el("cbc:Percent", satzFormat(s.satzPct)),                         // BT-119
    "<cac:TaxScheme>",
    tiefe(el("cbc:ID", "VAT") || "", 1),
    "</cac:TaxScheme>"
  );

  const positionen = doc.positionen.map((p) => zeilen(
    "<cac:InvoiceLine>",
    tiefe(zeilen(
      el("cbc:ID", p.nummer),                                         // BT-126
      el("cbc:InvoicedQuantity", mengeFormat(p.menge), ` unitCode="${xmlText(p.einheit)}"`), // BT-129/130
      el("cbc:LineExtensionAmount", centsZuBetrag(p.zeilensummeCents), cur), // BT-131
      (p.zeitraumVon || p.zeitraumBis) ? zeilen(
        "<cac:InvoicePeriod>",
        tiefe(zeilen(
          el("cbc:StartDate", p.zeitraumVon),                         // BT-134
          el("cbc:EndDate", p.zeitraumBis)                            // BT-135
        ), 1),
        "</cac:InvoicePeriod>"
      ) : null,
      "<cac:Item>",
      tiefe(zeilen(
        el("cbc:Name", p.bezeichnung),                                // BT-153
        "<cac:ClassifiedTaxCategory>",
        tiefe(kat, 1),                                                // BT-151/152
        "</cac:ClassifiedTaxCategory>"
      ), 1),
      "</cac:Item>",
      "<cac:Price>",
      tiefe(el("cbc:PriceAmount", centsZuBetrag(p.einzelpreisCents), cur) || "", 1), // BT-146
      "</cac:Price>"
    ), 1),
    "</cac:InvoiceLine>"
  ));

  const koerper = zeilen(
    el("cbc:CustomizationID", XRECHNUNG_CUSTOMIZATION),               // BT-24
    el("cbc:ProfileID", XRECHNUNG_PROFILE),                           // BT-23
    el("cbc:ID", doc.nummer),                                         // BT-1
    el("cbc:IssueDate", doc.ausstellungsdatum),                       // BT-2
    el("cbc:DueDate", doc.faelligkeitsdatum),                         // BT-9
    el("cbc:InvoiceTypeCode", doc.typcode),                           // BT-3
    el("cbc:Note", doc.hinweis),                                      // BT-22
    el("cbc:DocumentCurrencyCode", w),                                // BT-5
    el("cbc:BuyerReference", doc.kaeuferreferenz),                    // BT-10

    (doc.leistungszeitraumVon || doc.leistungszeitraumBis) ? zeilen(
      "<cac:InvoicePeriod>",
      tiefe(zeilen(
        el("cbc:StartDate", doc.leistungszeitraumVon),                // BT-73
        el("cbc:EndDate", doc.leistungszeitraumBis)                   // BT-74
      ), 1),
      "</cac:InvoicePeriod>"
    ) : null,

    "<cac:AccountingSupplierParty>",
    tiefe(zeilen("<cac:Party>", tiefe(ublPartei(doc.verkaeufer), 1), "</cac:Party>"), 1),
    "</cac:AccountingSupplierParty>",
    "<cac:AccountingCustomerParty>",
    tiefe(zeilen("<cac:Party>", tiefe(ublPartei(doc.kaeufer), 1), "</cac:Party>"), 1),
    "</cac:AccountingCustomerParty>",

    doc.zahlung.iban ? zeilen(
      "<cac:PaymentMeans>",
      tiefe(zeilen(
        el("cbc:PaymentMeansCode", doc.zahlung.art),                  // BT-81
        "<cac:PayeeFinancialAccount>",
        tiefe(zeilen(
          el("cbc:ID", doc.zahlung.iban),                             // BT-84
          doc.zahlung.bic ? zeilen(
            "<cac:FinancialInstitutionBranch>",
            tiefe(el("cbc:ID", doc.zahlung.bic) || "", 1),            // BT-86
            "</cac:FinancialInstitutionBranch>"
          ) : null
        ), 1),
        "</cac:PayeeFinancialAccount>"
      ), 1),
      "</cac:PaymentMeans>"
    ) : null,

    doc.zahlung.bedingungen ? zeilen(
      "<cac:PaymentTerms>",
      tiefe(el("cbc:Note", doc.zahlung.bedingungen) || "", 1),        // BT-20
      "</cac:PaymentTerms>"
    ) : null,

    // Nachlass auf Dokumentebene. Ohne dieses Element geht BT-107 nicht auf.
    doc.rabatt ? zeilen(
      "<cac:AllowanceCharge>",
      tiefe(zeilen(
        el("cbc:ChargeIndicator", "false"),                           // BG-20 (false = Nachlass)
        el("cbc:AllowanceChargeReason", doc.rabatt.grund),            // BT-97
        doc.rabatt.satzPct ? el("cbc:MultiplierFactorNumeric", satzFormat(doc.rabatt.satzPct)) : null, // BT-94
        el("cbc:Amount", centsZuBetrag(doc.rabatt.betragCents), cur), // BT-92
        el("cbc:BaseAmount", centsZuBetrag(doc.rabatt.grundlageCents), cur), // BT-93
        "<cac:TaxCategory>",
        tiefe(kat, 1),                                                // BT-95/96
        "</cac:TaxCategory>"
      ), 1),
      "</cac:AllowanceCharge>"
    ) : null,

    "<cac:TaxTotal>",
    tiefe(zeilen(
      el("cbc:TaxAmount", centsZuBetrag(s.betragCents), cur),         // BT-110
      "<cac:TaxSubtotal>",
      tiefe(zeilen(
        el("cbc:TaxableAmount", centsZuBetrag(s.grundlageCents), cur), // BT-116
        el("cbc:TaxAmount", centsZuBetrag(s.betragCents), cur),        // BT-117
        "<cac:TaxCategory>",
        tiefe(zeilen(
          el("cbc:ID", s.kategorie),                                   // BT-118
          el("cbc:Percent", satzFormat(s.satzPct)),                    // BT-119
          el("cbc:TaxExemptionReason", s.befreiungsgrund),             // BT-120
          "<cac:TaxScheme>",
          tiefe(el("cbc:ID", "VAT") || "", 1),
          "</cac:TaxScheme>"
        ), 1),
        "</cac:TaxCategory>"
      ), 1),
      "</cac:TaxSubtotal>"
    ), 1),
    "</cac:TaxTotal>",

    "<cac:LegalMonetaryTotal>",
    tiefe(zeilen(
      el("cbc:LineExtensionAmount", centsZuBetrag(doc.summen.positionssummeCents), cur), // BT-106
      el("cbc:TaxExclusiveAmount", centsZuBetrag(doc.summen.nettoCents), cur),           // BT-109
      el("cbc:TaxInclusiveAmount", centsZuBetrag(doc.summen.bruttoCents), cur),          // BT-112
      doc.summen.nachlaesseCents > 0
        ? el("cbc:AllowanceTotalAmount", centsZuBetrag(doc.summen.nachlaesseCents), cur) // BT-107
        : null,
      el("cbc:PayableAmount", centsZuBetrag(doc.summen.zahlbetragCents), cur)            // BT-115
    ), 1),
    "</cac:LegalMonetaryTotal>",

    positionen
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
${tiefe(koerper, 1)}
</Invoice>
`;
}

/* ═══════════════════════════════════════════════════════════
   ZUGFeRD — UN/CEFACT CII, Profil EN 16931
   ═══════════════════════════════════════════════════════════ */

/** CII-Partei. Auch hier ist die Reihenfolge der Kindelemente schemagebunden. */
function ciiPartei(p) {
  return zeilen(
    /* ram:Name ist BT-27 — der RECHTSNAME, nicht der Handelsname.
     *
     * Hier stand `p.handelsname || p.name` mit dem Kommentar "BT-28". Das war
     * eine Verwechslung: BT-28 (Handelsname) liegt in CII unter
     * SpecifiedLegalOrganization/TradingBusinessName, waehrend ram:Name die
     * Rechtsperson benennt. Der UBL-Zweig macht es an seiner entsprechenden
     * Stelle richtig (cbc:RegistrationName = p.name) — beide Formate kommen
     * laut Dateikopf aus DERSELBEN Zwischenstruktur und sagten hier
     * Verschiedenes.
     *
     * Aufgefallen ist es beim Abgleich PDF gegen XML: der Beleg zeigte
     * "Mueller & Soehne Zeitarbeit GmbH", das XML "Mueller Zeitarbeit". Zwei
     * Namen fuer denselben Rechnungssteller auf demselben Dokument. */
    el("ram:Name", p.name || p.handelsname),                          // BT-27 / BT-44
    (p.handelsregister || (p.handelsname && p.handelsname !== p.name)) ? zeilen(
      "<ram:SpecifiedLegalOrganization>",
      tiefe(zeilen(
        el("ram:ID", p.handelsregister),                              // BT-30 / BT-47
        /* Nur wenn er sich vom Rechtsnamen unterscheidet — sonst stuende
           derselbe Text zweimal im Beleg. */
        (p.handelsname && p.handelsname !== p.name)
          ? el("ram:TradingBusinessName", p.handelsname)              // BT-28 / BT-45
          : null
      ), 1),
      "</ram:SpecifiedLegalOrganization>"
    ) : null,
    (p.kontakt || p.telefon || p.email) ? zeilen(
      "<ram:DefinedTradeContact>",
      tiefe(zeilen(
        el("ram:PersonName", p.kontakt),                              // BT-41 / BT-56
        /* Reihenfolge in DefinedTradeContact: PersonName, DepartmentName,
           TypeCode, Telephone…, Fax…, EmailURI… Das Telefon steht VOR der
           E-Mail; vertauscht bricht die XSD-Pruefung. */
        p.telefon ? zeilen(
          "<ram:TelephoneUniversalCommunication>",
          tiefe(el("ram:CompleteNumber", p.telefon) || "", 1),         // BT-42 / BT-57
          "</ram:TelephoneUniversalCommunication>"
        ) : null,
        p.email ? zeilen(
          "<ram:EmailURIUniversalCommunication>",
          tiefe(el("ram:URIID", p.email) || "", 1),                    // BT-43 / BT-58
          "</ram:EmailURIUniversalCommunication>"
        ) : null
      ), 1),
      "</ram:DefinedTradeContact>"
    ) : null,
    "<ram:PostalTradeAddress>",
    tiefe(zeilen(
      el("ram:PostcodeCode", p.plz),                                  // BT-38 / BT-53
      el("ram:LineOne", p.strasse),                                   // BT-35 / BT-50
      el("ram:LineTwo", p.strasse2),                                  // BT-36 / BT-51
      el("ram:CityName", p.ort),                                      // BT-37 / BT-52
      el("ram:CountryID", p.land)                                     // BT-40 / BT-55
    ), 1),
    "</ram:PostalTradeAddress>",
    p.ustId ? zeilen(
      "<ram:SpecifiedTaxRegistration>",
      tiefe(el("ram:ID", p.ustId, ' schemeID="VA"') || "", 1),        // BT-31 / BT-48
      "</ram:SpecifiedTaxRegistration>"
    ) : null,
    (p.steuernummer && !p.ustId) ? zeilen(
      "<ram:SpecifiedTaxRegistration>",
      tiefe(el("ram:ID", p.steuernummer, ' schemeID="FC"') || "", 1), // BT-32
      "</ram:SpecifiedTaxRegistration>"
    ) : null
  );
}

/**
 * Erzeugt das ZUGFeRD-XML (CII, Profil EN 16931).
 * Dieses XML wird bei ZUGFeRD als Anhang `factur-x.xml` in ein PDF/A-3 eingebettet;
 * es ist fuer sich genommen bereits eine gueltige E-Rechnung nach EN 16931.
 *
 * @param {object} doc Ergebnis von `baueRechnungsdokument`
 * @returns {string} XML (UTF-8)
 */
export function baueZugferdXml(doc) {
  const w = doc.waehrung;
  const cur = ` currencyID="${xmlText(w)}"`;
  const s = doc.steuer;

  const positionen = doc.positionen.map((p) => zeilen(
    "<ram:IncludedSupplyChainTradeLineItem>",
    tiefe(zeilen(
      "<ram:AssociatedDocumentLineDocument>",
      tiefe(el("ram:LineID", p.nummer) || "", 1),                     // BT-126
      "</ram:AssociatedDocumentLineDocument>",
      "<ram:SpecifiedTradeProduct>",
      tiefe(el("ram:Name", p.bezeichnung) || "", 1),                  // BT-153
      "</ram:SpecifiedTradeProduct>",
      "<ram:SpecifiedLineTradeAgreement>",
      tiefe(zeilen(
        "<ram:NetPriceProductTradePrice>",
        tiefe(el("ram:ChargeAmount", centsZuBetrag(p.einzelpreisCents)) || "", 1), // BT-146
        "</ram:NetPriceProductTradePrice>"
      ), 1),
      "</ram:SpecifiedLineTradeAgreement>",
      "<ram:SpecifiedLineTradeDelivery>",
      tiefe(el("ram:BilledQuantity", mengeFormat(p.menge), ` unitCode="${xmlText(p.einheit)}"`) || "", 1), // BT-129/130
      "</ram:SpecifiedLineTradeDelivery>",
      "<ram:SpecifiedLineTradeSettlement>",
      tiefe(zeilen(
        "<ram:ApplicableTradeTax>",
        tiefe(zeilen(
          el("ram:TypeCode", "VAT"),
          el("ram:CategoryCode", s.kategorie),                        // BT-151
          el("ram:RateApplicablePercent", satzFormat(s.satzPct))      // BT-152
        ), 1),
        "</ram:ApplicableTradeTax>",
        (p.zeitraumVon || p.zeitraumBis) ? zeilen(
          "<ram:BillingSpecifiedPeriod>",
          tiefe(zeilen(
            p.zeitraumVon ? `<ram:StartDateTime><udt:DateTimeString format="102">${xmlText(p.zeitraumVon.replace(/-/g, ""))}</udt:DateTimeString></ram:StartDateTime>` : null, // BT-134
            p.zeitraumBis ? `<ram:EndDateTime><udt:DateTimeString format="102">${xmlText(p.zeitraumBis.replace(/-/g, ""))}</udt:DateTimeString></ram:EndDateTime>` : null      // BT-135
          ), 1),
          "</ram:BillingSpecifiedPeriod>"
        ) : null,
        "<ram:SpecifiedTradeSettlementLineMonetarySummation>",
        tiefe(el("ram:LineTotalAmount", centsZuBetrag(p.zeilensummeCents)) || "", 1), // BT-131
        "</ram:SpecifiedTradeSettlementLineMonetarySummation>"
      ), 1),
      "</ram:SpecifiedLineTradeSettlement>"
    ), 1),
    "</ram:IncludedSupplyChainTradeLineItem>"
  ));

  const kopf = zeilen(
    "<rsm:ExchangedDocumentContext>",
    tiefe(zeilen(
      "<ram:GuidelineSpecifiedDocumentContextParameter>",
      tiefe(el("ram:ID", ZUGFERD_GUIDELINE) || "", 1),                // BT-24
      "</ram:GuidelineSpecifiedDocumentContextParameter>"
    ), 1),
    "</rsm:ExchangedDocumentContext>",
    "<rsm:ExchangedDocument>",
    tiefe(zeilen(
      el("ram:ID", doc.nummer),                                       // BT-1
      el("ram:TypeCode", doc.typcode),                                // BT-3
      doc.ausstellungsdatum
        ? `<ram:IssueDateTime><udt:DateTimeString format="102">${xmlText(zuCiiDatum(doc.ausstellungsdatum))}</udt:DateTimeString></ram:IssueDateTime>`
        : null,                                                       // BT-2
      doc.hinweis ? zeilen(
        "<ram:IncludedNote>",
        tiefe(el("ram:Content", doc.hinweis) || "", 1),                // BT-22
        "</ram:IncludedNote>"
      ) : null
    ), 1),
    "</rsm:ExchangedDocument>"
  );

  const transaktion = zeilen(
    positionen,
    "<ram:ApplicableHeaderTradeAgreement>",
    tiefe(zeilen(
      el("ram:BuyerReference", doc.kaeuferreferenz),                  // BT-10
      "<ram:SellerTradeParty>",
      tiefe(ciiPartei(doc.verkaeufer), 1),
      "</ram:SellerTradeParty>",
      "<ram:BuyerTradeParty>",
      tiefe(ciiPartei(doc.kaeufer), 1),
      "</ram:BuyerTradeParty>"
    ), 1),
    "</ram:ApplicableHeaderTradeAgreement>",
    // Lieferzeitpunkt (BT-72): das Ende des abgerechneten Leistungszeitraums.
    "<ram:ApplicableHeaderTradeDelivery>",
    tiefe(doc.leistungszeitraumBis ? zeilen(
      "<ram:ActualDeliverySupplyChainEvent>",
      tiefe(`<ram:OccurrenceDateTime><udt:DateTimeString format="102">${xmlText(zuCiiDatum(doc.leistungszeitraumBis))}</udt:DateTimeString></ram:OccurrenceDateTime>`, 1),
      "</ram:ActualDeliverySupplyChainEvent>"
    ) : "", 1),
    "</ram:ApplicableHeaderTradeDelivery>",
    "<ram:ApplicableHeaderTradeSettlement>",
    tiefe(zeilen(
      el("ram:InvoiceCurrencyCode", w),                               // BT-5
      doc.zahlung.iban ? zeilen(
        "<ram:SpecifiedTradeSettlementPaymentMeans>",
        tiefe(zeilen(
          el("ram:TypeCode", doc.zahlung.art),                        // BT-81
          "<ram:PayeePartyCreditorFinancialAccount>",
          tiefe(el("ram:IBANID", doc.zahlung.iban) || "", 1),         // BT-84
          "</ram:PayeePartyCreditorFinancialAccount>",
          doc.zahlung.bic ? zeilen(
            "<ram:PayeeSpecifiedCreditorFinancialInstitution>",
            tiefe(el("ram:BICID", doc.zahlung.bic) || "", 1),         // BT-86
            "</ram:PayeeSpecifiedCreditorFinancialInstitution>"
          ) : null
        ), 1),
        "</ram:SpecifiedTradeSettlementPaymentMeans>"
      ) : null,
      "<ram:ApplicableTradeTax>",
      tiefe(zeilen(
        el("ram:CalculatedAmount", centsZuBetrag(s.betragCents)),     // BT-117
        el("ram:TypeCode", "VAT"),
        el("ram:ExemptionReason", s.befreiungsgrund),                 // BT-120
        el("ram:BasisAmount", centsZuBetrag(s.grundlageCents)),       // BT-116
        el("ram:CategoryCode", s.kategorie),                          // BT-118
        el("ram:RateApplicablePercent", satzFormat(s.satzPct))        // BT-119
      ), 1),
      "</ram:ApplicableTradeTax>",
      (doc.leistungszeitraumVon || doc.leistungszeitraumBis) ? zeilen(
        "<ram:BillingSpecifiedPeriod>",
        tiefe(zeilen(
          doc.leistungszeitraumVon ? `<ram:StartDateTime><udt:DateTimeString format="102">${xmlText(zuCiiDatum(doc.leistungszeitraumVon))}</udt:DateTimeString></ram:StartDateTime>` : null, // BT-73
          doc.leistungszeitraumBis ? `<ram:EndDateTime><udt:DateTimeString format="102">${xmlText(zuCiiDatum(doc.leistungszeitraumBis))}</udt:DateTimeString></ram:EndDateTime>` : null      // BT-74
        ), 1),
        "</ram:BillingSpecifiedPeriod>"
      ) : null,
      doc.rabatt ? zeilen(
        "<ram:SpecifiedTradeAllowanceCharge>",
        tiefe(zeilen(
          "<ram:ChargeIndicator>",
          tiefe(el("udt:Indicator", "false") || "", 1),               // Nachlass
          "</ram:ChargeIndicator>",
          doc.rabatt.satzPct ? el("ram:CalculationPercent", satzFormat(doc.rabatt.satzPct)) : null, // BT-94
          el("ram:BasisAmount", centsZuBetrag(doc.rabatt.grundlageCents)), // BT-93
          el("ram:ActualAmount", centsZuBetrag(doc.rabatt.betragCents)),   // BT-92
          el("ram:Reason", doc.rabatt.grund),                              // BT-97
          "<ram:CategoryTradeTax>",
          tiefe(zeilen(
            el("ram:TypeCode", "VAT"),
            el("ram:CategoryCode", s.kategorie),                      // BT-95
            el("ram:RateApplicablePercent", satzFormat(s.satzPct))    // BT-96
          ), 1),
          "</ram:CategoryTradeTax>"
        ), 1),
        "</ram:SpecifiedTradeAllowanceCharge>"
      ) : null,
      doc.zahlung.bedingungen ? zeilen(
        "<ram:SpecifiedTradePaymentTerms>",
        tiefe(zeilen(
          el("ram:Description", doc.zahlung.bedingungen),             // BT-20
          doc.faelligkeitsdatum
            ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${xmlText(zuCiiDatum(doc.faelligkeitsdatum))}</udt:DateTimeString></ram:DueDateDateTime>`
            : null                                                     // BT-9
        ), 1),
        "</ram:SpecifiedTradePaymentTerms>"
      ) : null,
      "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
      tiefe(zeilen(
        el("ram:LineTotalAmount", centsZuBetrag(doc.summen.positionssummeCents)), // BT-106
        doc.summen.nachlaesseCents > 0
          ? el("ram:AllowanceTotalAmount", centsZuBetrag(doc.summen.nachlaesseCents)) // BT-107
          : null,
        el("ram:TaxBasisTotalAmount", centsZuBetrag(doc.summen.nettoCents)),     // BT-109
        el("ram:TaxTotalAmount", centsZuBetrag(s.betragCents), cur),             // BT-110
        el("ram:GrandTotalAmount", centsZuBetrag(doc.summen.bruttoCents)),       // BT-112
        el("ram:DuePayableAmount", centsZuBetrag(doc.summen.zahlbetragCents))    // BT-115
      ), 1),
      "</ram:SpecifiedTradeSettlementHeaderMonetarySummation>"
    ), 1),
    "</ram:ApplicableHeaderTradeSettlement>"
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
${tiefe(kopf, 1)}
  <rsm:SupplyChainTradeTransaction>
${tiefe(transaktion, 2)}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/* ═══════════════════════════════════════════════════════════
   Einstieg fuer Aufrufer
   ═══════════════════════════════════════════════════════════ */

/**
 * Erzeugt die E-Rechnung im gewuenschten Format — inklusive Pflichtfeldpruefung.
 *
 * FAIL-CLOSED: Fehlt ein Pflichtfeld, wird KEIN Dokument zurueckgegeben. Eine
 * unvollstaendige E-Rechnung ist schlimmer als gar keine: sie sieht aus wie eine
 * Rechnung, wird vom Empfaenger aber abgewiesen — und niemand erfaehrt, warum.
 * Stattdessen kommt die Liste der fehlenden Felder zurueck, im Klartext.
 *
 * @param {object} arg wie `baueRechnungsdokument`, zusaetzlich `format`
 * @returns {{ ok: true, format: string, dateiname: string, contentType: string, xml: string }
 *          | { ok: false, fehler: "PFLICHTFELDER_FEHLEN", fehlend: Array }
 *          | { ok: false, fehler: "FORMAT_UNBEKANNT", erlaubt: Array }}
 */
export function erzeugeERechnung({ format = "xrechnung", invoice, items, verkaeufer, kaeufer, optionen }) {
  const f = String(format || "").toLowerCase();
  if (!RECHNUNGSFORMATE.includes(f)) {
    return { ok: false, fehler: "FORMAT_UNBEKANNT", erlaubt: RECHNUNGSFORMATE };
  }

  const doc = baueRechnungsdokument({ invoice, items, verkaeufer, kaeufer, optionen });
  const pruefung = pruefePflichtfelder(doc);
  if (!pruefung.vollstaendig) {
    return { ok: false, fehler: "PFLICHTFELDER_FEHLEN", fehlend: pruefung.fehlend };
  }

  const xml = f === "zugferd" ? baueZugferdXml(doc) : baueXRechnung(doc);
  const nummer = String(doc.nummer).replace(/[^A-Za-z0-9_.-]/g, "_");
  const dateiname = f === "zugferd" ? `factur-x-${nummer}.xml` : `xrechnung-${nummer}.xml`;

  return {
    ok: true,
    format: f,
    dateiname,
    contentType: "application/xml; charset=utf-8",
    xml
  };
}
