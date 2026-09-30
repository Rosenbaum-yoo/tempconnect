/**
 * Das XMP-Paket fuer einen Factur-X/ZUGFeRD-Beleg als PDF/A-3.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS HIER DRINSTEHT UND WARUM ES GENAU SO AUSSEHEN MUSS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ein PDF/A traegt seine Konformitaetsaussage nicht im Dateikopf, sondern in
 * einem XMP-Paket im Katalog (/Metadata). Zwei Dinge stehen darin:
 *
 *   1. Die PDF/A-Kennung (pdfaid:part, pdfaid:conformance). Ohne sie ist die
 *      Datei ein gewoehnliches PDF, egal wie normgerecht ihr Aufbau ist.
 *   2. Die Factur-X-Kennung — und die geht nur ueber ein PDF/A-EXTENSION-
 *      SCHEMA. PDF/A verbietet unbekannte XMP-Felder; wer eigene einfuehrt,
 *      muss sie im selben Paket deklarieren. Ohne diese Deklaration ist das
 *      Dokument NICHT PDF/A-konform, obwohl die Felder inhaltlich richtig sind.
 *      Das ist die haeufigste Fehlerquelle bei selbstgebauten Belegen.
 *
 * Quelle: Factur-X 1.07.2 (FNFE-MPE/FeRD, 15.11.2024), Kapitel 6.3.1. Die
 * Werte unten sind zusaetzlich gegen einen echten Beleg gegengeprueft
 * (Mustangproject EN16931_Einfach.pdf) — nicht aus der Beschreibung
 * abgeschrieben, sondern aus den Rohbytes eines Dokuments, das die Norm
 * erfuellt.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIE FALLEN, JEDE EINZELN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Jede der folgenden Kleinigkeiten macht den Beleg unbrauchbar, und keine
 * davon faellt beim Ansehen auf:
 *
 *   · Die Namespace-URI endet auf "#". Die Spezifikation weist zweimal
 *     ausdruecklich darauf hin. Ohne das Zeichen findet ein Empfaengersystem
 *     das Schema nicht.
 *   · "CrossIndustryDocument" wird gemischt geschrieben. Aeltere Beispiele
 *     der FNFE zeigen alles klein — das ist spezifikationswidrig.
 *   · fx:Version ist "1.0" — die Fassung des FACTUR-X-Standards, nicht die
 *     ZUGFeRD-Fassung. Wer hier "2.3" schreibt, benennt das falsche Ding.
 *   · fx:ConformanceLevel ist "EN 16931" MIT Leerzeichen, waehrend derselbe
 *     Profilname im Rechnungs-XML als "urn:cen.eu:en16931:2017" ohne
 *     Leerzeichen und klein steht. Zwei Schreibweisen fuer dasselbe Profil,
 *     beide normativ.
 *   · Die xpacket-Anweisung darf weder `bytes=` noch `encoding=` tragen.
 *   · Das BOM am Anfang (U+FEFF) gehoert dazu. Es steht hier als
 *     String.fromCharCode(0xFEFF) und nicht als Literal: ein unsichtbares
 *     Zeichen im Quelltext ueberlebt den naechsten Editor nicht zuverlaessig.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DIESES MODUL NICHT TUT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Es erzeugt Text. Ob das fertige Dokument PDF/A-3b ist, entscheidet der
 * gesamte Aufbau — eingebettete Schriften, OutputIntent, Trailer-Kennung. Ein
 * korrektes XMP auf einem nicht-konformen Dokument ist eine unwahre Aussage
 * ueber sich selbst, kein Freibrief.
 */

/** Das Byte-Order-Mark, das die xpacket-Anweisung einleitet. */
const BOM = String.fromCharCode(0xfeff);

/** Die Kennung des xpacket-Rahmens. Fester Wert der XMP-Spezifikation. */
const PAKET_ID = "W5M0MpCehiHzreSzNTczkc9d";

/** Namespace des Factur-X-Erweiterungsschemas. Das "#" am Ende ist Pflicht. */
export const FX_NAMESPACE = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";

/** Die Profilnamen, wie sie im XMP stehen — mit Leerzeichen, anders als im XML. */
export const FX_PROFILE = {
  MINIMUM: "MINIMUM",
  BASIC_WL: "BASIC WL",
  BASIC: "BASIC",
  EN16931: "EN 16931",
  EXTENDED: "EXTENDED",
  XRECHNUNG: "XRECHNUNG",
};

/**
 * Maskiert die fuenf Zeichen, die in XML-Text nicht roh stehen duerfen.
 *
 * Kein Luxus: ein Firmenname wie "Mueller & Soehne" zerlegt sonst das XMP,
 * und damit faellt die gesamte PDF/A-Konformitaet — wegen eines
 * kaufmaennischen Und.
 */
function xmlEsc(wert) {
  return String(wert == null ? "" : wert)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Ein Zeitstempel in der Form, die XMP verlangt (ISO 8601 mit Zeitzone).
 *
 * Bewusst mit Zonenversatz statt "Z": der Beleg entsteht in Europe/Berlin, und
 * ein Zeitstempel ohne Ortsbezug ist bei einer Rechnung die schlechtere
 * Auskunft. Zusammengesetzt aus den lokalen Bestandteilen — `toISOString`
 * waere UTC und abends der Vortag.
 */
export function xmpZeitstempel(datum) {
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  const zwei = (n) => String(n).padStart(2, "0");
  const versatzMin = -d.getTimezoneOffset();
  const vz = versatzMin >= 0 ? "+" : "-";
  const abs = Math.abs(versatzMin);
  return (
    `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}` +
    `T${zwei(d.getHours())}:${zwei(d.getMinutes())}:${zwei(d.getSeconds())}` +
    `${vz}${zwei(Math.floor(abs / 60))}:${zwei(abs % 60)}`
  );
}

/**
 * Baut das vollstaendige XMP-Paket.
 *
 * @param {object} arg
 * @param {string} arg.titel        dc:title — muss dem Info-Dict entsprechen
 * @param {string} arg.autor        dc:creator
 * @param {string} arg.betreff      dc:description
 * @param {string} arg.producer     pdf:Producer
 * @param {string} arg.creatorTool  xmp:CreatorTool
 * @param {string} arg.zeitstempel  xmp:CreateDate/ModifyDate (aus xmpZeitstempel)
 * @param {string} [arg.konformitaet="B"]  pdfaid:conformance — "B" oder "U"
 * @param {number} [arg.teil=3]            pdfaid:part
 * @param {string} [arg.profil]            fx:ConformanceLevel
 * @param {string} [arg.anhangName]        fx:DocumentFileName
 * @param {string} [arg.dokumentTyp="INVOICE"] fx:DocumentType
 * @returns {string} das XMP-Paket als Text
 */
export function baueXmp({
  titel,
  autor,
  betreff,
  producer,
  creatorTool,
  zeitstempel,
  konformitaet = "B",
  teil = 3,
  profil = FX_PROFILE.EN16931,
  anhangName = "factur-x.xml",
  dokumentTyp = "INVOICE",
} = {}) {
  const e = xmlEsc;
  /* Die Eigenschaften des Erweiterungsschemas. Alle vier sind Pflicht — ein
     Feld weniger, und ein Pruefer meldet ein undeklariertes XMP-Property. */
  const eigenschaften = [
    ["DocumentFileName", "The name of the embedded XML document"],
    ["DocumentType", "The type of the hybrid document in capital letters, e.g. INVOICE or ORDER"],
    ["Version", "The actual version of the standard applying to the embedded XML document"],
    ["ConformanceLevel", "The conformance level of the embedded XML document"],
  ]
    .map(
      ([name, beschreibung]) =>
        `                <rdf:li rdf:parseType="Resource">\n` +
        `                  <pdfaProperty:name>${name}</pdfaProperty:name>\n` +
        `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
        `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
        `                  <pdfaProperty:description>${beschreibung}</pdfaProperty:description>\n` +
        `                </rdf:li>`,
    )
    .join("\n");

  return (
    `<?xpacket begin="${BOM}" id="${PAKET_ID}"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `    <rdf:Description xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" rdf:about="">\n` +
    `      <pdfaid:part>${teil}</pdfaid:part>\n` +
    `      <pdfaid:conformance>${e(konformitaet)}</pdfaid:conformance>\n` +
    `    </rdf:Description>\n` +
    `    <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" rdf:about="">\n` +
    `      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${e(titel)}</rdf:li></rdf:Alt></dc:title>\n` +
    `      <dc:creator><rdf:Seq><rdf:li>${e(autor)}</rdf:li></rdf:Seq></dc:creator>\n` +
    `      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${e(betreff)}</rdf:li></rdf:Alt></dc:description>\n` +
    `    </rdf:Description>\n` +
    `    <rdf:Description xmlns:pdf="http://ns.adobe.com/pdf/1.3/" rdf:about="">\n` +
    `      <pdf:Producer>${e(producer)}</pdf:Producer>\n` +
    `    </rdf:Description>\n` +
    `    <rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" rdf:about="">\n` +
    `      <xmp:CreatorTool>${e(creatorTool)}</xmp:CreatorTool>\n` +
    `      <xmp:CreateDate>${e(zeitstempel)}</xmp:CreateDate>\n` +
    `      <xmp:ModifyDate>${e(zeitstempel)}</xmp:ModifyDate>\n` +
    `    </rdf:Description>\n` +
    `    <rdf:Description xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"` +
    ` xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"` +
    ` xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" rdf:about="">\n` +
    `      <pdfaExtension:schemas>\n` +
    `        <rdf:Bag>\n` +
    `          <rdf:li rdf:parseType="Resource">\n` +
    `            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>\n` +
    `            <pdfaSchema:namespaceURI>${FX_NAMESPACE}</pdfaSchema:namespaceURI>\n` +
    `            <pdfaSchema:prefix>fx</pdfaSchema:prefix>\n` +
    `            <pdfaSchema:property>\n` +
    `              <rdf:Seq>\n` +
    `${eigenschaften}\n` +
    `              </rdf:Seq>\n` +
    `            </pdfaSchema:property>\n` +
    `          </rdf:li>\n` +
    `        </rdf:Bag>\n` +
    `      </pdfaExtension:schemas>\n` +
    `    </rdf:Description>\n` +
    `    <rdf:Description xmlns:fx="${FX_NAMESPACE}" rdf:about="">\n` +
    `      <fx:DocumentType>${e(dokumentTyp)}</fx:DocumentType>\n` +
    `      <fx:DocumentFileName>${e(anhangName)}</fx:DocumentFileName>\n` +
    `      <fx:Version>1.0</fx:Version>\n` +
    `      <fx:ConformanceLevel>${e(profil)}</fx:ConformanceLevel>\n` +
    `    </rdf:Description>\n` +
    `  </rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `<?xpacket end="w"?>`
  );
}
