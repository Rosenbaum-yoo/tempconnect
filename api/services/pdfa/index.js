/**
 * Die vier Eingriffe, die aus einem PDF ein PDF/A-3b machen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS PDF/A VERLANGT, WAS PDF-LIB LIEFERT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * pdf-lib 1.17.1 kennt PDF/A nicht. Es bringt aber alles mit, was noetig ist —
 * `doc.catalog.set`, `doc.context.stream/register/obj` und `trailerInfo` sind
 * oeffentlich. Vier Dinge fehlen einem frisch erzeugten Dokument, und jedes
 * einzelne ist ein harter Verstoss:
 *
 *   1. /ID im Trailer. Ein neu erzeugtes pdf-lib-Dokument hat KEINE
 *      (ISO 19005-2, 6.1.3). Muss selbst gesetzt werden.
 *   2. /OutputIntents mit eingebettetem ICC-Profil. Ein blosser Verweis
 *      genuegt nicht — /DestOutputProfileRef ist ausdruecklich verboten.
 *   3. /Metadata mit dem XMP-Paket. Ohne die pdfaid-Kennung ist die Datei ein
 *      gewoehnliches PDF, egal wie normgerecht ihr Aufbau ist.
 *   4. Eine Sprachangabe. Nicht zwingend fuer 3b, aber kostenlos und die
 *      Voraussetzung, falls spaeter 3a angestrebt wird.
 *
 * Was hier bewusst NICHT passiert: kein /StructTreeRoot, kein /MarkInfo. Fuer
 * Stufe b sind sie nicht verlangt, und ein leerer Strukturbaum ueber
 * ungetaggtem Inhalt waere eine Attrappe — er behauptete Barrierefreiheit, die
 * das Dokument nicht hat.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ZWEI FALLEN IN PDF-LIB, DIE STILL ZERSTOEREN
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   · `context.obj("text")` macht daraus einen PDF-NAMEN (/text), keinen
 *     String. Fuer /OutputConditionIdentifier und /Info ist ein echter String
 *     verlangt — deshalb dort PDFString.of(). Bei /S ist der Name richtig.
 *   · `context.stream("...")` wandelt Strings per charCodeAt um. Ein als Text
 *     uebergebenes ICC-Profil waere danach Datenmuell, und ein XMP mit
 *     Umlauten kein gueltiges UTF-8. Beides geht als Buffer hinein.
 *
 * Beide Fehler erzeugen ein Dokument, das sich oeffnen laesst und falsch ist.
 */

import { PDFName, PDFString, PDFHexString } from "pdf-lib";
import crypto from "node:crypto";

/**
 * Prueft, ob ein ICC-Profil fuer einen PDF/A-OutputIntent taugt.
 *
 * Die Bedingungen stammen aus der veraPDF-Regel 6.2.3-1 und sind woertlich:
 * deviceClass muss "prtr" oder "mntr" sein, colorSpace "RGB " (mit
 * nachgestelltem Leerzeichen — es ist eine Vier-Byte-Signatur), "CMYK" oder
 * "GRAY", und die Fassung kleiner als 5.0.
 *
 * Warum das hier steht und nicht nur im Test: ein untaugliches Profil erzeugt
 * ein Dokument, das sich oeffnen laesst und die Norm verfehlt. Der Fehler
 * faellt dann erst einem Empfaenger auf. Lieber hier laut scheitern.
 *
 * @param {Uint8Array|Buffer} bytes
 * @returns {{ok:true, deviceClass:string, colorSpace:string, version:string}
 *          |{ok:false, fehler:string}}
 */
export function pruefeIccProfil(bytes) {
  if (!bytes || bytes.length < 132) {
    return { ok: false, fehler: "ICC_ZU_KURZ" };
  }
  const b = Buffer.from(bytes);
  const vier = (offset) => b.toString("latin1", offset, offset + 4);

  /* Byte 36-39 traegt die Signatur "acsp". Fehlt sie, ist die Datei kein
     ICC-Profil — dann sind alle weiteren Offsets Zufallswerte. */
  if (vier(36) !== "acsp") {
    return { ok: false, fehler: "ICC_SIGNATUR_FEHLT" };
  }

  const deviceClass = vier(12);
  const colorSpace = vier(16);
  const major = b[8];
  const minor = b[9] >> 4;
  const version = `${major}.${minor}`;

  if (deviceClass !== "mntr" && deviceClass !== "prtr") {
    return { ok: false, fehler: `ICC_DEVICE_CLASS_UNGEEIGNET:${deviceClass}` };
  }
  if (colorSpace !== "RGB " && colorSpace !== "CMYK" && colorSpace !== "GRAY") {
    return { ok: false, fehler: `ICC_FARBRAUM_UNGEEIGNET:${colorSpace}` };
  }
  if (major >= 5) {
    return { ok: false, fehler: `ICC_FASSUNG_ZU_NEU:${version}` };
  }
  return { ok: true, deviceClass, colorSpace, version };
}

/** Anzahl der Farbkanaele je ICC-Farbraum — /N im Profilstrom. */
const KANAELE = { "RGB ": 3, GRAY: 1, CMYK: 4 };

/**
 * Setzt die Dokumentkennung im Trailer.
 *
 * DETERMINISTISCH aus dem uebergebenen Saatwert, nicht zufaellig: dieselbe
 * Rechnung zweimal erzeugt ergibt dieselbe Kennung. Das ist bei einem Beleg
 * die richtige Eigenschaft — zwei Dateien, die sich nur in einer Zufallszahl
 * unterscheiden, sehen bei jedem Abgleich nach zwei verschiedenen Dokumenten
 * aus.
 *
 * Beide Haelften des Arrays sind gleich: die erste ist die urspruengliche
 * Kennung, die zweite die der aktuellen Fassung. Bei einem frisch erzeugten,
 * nie geaenderten Dokument ist beides dasselbe.
 */
function setzeKennung(doc, saat) {
  const hash = crypto.createHash("md5").update(String(saat), "utf8").digest("hex").toUpperCase();
  const kennung = PDFHexString.of(hash);
  doc.context.trailerInfo.ID = doc.context.obj([kennung, kennung]);
}

/**
 * Haertet ein fertiges Dokument zu PDF/A-3b.
 *
 * Aufzurufen NACH allen Zeichenbefehlen und VOR `doc.save()`.
 *
 * @param {import("pdf-lib").PDFDocument} doc
 * @param {object} arg
 * @param {Uint8Array|Buffer} arg.iccBytes  das ICC-Profil
 * @param {string} arg.xmp                  das XMP-Paket (aus baueXmp)
 * @param {string} arg.kennungSaat          Saatwert fuer die /ID
 * @param {string} [arg.sprache="de-DE"]
 * @param {string} [arg.bedingung="sRGB IEC61966-2.1"]
 * @returns {{ok:true, icc:object} | {ok:false, fehler:string}}
 */
export function haerteAlsPdfA3(doc, { iccBytes, xmp, kennungSaat, sprache = "de-DE", bedingung = "sRGB IEC61966-2.1" }) {
  const icc = pruefeIccProfil(iccBytes);
  if (!icc.ok) return icc;
  if (!xmp || typeof xmp !== "string") return { ok: false, fehler: "XMP_FEHLT" };

  /* ── 1. Dokumentkennung ───────────────────────────────────────────── */
  setzeKennung(doc, kennungSaat || "tempconnect");

  /* ── 2. OutputIntent mit eingebettetem Profil ─────────────────────── */
  const iccStream = doc.context.stream(Buffer.from(iccBytes), {
    N: KANAELE[icc.colorSpace] || 3,
  });
  const iccRef = doc.context.register(iccStream);

  /* PDFString.of fuer die beiden Textfelder: `context.obj` machte daraus
     sonst PDF-Namen, und /OutputConditionIdentifier (sRGB IEC61966-2.1) traegt
     Leerzeichen und Bindestriche — als Name waere das eine andere Zeichenkette.
     /S dagegen IST ein Name, dort ist der String genau richtig. */
  const outputIntent = doc.context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of(bedingung),
    Info: PDFString.of(bedingung),
    RegistryName: PDFString.of("http://www.color.org"),
    DestOutputProfile: iccRef,
  });
  doc.catalog.set(PDFName.of("OutputIntents"), doc.context.obj([outputIntent]));

  /* ── 3. XMP ───────────────────────────────────────────────────────── */
  /* Als Buffer, nicht als String: `context.stream` wandelt Strings per
     charCodeAt, und ein Umlaut im Firmennamen waere danach kein gueltiges
     UTF-8 mehr. Unkomprimiert — das XMP-Paket soll auch ohne Werkzeug lesbar
     bleiben, und PDF/A verlangt keinen Filter darauf. */
  const xmpStream = doc.context.stream(Buffer.from(xmp, "utf8"), {
    Type: "Metadata",
    Subtype: "XML",
  });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(xmpStream));

  /* ── 4. Sprache ───────────────────────────────────────────────────── */
  doc.catalog.set(PDFName.of("Lang"), PDFString.of(sprache));

  return { ok: true, icc };
}
