/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EINE WAHRHEIT DARÜBER, WAS „IM POOL" HEISST (U6.2a)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Entscheid 2026-10-01: eine Konditionskarte darf nur auf Firmen aus dem
 * EIGENEN Lieferantenpool zeigen. U6.2 hat die Regel gebaut — in `istLieferantImPool`,
 * als eigener Abfragetext.
 *
 * WARUM DIESES MODUL ÜBERHAUPT ENTSTEHT. U6.2a braucht dieselbe Bedingung an
 * einer ZWEITEN Stelle: die Liste der Konditionskarten soll je Karte sagen, ob
 * ihr Lieferant heute im Pool steht (für den sichtbaren Hinweis an der
 * Altkarte). Diese Bedingung dort ein zweites Mal von Hand hinzuschreiben wäre
 * genau die Fehlerklasse, mit der diese Woche angefangen hat: **zwei Wahrheiten
 * über demselben Feld.** Gemessen ist sie in dieser Welle schon zweimal
 * aufgetreten —
 *
 *   - `assignmentService` prüft die Poolzugehörigkeit OHNE `valid_from`,
 *     `istLieferantImPool` MIT. Ein vordatierter Eintrag gilt dort schon heute
 *     als Partnerschaft, hier nicht. Der Befund liegt beim Owner.
 *   - `isInPool` steht unbenutzt daneben und prüft WENIGER: kein Fenster, keine
 *     Sperre. Wer es findet, hält es für die Pool-Prüfung.
 *
 * Dritte und vierte Fassung werden hier nicht entstehen. Der Text kommt aus
 * EINER Funktion, und eine Probe hält fest, dass niemand ihn von Hand
 * nachbildet.
 *
 * WAS „IM POOL" HEISST — gemessen, nicht am Namen geraten:
 *
 *   status  nur 'active'. Die Tabelle erlaubt auch 'suspended' und 'removed'
 *           (CHECK); eine stillgelegte oder entfernte Zugehörigkeit ist keine.
 *   tier    NICHT 'BLOCKED'. Ein gesperrter Lieferant STEHT im Pool,
 *           ausdrücklich gesperrt — mit ihm Konditionen zu vereinbaren wäre
 *           widersinnig. Die übrigen Stufen sind Abstufungen, keine Sperren.
 *   Fenster valid_from/valid_until sind nullbar und heissen dann „unbegrenzt".
 *           Gilt ein Fenster, muss der Stichtag darin liegen.
 *
 * DAS DATUM GEBEN DIE AUFRUFER, und sie geben es aus `todayDE()` — nie aus
 * einem rohen UTC-Schnitt (DACH-Direktive: nach 22 Uhr deutscher Zeit liegt der
 * einen Tag zurück und weist am Randtag das Richtige ab). Dieses Modul nimmt
 * deshalb einen Platzhalter oder einen SQL-Ausdruck, aber niemals ein Datum aus
 * eigener Berechnung: ein Modul, das sich sein „heute" selbst holt, kann von
 * einer Probe nicht festgenagelt werden.
 */

/* Nur Bezeichner, die wir selbst schreiben - keine Nutzereingabe. Die Prüfung
   ist trotzdem da, weil der nächste Aufrufer das nicht wissen kann. */
const BEZEICHNER = /^[a-z_][a-z0-9_]*$/i;
/* Spalten dürfen qualifiziert sein (rc.supplier_org_id), Platzhalter sind $n,
   und CURRENT_DATE ist der einzige erlaubte Ausdruck ohne Bindung. */
const AUSDRUCK = /^(\$\d+(::\w+)?|[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?|CURRENT_DATE)$/i;

export const POOL_AKTIVER_STATUS = "active";
export const POOL_GESPERRTE_STUFE = "BLOCKED";

function pruefe(name, wert, muster) {
  const s = String(wert ?? "");
  if (!muster.test(s)) throw new Error("POOL_SQL_UNGUELTIG: " + name + "=" + s);
  return s;
}

/**
 * Die AND-verknüpften Bedingungen, OHNE führendes AND und ohne FROM.
 *
 * @param {object} opts
 * @param {string} opts.kunde      Spalte oder Platzhalter für client_org_id
 * @param {string} opts.lieferant  Spalte oder Platzhalter für supplier_org_id
 * @param {string} opts.datum      Platzhalter oder CURRENT_DATE als Stichtag
 * @param {string} [opts.alias]    Tabellenalias, Vorgabe "vp"
 */
export function poolBedingungenSql(opts = {}) {
  const alias = pruefe("alias", opts.alias ?? "vp", BEZEICHNER);
  const kunde = pruefe("kunde", opts.kunde, AUSDRUCK);
  const lieferant = pruefe("lieferant", opts.lieferant, AUSDRUCK);
  const datum = pruefe("datum", opts.datum, AUSDRUCK);
  const tag = /^\$\d+$/.test(datum) ? datum + "::date" : datum;
  return `${alias}.client_org_id = ${kunde}
        AND ${alias}.supplier_org_id = ${lieferant}
        AND ${alias}.status = '${POOL_AKTIVER_STATUS}'
        AND ${alias}.tier <> '${POOL_GESPERRTE_STUFE}'
        AND (${alias}.valid_from IS NULL OR ${alias}.valid_from <= ${tag})
        AND (${alias}.valid_until IS NULL OR ${alias}.valid_until >= ${tag})`;
}

/**
 * Dieselbe Bedingung als EXISTS - für Abfragen, die je Zeile ein Ja/Nein
 * brauchen (die Liste der Konditionskarten).
 */
export function poolMitgliedschaftExistsSql(opts = {}) {
  const alias = pruefe("alias", opts.alias ?? "vp", BEZEICHNER);
  return `EXISTS (
            SELECT 1 FROM vendor_pool ${alias}
             WHERE ${poolBedingungenSql({ ...opts, alias })}
          )`;
}
