/**
 * marktGeoService — der Marktplatz bekommt Koordinaten.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND (gemessen 2026-09-06, Welle N2.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Entfernungsbewertung in `matchingEngine.scoreMatch` braucht Koordinaten
 * auf BEIDEN Seiten. Fehlt eine, faellt sie auf einen Vergleich der
 * Stadt-ZEICHENKETTE zurueck — exakt geschrieben, 60 % des Ortsgewichts.
 *
 * Gemessen in der laufenden Datenbank:
 *
 *   demand_requests   40 Zeilen,  5 mit Koordinaten,  40 mit Radius
 *   capacity_posts    45 Zeilen,  7 mit Koordinaten,  45 mit Radius
 *
 * `radius_km` wird also bei JEDER Zeile erfasst und praktisch nie benutzt.
 * "Münster" und "Muenster" galten als verschiedene Orte, 3 km und 80 km als
 * derselbe. Der Grund war keine fehlende Faehigkeit, sondern eine fehlende
 * Zeile: `geoService.geocode()` gibt es seit Langem, und Registrierung, Profil
 * und Inserate benutzen es — der Marktplatz als einziger nicht.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DAS GERADE JETZT ZAEHLT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe zu Welle N (Nachtrag 2026-09-06): der Einsatzort wird
 * ausdruecklich gefragt, mit dem Hinweis "genauere Angaben erhoehen die
 * Trefferqualitaet". Dieser Satz muss WAHR sein und nicht Zierde — ohne
 * Koordinaten war er falsch: eine Postleitzahl aenderte am Ergebnis nichts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM FREITEXT UND NICHT DIE STRUKTURIERTE ABFRAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der erste Entwurf nahm `geocode(plz, ort)` — also Nominatims Felder
 * `postalcode=` und `city=` — und behauptete im Kommentar, das ergebe einen
 * Punkt IN der Stadt statt ihres Mittelpunkts. GEMESSEN AM 2026-09-06 GEGEN
 * DEN ECHTEN DIENST stimmte das nicht:
 *
 *   geocode("48143","Münster") vs geocode(null,"Münster")   0,0 km
 *   geocode("21129","Hamburg") vs geocode(null,"Hamburg")   0,0 km
 *   geocode("81929","München") vs geocode(null,"München")   0,0 km
 *   geocode("13403","Berlin")  vs geocode(null,"Berlin")    9,3 km
 *
 * Die strukturierte Abfrage ignoriert die Postleitzahl also meistens. Der
 * Hinweis "genauere Angaben erhoehen die Trefferqualitaet" waere damit in drei
 * von vier Faellen unwahr gewesen — genau die Zierde, die der Owner ausschliesst.
 *
 * Die FREITEXT-Abfrage (`q=21129 Hamburg`) loest sie auf:
 *
 *   21129 Hamburg   10,6 km von der Ortsmitte
 *   22297 Hamburg    6,4 km
 *   81929 München    7,1 km
 *   48155 Münster    3,4 km
 *
 * Deshalb: mit Postleitzahl der Freitext, ohne sie der Ort. Und wenn der
 * Freitext nichts findet, der strukturierte Weg als Rueckfall — lieber der
 * Ortsmittelpunkt als gar kein Punkt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER NIE PASSIERT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Werfen. Ein Bedarf entsteht auch ohne Koordinaten — er faellt dann auf den
 * Stadtvergleich zurueck, also auf genau das Verhalten von gestern. Eine
 * Anlage, die an einem fremden Kartendienst scheitert, waere ein Rueckschritt:
 * der Nutzer haette alles richtig gemacht und bekaeme einen Fehler.
 */

import * as geoService from "./geoService.js";

/**
 * Nur diese beiden Tabellen. Der Name fliesst in SQL ein und darf deshalb
 * niemals aus einem Aufrufer stammen, der ihn irgendwoher bekommen hat.
 */
const TABELLEN = Object.freeze({
  demand_requests: "demand_requests",
  capacity_posts: "capacity_posts"
});

/**
 * Der Punkt fuer einen Ort — ohne Datensatz, ohne Schreiben.
 *
 * N2.7: die Anlage bestimmt den Punkt jetzt BEVOR der Bedarf entsteht. Bis
 * dahin wurde er nachgetragen, und das kam zu spaet: `runInitialMatching` lief
 * vorher und rechnete den ersten Durchgang — samt der Mails an bis zu 15
 * Anbieter — noch ohne Koordinaten. Der Notdienst-Zweig kehrte sogar vor dem
 * Nachtragen zurueck und bekam nie einen Punkt.
 *
 * Dieselbe Reihenfolge wie beim Nachtragen: mit Postleitzahl der Freitext
 * (nur er loest sie auf), sonst oder ohne Treffer der strukturierte Weg.
 *
 * @returns {Promise<{lat:number,lng:number}|null>} WIRFT NIE.
 */
export async function punktFuer({ plz = null, ort = null } = {}, opt = {}) {
  const geocode = opt.geocode || geoService.geocode;
  const geocodeQuery = opt.geocodeQuery || geoService.geocodeQuery;
  try {
    if (!plz && !ort) return null;
    return plz
      ? (await geocodeQuery(ort ? `${plz} ${ort}` : String(plz))) || (await geocode(plz, ort))
      : await geocode(null, ort);
  } catch {
    return null;
  }
}

/**
 * Traegt Koordinaten nach, wenn welche zu ermitteln sind.
 *
 * Reihenfolge ist Absicht: erst pruefen, ob der Datensatz schon welche hat
 * (ein Aufrufer darf sie mitschicken), dann fragen. Ein zweiter Abruf fuer
 * etwas, das schon dasteht, waere ein Rundlauf zu einem fremden Dienst.
 *
 * Der Kartendienst wird EINGESPEIST, nicht importiert-und-ersetzt: ein
 * ES-Modul-Namensraum ist unveraenderlich, eine Probe koennte `geocode` also
 * gar nicht austauschen. Ohne diese Naht liesse sich der wichtigste Fall dieser
 * Datei — "der fremde Dienst faellt aus, die Anlage laeuft trotzdem" — nur
 * gegen das echte Nominatim pruefen, also gar nicht.
 *
 * @param {import('pg').Pool} pool
 * @param {"demand_requests"|"capacity_posts"} tabelle
 * @param {object} zeile Der eben angelegte Datensatz.
 * @param {{logger?: {warn?: Function}, geocode?: Function, geocodeQuery?: Function}} [opt]
 * @returns {Promise<object>} Die Zeile — mit Koordinaten, wenn es welche gibt,
 *          sonst unveraendert. WIRFT NIE.
 */
export async function koordinatenNachtragen(pool, tabelle, zeile, opt = {}) {
  const logger = opt.logger || null;
  const geocode = opt.geocode || geoService.geocode;
  const geocodeQuery = opt.geocodeQuery || geoService.geocodeQuery;
  try {
    const ziel = TABELLEN[tabelle];
    if (!ziel) throw new Error("MARKTGEO_TABELLE_UNGUELTIG");
    if (!zeile || !zeile.id) return zeile;

    /* Schon da: nichts zu tun. */
    if (zeile.location_lat != null && zeile.location_lng != null) return zeile;

    const plz = zeile.location_postal || null;
    const ort = zeile.location_city || null;
    if (!plz && !ort) return zeile;

    /* Dieselbe Aufloesung wie vor der Anlage — `punktFuer` ist die EINE Fassung. */
    const punkt = await punktFuer({ plz, ort }, { geocode, geocodeQuery });
    if (!punkt) return zeile;

    const { rows } = await pool.query(
      `UPDATE ${ziel}
          SET location_lat = $2, location_lng = $3
        WHERE id = $1
          AND location_lat IS NULL
          AND location_lng IS NULL
        RETURNING *`,
      [zeile.id, punkt.lat, punkt.lng]
    );
    /* `AND location_lat IS NULL`: zwischen Lesen und Schreiben kann jemand
       anderes Koordinaten gesetzt haben. Dann gilt seine Angabe, nicht die
       nachtraegliche Schaetzung — und `rows` ist leer. */
    return rows[0] || zeile;
  } catch (e) {
    if (logger?.warn) {
      logger.warn({ err: e?.message, tabelle }, "Koordinaten nicht nachgetragen — der Datensatz bleibt gueltig");
    }
    return zeile;
  }
}

export const _TABELLEN = TABELLEN;
