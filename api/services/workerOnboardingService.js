/**
 * Aufnahme-Fortschritt einer Einsatzkraft — eine Wahrheit, vier Schritte
 * (Multi-Skill Welle 2).
 *
 * WARUM DAS IM BACKEND STEHT UND NICHT IN DER SEITE
 * Der Assistent zeigt einen Fortschritt, das Portal-Dashboard einen Hinweis "Profil
 * unvollstaendig", und die Disposition will wissen, wer einsatzbereit ist. Waere die
 * Regel in der Seite kodiert, gaebe es drei Antworten auf dieselbe Frage — und sie
 * wuerden auseinanderlaufen, sobald jemand ein Feld ergaenzt. Hier ist sie einmal.
 *
 * WAS "VOLLSTAENDIG" HEISST — und was bewusst nicht
 * Pflicht ist nur, was fuer eine Vermittlung wirklich gebraucht wird:
 *   Person       — Name und Erreichbarkeit. Ohne Telefon ist niemand disponierbar.
 *   Faehigkeiten — mindestens eine. Ohne Skill erzeugt der Angebotsgenerator nichts.
 *   Verfuegbarkeit — beantwortet, was sich nicht herleiten liess.
 *   Nachweise    — EMPFOHLEN, nicht Pflicht.
 *
 * Die Nachweise sind bewusst kein Pflichtschritt: welche Papiere noetig sind, haengt an
 * Branche und Einsatz (Gesundheitszeugnis, Fahrerlaubnis, Aufenthaltstitel). Eine feste
 * Liste waere fuer die Haelfte der Kunden falsch und wuerde die Aufnahme blockieren.
 * Sie zaehlen in den Fortschritt hinein, verhindern aber keine Einsatzbereitschaft.
 */

import * as availabilitySvc from "./workerAvailabilityService.js";

/** Reihenfolge = Reihenfolge im Assistenten. `pflicht` steuert die Einsatzbereitschaft. */
export const SCHRITTE = Object.freeze([
  { key: "person",        titel: "Persoenliche Daten", pflicht: true },
  { key: "skills",        titel: "Faehigkeiten",       pflicht: true },
  { key: "availability",  titel: "Verfuegbarkeit",     pflicht: true },
  { key: "documents",     titel: "Nachweise",          pflicht: false }
]);

/** Ohne diese Angaben ist niemand disponierbar. */
const PERSON_PFLICHTFELDER = ["first_name", "last_name", "phone"];

function fehlendeFelder(profil, felder) {
  return felder.filter((f) => {
    const v = profil?.[f];
    return v === null || v === undefined || String(v).trim() === "";
  });
}

/**
 * Ermittelt den Aufnahme-Fortschritt.
 *
 * @param {import('pg').Pool} pool
 * @param {object} profil Ergebnis von `workerService.getWorkerProfile`
 * @returns {Promise<{
 *   schritte: Array<{key,titel,pflicht,erledigt:boolean,offen:string[],hinweis:string|null}>,
 *   erledigt_pflicht: number, gesamt_pflicht: number,
 *   fortschritt_prozent: number, einsatzbereit: boolean,
 *   naechster_schritt: string|null
 * }>}
 */
export async function getOnboardingProgress(pool, profil) {
  if (!profil?.id) return null;

  // Alle Abfragen sind unabhaengig — parallel statt nacheinander.
  const [{ rows: skillZeilen }, { rows: dokZeilen }, verfuegbarkeit, { rows: einsatzZeilen }] = await Promise.all([
    pool.query("SELECT 1 FROM worker_profile_skills WHERE worker_profile_id = $1 LIMIT 1", [profil.id]),
    pool.query(
      `SELECT 1 FROM worker_profile_documents
        WHERE worker_user_id = $1 AND (status IS NULL OR status <> 'archived') LIMIT 1`,
      [profil.user_id]
    ),
    availabilitySvc.resolveAvailability(pool, profil.id),
    // Hat diese Kraft jemals einen Einsatz gehabt? Entscheidet, ob die Aufnahme
    // verbindlich sein DARF — siehe zugang_beschraenkt weiter unten.
    pool.query("SELECT 1 FROM worker_assignment_links WHERE worker_user_id = $1 LIMIT 1", [profil.user_id])
  ]);

  const personOffen = fehlendeFelder(profil, PERSON_PFLICHTFELDER);
  const verfuegbarkeitOffen = verfuegbarkeit?.offene_fragen || [];

  const schritte = [
    {
      ...SCHRITTE[0],
      erledigt: personOffen.length === 0,
      offen: personOffen,
      hinweis: null
    },
    {
      ...SCHRITTE[1],
      erledigt: skillZeilen.length > 0,
      offen: skillZeilen.length > 0 ? [] : ["skills"],
      hinweis: skillZeilen.length > 0 ? null : "Ohne Faehigkeit entstehen keine Angebote."
    },
    {
      ...SCHRITTE[2],
      erledigt: verfuegbarkeitOffen.length === 0,
      offen: verfuegbarkeitOffen,
      // Der Kern von Welle 2: sagen, was das System schon weiss, statt leere Felder zu zeigen.
      hinweis: verfuegbarkeitOffen.length === 0 && verfuegbarkeit
        ? herkunftsHinweis(verfuegbarkeit)
        : null
    },
    {
      ...SCHRITTE[3],
      erledigt: dokZeilen.length > 0,
      offen: dokZeilen.length > 0 ? [] : ["documents"],
      hinweis: "Empfohlen — welche Nachweise noetig sind, haengt vom Einsatz ab."
    }
  ];

  const pflicht = schritte.filter((s) => s.pflicht);
  const erledigtPflicht = pflicht.filter((s) => s.erledigt).length;

  // Der Fortschritt zaehlt ALLE Schritte, die Einsatzbereitschaft nur die Pflichtschritte.
  // Sonst zeigte der Balken 100 %, waehrend die Nachweise noch fehlen — oder er blieb bei
  // 75 % stehen, obwohl die Kraft laengst disponierbar ist.
  const erledigtGesamt = schritte.filter((s) => s.erledigt).length;

  const einsatzbereit = erledigtPflicht === pflicht.length;
  const hatteEinsatz = einsatzZeilen.length > 0;

  return {
    schritte,
    erledigt_pflicht: erledigtPflicht,
    gesamt_pflicht: pflicht.length,
    fortschritt_prozent: Math.round((erledigtGesamt / schritte.length) * 100),
    einsatzbereit,
    /**
     * Darf das Portal die Aufnahme VERBINDLICH machen (Owner-Freigabe 2026-08-06)?
     *
     * Nur fuer Kraefte, die noch nie einen Einsatz hatten. Der Unterschied ist
     * kein Detail, sondern der Unterschied zwischen "unfertiges Profil" und
     * "kommt nicht an sein Geld": Wer bereits gearbeitet hat, muss seinen
     * Stundenzettel einreichen koennen — auch mit halbem Profil. Eine Sperre
     * wuerde ihn von einer PFLICHT abschneiden, nicht von einem Angebot.
     *
     * Frisch Eingeladene verlieren dagegen nichts: fuer sie ist das Portal ohne
     * Faehigkeiten ohnehin leer, und genau dort wirkt die Fuehrung.
     */
    zugang_beschraenkt: !einsatzbereit && !hatteEinsatz,
    naechster_schritt: schritte.find((s) => !s.erledigt)?.key || null
  };
}

/** Klartext daraus machen, woher die Verfuegbarkeit stammt. */
function herkunftsHinweis(v) {
  const abgeleitet = Object.entries(v.herkunft || {})
    .filter(([, q]) => q === availabilitySvc.HERKUNFT.ABGELEITET)
    .map(([feld]) => feld);
  if (!abgeleitet.length) return null;
  return v.belegt_bis
    ? `Aus dem Einsatz bis ${v.belegt_bis} uebernommen — bei Bedarf anpassen.`
    : "Aus den bisherigen Einsaetzen uebernommen — bei Bedarf anpassen.";
}
