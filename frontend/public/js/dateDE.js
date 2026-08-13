/**
 * dateDE — Kalendertag in Europe/Berlin, fuer den Browser.
 *
 * WARUM ES DIESE DATEI GIBT
 * `new Date().toISOString().slice(0,10)` liefert den Kalendertag in **UTC**.
 * Deutschland liegt eine bis zwei Stunden davor — zwischen 00:00 und 02:00
 * Ortszeit ist das also der Vortag. Der Owner hat es am Einsatzportal gemeldet:
 * dort stand Mittwoch, obwohl Dienstag war.
 *
 * Noch haeufiger ist der zweite Fall: ein Datum, das bereits auf **lokale**
 * Mitternacht gesetzt wurde (etwa durch `setHours(0,0,0,0)` oder aus einer
 * DATE-Spalte), wird per `toISOString()` nach UTC zurueckgerechnet — lokale
 * Mitternacht Berlin ist 22:00/23:00 UTC des Vortags. Dieser Fall ist
 * **ganztaegig** falsch, nicht nur nachts.
 *
 * Das Gegenstueck im Backend ist api/utils/dateDE.js. Die Regel ist dieselbe:
 * fuer fachliche, nutzersichtbare Kalendertage IMMER diese Helfer benutzen —
 * nie den rohen UTC-Schnitt.
 *
 * NICHT verwenden fuer technische UTC-Zeitpunkte (Zeitstempel, Idempotenz-
 * Schluessel, Analytics-Buckets). Dort ist UTC richtig und gewollt.
 *
 * Eingebunden ueber <script src="/public/js/dateDE.js"></script>, verfuegbar
 * als window.TCDate.
 */
(function (global) {
  "use strict";

  var ZONE = "Europe/Berlin";

  /*
   * "sv-SE" liefert bereits das Format JJJJ-MM-TT — das erspart eigenes
   * Zusammensetzen und damit eine weitere Fehlerquelle.
   */
  var fmt = null;
  function formatter() {
    if (!fmt) {
      fmt = new Intl.DateTimeFormat("sv-SE", {
        timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit"
      });
    }
    return fmt;
  }

  /**
   * Kalendertag eines Zeitpunkts in Europe/Berlin, als JJJJ-MM-TT.
   * Gibt null zurueck, wenn der Wert kein gueltiges Datum ist — ein erfundener
   * Tag waere schlimmer als eine ehrliche Luecke.
   */
  function isoDateDE(value) {
    if (value === null || value === undefined || value === "") return null;

    // Ein bereits reiner Datumsstring wird NICHT umgerechnet: er traegt keine
    // Uhrzeit, also gibt es nichts zu verschieben.
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    var d = (value instanceof Date) ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return formatter().format(d);
  }

  /** Heutiger Kalendertag in Europe/Berlin, als JJJJ-MM-TT. */
  function todayDE() {
    return formatter().format(new Date());
  }

  /**
   * Montag der Woche, in der `value` liegt — als JJJJ-MM-TT in Berliner Zeit.
   *
   * Wird getrennt angeboten, weil die Wochenberechnung der haeufigste Ort des
   * Fehlers ist: erst `setHours(0,0,0,0)` (lokal), dann `toISOString()` (UTC)
   * ergibt zuverlaessig den Vortag — und damit die falsche Woche.
   */
  function mondayDE(value) {
    var iso = isoDateDE(value || new Date());
    if (!iso) return null;
    var teile = iso.split("-");
    // Mittags-UTC als Anker: so kann keine Zeitzonenverschiebung den Tag kippen.
    var d = new Date(Date.UTC(+teile[0], +teile[1] - 1, +teile[2], 12, 0, 0));
    var wochentag = d.getUTCDay();             // 0 = Sonntag
    var versatz = (wochentag === 0 ? -6 : 1 - wochentag);
    d.setUTCDate(d.getUTCDate() + versatz);
    return d.toISOString().slice(0, 10);
  }

  /** Tage auf einen Kalendertag addieren, ohne Zeitzonen-Drift. */
  function addDaysDE(isoDatum, tage) {
    if (!isoDatum) return null;
    var teile = String(isoDatum).slice(0, 10).split("-");
    var d = new Date(Date.UTC(+teile[0], +teile[1] - 1, +teile[2], 12, 0, 0));
    d.setUTCDate(d.getUTCDate() + (tage || 0));
    return d.toISOString().slice(0, 10);
  }

  global.TCDate = {
    isoDateDE: isoDateDE,
    todayDE:   todayDE,
    mondayDE:  mondayDE,
    addDaysDE: addDaysDE
  };
})(window);
