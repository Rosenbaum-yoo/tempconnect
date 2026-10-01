/**
 * Freischalt-Hebel — die Schalter, die TempConnect je Kunde oder plattformweit
 * umlegen kann, und NUR diese (W-E10, 2026-10-01).
 *
 * WARUM ES DIESE LISTE GIBT
 *
 * `feature_overrides` nimmt jeden beliebigen Schluessel an. Das Admin Panel bot
 * deshalb alle Schluessel aus `planFeatures.js` zur Auswahl — gemessen am
 * 2026-10-01 liest aber genau EINE Stelle im ganzen Code diese Tabelle:
 * `checkOverride` in `services/dealStaffingFastTrackService.js`. Jeder andere
 * Schluessel landete in der Liste, sah aus wie eine Freischaltung und bewirkte
 * nichts. Ein Owner, der "spend_analytics fuer Kunde X freischalten" waehlt,
 * glaubt danach etwas, das nicht stimmt — das Versehen, vor dem CLAUDE.md
 * ("Das Team ist eine Person") ausdruecklich warnt.
 *
 * Darum gilt: angeboten wird nur, was hier steht, und hier steht nur, was ein
 * Verbraucher im Code wirklich liest. `api/test/freischaltungen.test.js` haelt
 * beide Richtungen fest — jeder Hebel hat einen Leser, jeder Leser einen Hebel.
 *
 * Ein neuer Hebel braucht also zuerst Code, der ihn liest; danach eine Zeile hier.
 */

export const FREISCHALT_HEBEL = Object.freeze({
  staffing_ready_fast_track: Object.freeze({
    name: "Besetzungs-Schnellweg",
    wirkung:
      "Ist ein Deal vereinbart und sind noch Plätze offen, bekommen die Disponenten der " +
      "Zeitarbeitsfirma eine Benachrichtigung mit direktem Link zum Besetzen.",
    aus_bedeutet:
      "Die Benachrichtigung entfällt. Besetzt wird wie gewohnt über Deals & Einsätze.",
    // Ohne Eintrag gilt: an. So entscheidet `isStaffingFastTrackEnabled`.
    standard: true,
    // Der Hebel wirkt bei der Zeitarbeitsfirma (supplier_org_id). Eine Ausnahme
    // fuer ein Unternehmen waere wirkungslos — und wird deshalb abgelehnt.
    seite: "agency",
    leser: "services/dealStaffingFastTrackService.js"
  })
});

/**
 * Eine Ausnahme fuer EINEN Kunden verfaellt — sie gilt hoechstens ein Jahr und
 * braucht immer ein Ende. "Verfall statt Dauerzustand" (CLAUDE.md, Abschnitt
 * "Das Team ist eine Person"): eine vergessene Ausnahme ist sonst eine stille
 * Dauerregel, die niemand mehr begruendet. Der plattformweite Schalter darf
 * unbefristet sein — er IST die Regel.
 */
export const MAX_TAGE_JE_AUSNAHME = 366;

export function hebel(key) {
  return Object.prototype.hasOwnProperty.call(FREISCHALT_HEBEL, key) ? FREISCHALT_HEBEL[key] : null;
}
